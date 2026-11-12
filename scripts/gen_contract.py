"""Contract fixtures from the REAL Python host (fake `orca`, tests/fakes.py) for ui/tests/contract.test.ts.

Each scenario is a list of steps. A step is what reached the host (`in`: a page message, or
`{"lifecycle": <event>, ...}`) and every message the host posted back (`out`), in order. The UI suite
replays them through the real bridge and store. Output is deterministic (fixed clock, scrubbed paths).

    python3 scripts/gen_contract.py          # rewrite tests/contract/*.json
    python3 scripts/gen_contract.py --check  # exit 1 when the committed files differ
"""

import base64
import io
import json
import logging
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "contract"
FIX = ROOT / "tests" / "fixtures"
sys.path.insert(0, str(ROOT / "tests"))

from fakes import LifecycleEvent as LE, LifecycleEvtCode as Code, ctx, install_orca, load_plugin  # noqa: E402

NOW = "2026-11-10T12:00:00Z"
STORAGE = "/orca-data/orca_plugins/plugin_data/orca_print_calculator"  # stands in for the temp storage dir
TEMP = "/orca-temp"  # stands in for the temp G-code dir
INPUTS = OUT / "inputs"

SPOOLMAN = {
    "/api/v1/info": {"version": "0.22.1"},
    "/api/v1/setting/currency": {"value": '"BRL"', "is_set": True},
    "/api/v1/filament": [
        {"id": 3, "name": "PLA+ White", "vendor": {"name": "eSun"}, "material": "PLA", "price": 89.9, "weight": 1000,
         "color_hex": "ffffff"},
        {"id": 12, "name": "PETG Blue", "vendor": {"name": "Overture"}, "material": "PETG", "price": 119,
         "weight": 1000, "color_hex": "2E6FBF"},
        {"id": 20, "name": "TPU 95A", "vendor": None, "material": "TPU", "price": None, "weight": 500,
         "color_hex": None},
    ],
    "/api/v1/spool?allow_archived=false": [
        {"id": 1, "filament": {"id": 3}, "price": 95.0, "initial_weight": 1000, "remaining_weight": 412.5,
         "archived": False,
         "last_used": "2026-11-01T10:00:00Z"},  # spool price overrides filament price
        {"id": 2, "filament": {"id": 12}, "price": None, "initial_weight": 1000, "remaining_weight": 0, "archived": False,
         "last_used": None},
        {"id": 3, "filament": {"id": 3}, "price": 70.0, "initial_weight": 1000, "archived": True,
         "last_used": "2026-12-01T10:00:00Z"},  # archived: must not win though it is newer
        {"id": 4, "filament_id": "x"},  # malformed row: skipped by the host
    ],
}


class Resp:
    def __init__(self, url, body):
        self.url, self.raw = url, json.dumps(body).encode()

    def geturl(self):
        return self.url

    def read(self, n=-1):
        out, self.raw = (self.raw, b"") if n < 0 else (self.raw[:n], self.raw[n:])
        return out

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def opener(error=None):
    def fn(req, timeout=None):
        if error is not None:
            raise error
        url = req.full_url
        return Resp(url, SPOOLMAN[url[url.index("/api/"):]])
    return fn


def sliced_3mf(slice_info=None, project=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        if slice_info is not None:
            z.writestr("Metadata/slice_info.config", slice_info)
        if project is not None:
            z.writestr("Metadata/project_settings.config", json.dumps(project))
        z.writestr("3D/3dmodel.model", "<model/>")
    return buf.getvalue()


def import_3mf():
    """A small `.gcode.3mf` as Orca's "Export all sliced file" writes it (slice_info + project settings)."""
    project = {"filament_settings_id": ["Bambu PLA Basic @BBL X1C", "Generic PETG"], "filament_cost": ["25.5", "0"],
               "filament_notes": ["Spoolman filament 7", ""], "filament_colour": ["#FF0000", "#00FF00"],
               "filament_type": ["PLA", "PETG"]}
    return sliced_3mf((FIX / "synthetic_slice_info.xml").read_text("utf-8"), project)


def b64(data):
    return base64.b64encode(data).decode()


class Run:
    """One fresh host + fake orca. `steps` records what went in and everything the host posted."""

    def __init__(self, spooler=False, saved=False):
        self.orca = install_orca()
        self.storage = Path(self.orca.storage_dir)
        self.datadir = self.storage.parents[2]
        self.tmp = Path(tempfile.mkdtemp())
        if spooler:
            (self.datadir / "spooler").mkdir()
            (self.datadir / "spooler" / "spooler_settings.json").write_text(
                json.dumps({"spoolman_url": "http://192.168.1.10:7912"}))
            (self.datadir / "spooler" / "profiles.json").write_text(
                json.dumps({"filaments": {"3": {"U1": "Generic PLA @U1"}, "12": {"U1": "Generic PETG (#12)"}}}))
        if saved:
            shutil.copy(INPUTS / "settings.json", self.storage / "settings.json")
            shutil.copy(INPUTS / "quotes.json", self.storage / "quotes.json")
        self.pkg = load_plugin(ROOT / "src")
        self.host = self.pkg.host
        self.host._now = lambda: NOW
        self.host.TEMP_MODEL_DIR = str(self.tmp)  # stands in for Orca's temp model tree
        self.page = self.pkg.CalculatorPage()
        self.page.on_load()
        self.steps = []
        self.seen = 0

    def close(self):
        log = logging.getLogger("orca_print_calculator")
        for h in list(log.handlers):
            h.close()
            log.removeHandler(h)
        shutil.rmtree(self.tmp, ignore_errors=True)
        shutil.rmtree(self.storage.parents[3], ignore_errors=True)

    def record(self, inbound):
        out = self.page.posted[self.seen:]
        self.seen = len(self.page.posted)
        self.steps.append({"in": inbound, "out": out})
        return out

    def send(self, msg, wait=False):
        self.page.on_message(msg)
        if wait:  # spoolman_fetch answers from its own thread
            end = time.time() + 5
            while not any(m.get("type") == "res" and m.get("id") == msg["id"] for m in self.page.posted[self.seen:]):
                if time.time() > end:
                    raise SystemExit("no answer to %s" % msg)
                time.sleep(0.005)
        return self.record(msg)

    def cmd(self, cmd, args=None, id=1, wait=False):
        return self.send({"type": "cmd", "id": id, "cmd": cmd, "args": {} if args is None else args}, wait)

    def lifecycle(self, event, **kw):
        self.page.on_lifecycle_event(event, ctx(**kw))
        return self.record({"lifecycle": event.name, **{k: getattr(v, "name", v) for k, v in kw.items()}})

    def slice(self, plate, head, tail, text=None):
        """Worker-thread GCodeExportFinished then UI-thread SlicingJobComplete (docs/spike.md §2).
        `head`/`tail` name fixture files; `text` instead writes that G-code verbatim."""
        self.orca.state["plate"] = plate
        path = self.tmp / (".%d.0.gcode" % plate)
        if text is None:
            path.write_bytes((FIX / head).read_bytes() + b"\n" * 10000 + (FIX / tail).read_bytes())
        else:
            path.write_text(text, "utf-8")
        t = threading.Thread(target=self.page.on_lifecycle_event, args=(LE.GCodeExportFinished, ctx(msg=str(path))))
        t.start()
        t.join()
        self.record({"lifecycle": "GCodeExportFinished", "plate": plate, "gcode": [head, tail] if text is None else text})
        return self.lifecycle(LE.SlicingJobComplete, code=Code.Ok)

    def result(self):
        text = json.dumps(self.steps, default=str, ensure_ascii=False)
        text = text.replace(str(self.storage), STORAGE).replace(str(self.tmp), TEMP)
        if self.orca.violations:
            raise SystemExit("orca called off the UI thread: %s" % self.orca.violations)
        return json.loads(text)


U1_P1 = ("snapmaker_u1_temp_plate1.head.txt", "snapmaker_u1_temp_plate1.tail.txt")
U1_5H = ("snapmaker_u1_export_5h.head.txt", "snapmaker_u1_export_5h.tail.txt")
BBL = ("synthetic_bbl_head.txt", "synthetic_bbl_tail.txt")


def scenario(fn, **kw):
    run = Run(**kw)
    try:
        fn(run)
        return run.result()
    finally:
        run.close()


def first_run(r):
    r.send({"type": "ready"})
    r.cmd("get_state")


def unreadable_quotes(r):
    """quotes.json corrupt and impossible to set aside: get_state still loads, flags it, and saves are refused."""
    from unittest import mock
    shutil.copy(INPUTS / "settings.json", r.storage / "settings.json")
    (r.storage / "quotes.json").write_text("{not json", "utf-8")
    with mock.patch("os.replace", side_effect=PermissionError("locked")):
        r.cmd("get_state")
    r.cmd("save_quotes", {"quotes": []}, id=2)


def saved_spooler(r):
    r.send({"type": "ready"})
    r.cmd("get_state")
    settings = json.loads((INPUTS / "settings.json").read_text("utf-8"))
    r.cmd("save_settings", {"settings": {**settings, "language": "en"}}, id=2)
    r.cmd("get_state", id=3)


def slice_single(r):
    r.cmd("get_state")
    r.slice(0, *U1_P1)


def slice_all(r):
    """Three plates, one job per plate; then stale, delete, preset change, project open."""
    r.cmd("get_state")
    for plate, files in enumerate((U1_P1, U1_5H, U1_P1)):
        r.slice(plate, *files)
    r.cmd("get_state", id=2)
    r.lifecycle(LE.ObjectTransformed, msg="moved")
    r.lifecycle(LE.ObjectChanged, msg="geometry")  # already stale: nothing posted
    r.slice(1, *U1_5H)  # re-slice clears stale on that plate only
    r.lifecycle(LE.PlateDeleted, index=1)
    r.orca.state["printer"] = {"printer_model": "Bambu Lab X1 Carbon", "printer_vendor": "BBL"}
    r.lifecycle(LE.PresetSelected, msg="printer", name="Bambu Lab X1 Carbon 0.4 nozzle")
    r.lifecycle(LE.PlateCreated)  # no move/reorder event exists: a new plate flags everything stale
    r.orca.state["project"] = "/Users/x/Projects/Gridfinity bins.3mf"
    r.lifecycle(LE.ProjectOpened)
    r.lifecycle(LE.ProjectClosed)


def slice_bambu(r):
    r.orca.state["printer"] = {"printer_model": "Bambu Lab X1 Carbon", "printer_vendor": "BBL"}
    r.cmd("get_state")
    r.slice(0, *BBL)
    # G-code with no time line and no [g] series: seconds and grams must arrive as null, never 0
    r.slice(1, None, None, text="; generated by a post-processor\nG1 X0\n; filament used [mm] = 120.50\n")


def slice_no_consumption(r):
    """Time without usable filament data: never free material. Missing, confirmed zero, a total with no per-slot split, known."""
    r.cmd("get_state")
    time_line = "; estimated printing time (normal mode) = 1h 0m 0s\n"
    r.slice(0, None, None, text=time_line)
    r.slice(1, None, None, text="; filament used [g] = 0.00, 0.00\n" + time_line)
    r.slice(2, None, None, text="; total filament used [g] = 12.50\n" + time_line)
    r.slice(3, None, None, text="; filament used [g] = 4.20, 0.00\n" + time_line)


def spoolman(r):
    r.host.opener = opener()
    r.cmd("spoolman_fetch", {"url": "http://192.168.1.10:7912"}, id=1, wait=True)
    r.host.opener = opener(urllib.error.URLError(ConnectionRefusedError("refused")))
    r.cmd("spoolman_fetch", {"url": "http://192.168.1.10:7912"}, id=2, wait=True)
    r.host.opener = opener(urllib.error.HTTPError("http://h/api/v1/info", 503, "down", {}, None))
    r.cmd("spoolman_fetch", {"url": "http://192.168.1.10:7912"}, id=3, wait=True)
    r.host.opener = opener(urllib.error.URLError(TimeoutError("slow")))
    r.cmd("spoolman_fetch", {"url": "http://192.168.1.10:7912"}, id=4, wait=True)
    r.cmd("spoolman_fetch", {"url": "ftp://nas"}, id=5)
    r.host.opener = lambda req, timeout=None: Resp("http://elsewhere.example/api/v1/info", {})
    r.cmd("spoolman_fetch", {"url": "http://192.168.1.10:7912"}, id=6, wait=True)
    r.host.opener = opener(urllib.error.URLError(PermissionError("audit")))
    r.cmd("spoolman_fetch", {"url": "http://192.168.1.10:7912"}, id=7, wait=True)
    endless = Resp("http://192.168.2.20:7912/api/v1/info", {})
    endless.read = lambda n=-1: b"x" * max(n, 1)  # body past the 20 MB cap
    r.host.opener = lambda req, timeout=None: endless
    r.cmd("spoolman_fetch", {"url": "http://192.168.2.20:7912"}, id=8, wait=True)


def import_sliced(r):
    big = "<config>" + " " * (5 * 1024 * 1024) + "</config>"
    cases = [
        ("desk.gcode.3mf", b64(import_3mf())),
        ("x.gcode.3mf", b64(b"not a zip")),
        ("plain.3mf", b64(sliced_3mf(project={}))),
        ("x.gcode.3mf", "A" * (r.host.B64_CAP + 4)),
        ("x.gcode.3mf", "@@@not base64"),
        ("x.gcode.3mf", b64(sliced_3mf("<config><plate>"))),
        ("x.gcode.3mf", b64(sliced_3mf(big))),
    ]
    for i, (name, data) in enumerate(cases, start=1):
        r.page.on_message({"type": "cmd", "id": i, "cmd": "import_sliced", "args": {"name": name, "b64": data}})
        # inputs are big; the fixture keeps a short stand-in for b64
        r.record({"type": "cmd", "id": i, "cmd": "import_sliced", "args": {"name": name, "b64": "<%d chars>" % len(data)}})


def export_misc(r):
    csv = "no,title,customer\r\n42,Desk organizer,Ana Souza\r\n"
    r.cmd("save_quotes", {"quotes": json.loads((INPUTS / "quotes.json").read_text("utf-8"))}, id=0)
    r.cmd("export_file", {"name": "quote-0042.csv", "text": csv}, id=1)
    r.cmd("export_file", {"name": "../evil.sh", "text": "x"}, id=2)
    r.cmd("nope", {}, id=3)
    r.cmd("save_quotes", {"quotes": "not a list"}, id=4)
    huge = [{"note": "x" * r.host.core.STORE_SAVE_CAP}]  # over the save cap: refused, quotes.json untouched
    r.page.on_message({"type": "cmd", "id": 6, "cmd": "save_quotes", "args": {"quotes": huge}})
    r.record({"type": "cmd", "id": 6, "cmd": "save_quotes", "args": {"quotes": "<%d-byte quote list>" % len(huge[0]["note"])}})

    def boom(host, args, rid):
        raise RuntimeError("handler bug")
    r.host.COMMANDS["get_state"] = boom
    try:
        r.cmd("get_state", id=5)
    finally:
        r.host.COMMANDS["get_state"] = r.host.cmd_get_state


SCENARIOS = {
    "first_run": (first_run, {}),
    "saved_spooler": (saved_spooler, {"spooler": True, "saved": True}),
    "slice_single": (slice_single, {}),
    "slice_all": (slice_all, {}),
    "slice_bambu": (slice_bambu, {}),
    "slice_no_consumption": (slice_no_consumption, {}),
    "spoolman": (spoolman, {}),
    "unreadable_quotes": (unreadable_quotes, {}),
    "import_sliced": (import_sliced, {}),
    "export_misc": (export_misc, {}),
}


def generate():
    return {name: scenario(fn, **kw) for name, (fn, kw) in SCENARIOS.items()}


def dump(steps):
    return json.dumps(steps, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def main(argv):
    fresh = generate()
    if "--check" in argv:
        stale = [n for n, s in fresh.items() if not (OUT / (n + ".json")).is_file()
                 or (OUT / (n + ".json")).read_text("utf-8") != dump(s)]
        print("contract fixtures stale: %s" % stale if stale else "contract fixtures up to date")
        return 1 if stale else 0
    OUT.mkdir(exist_ok=True)
    for name, steps in fresh.items():
        (OUT / (name + ".json")).write_text(dump(steps), "utf-8")
    print("wrote %d scenarios to %s" % (len(fresh), OUT.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
