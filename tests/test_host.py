"""Host tests against a fake `orca` (tests/fakes.py). Run: python3 -m unittest discover tests"""
import base64
import io
import json
import logging
import os
import shutil
import tempfile
import threading
import time
import unittest
import urllib.error
import zipfile
from pathlib import Path

from fakes import LifecycleEvent as LE, LifecycleEvtCode as Code, Preset, ctx, install_orca, load_plugin

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures"
SRC = ROOT / "src"

# Field lists copied from ui/src/state/types.ts (HostState, HostInfo, HostPlate, HostSlot, SpoolerInfo)
# and ui/src/engine/match.ts (SpoolmanFilament, SpoolmanSpool).
STATE_KEYS = {"host", "plates", "settings", "quotes", "spooler", "unreadable"}
HOST_KEYS = {"projectName", "printerModel", "printerVendor", "pluginVersion"}
PLATE_KEYS = {"index", "name", "seconds", "stale", "thumb", "slicedAt", "source", "fileName", "slots"}
SLOT_KEYS = {"n", "preset", "grams", "color", "costPerKg", "notes", "material"}
SPOOLER_KEYS = {"url", "presetToFilament"}
FILAMENT_KEYS = {"id", "name", "vendor", "material", "price", "weight", "colorHex"}
SPOOL_KEYS = {"id", "filamentId", "price", "initialWeight", "remainingWeight", "archived", "lastUsed"}


def gcode_file(folder, head="snapmaker_u1_temp_plate1.head.txt", tail="snapmaker_u1_temp_plate1.tail.txt", name=".1.0.gcode"):
    path = Path(folder) / name
    with open(path, "wb") as f:
        f.write((FIX / head).read_bytes())
        f.write(b"\n" * 10000)
        f.write((FIX / tail).read_bytes())
    return str(path)


def sliced_3mf(slice_info=None, project=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        if slice_info is not None:
            z.writestr("Metadata/slice_info.config", slice_info)
        if project is not None:
            z.writestr("Metadata/project_settings.config", json.dumps(project))
        z.writestr("3D/3dmodel.model", "<model/>")
    return buf.getvalue()


class HostCase(unittest.TestCase):
    def setUp(self):
        self.orca = install_orca()
        self.pkg = load_plugin(SRC)
        self.host_mod = self.pkg.host
        self.page = self.pkg.CalculatorPage()
        self.page.on_load()
        self.tmp = tempfile.mkdtemp()
        self.host_mod.TEMP_MODEL_DIR = self.tmp  # capture only reads under Orca's temp model tree

    def tearDown(self):
        logger = logging.getLogger("orca_print_calculator")
        for h in list(logger.handlers):
            h.close()
            logger.removeHandler(h)
        shutil.rmtree(self.tmp, ignore_errors=True)
        shutil.rmtree(Path(self.orca.storage_dir).parents[2], ignore_errors=True)

    # helpers
    def cmd(self, cmd, args=None, id=1):
        self.page.on_message({"type": "cmd", "id": id, "cmd": cmd, "args": {} if args is None else args})
        return self.page.posted[-1]

    def events(self, name):
        return [m["data"] for m in self.page.posted if m.get("type") == "event" and m.get("name") == name]

    def on_worker(self, event, c):
        t = threading.Thread(target=self.page.on_lifecycle_event, args=(event, c))
        t.start()
        t.join()

    def slice(self, plate, path, code=Code.Ok):
        self.orca.state["plate"] = plate
        self.on_worker(LE.GCodeExportFinished, ctx(msg=path))
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx(code=code))

    def wait_res(self, id, timeout=5):
        found = self.page.wait_for(lambda posted: next(
            (m for m in posted if m.get("type") == "res" and m.get("id") == id), None), timeout)
        if found is None:
            self.fail("no response for id %s" % id)
        return found


class Loading(HostCase):
    def test_registers_page_and_requests_permissions(self):
        self.pkg.PrintCalculator().register_capabilities()
        self.assertEqual(self.orca.registered, [self.pkg.CalculatorPage])
        self.assertEqual(len(self.orca.permissions), 1)
        perms = self.orca.permissions[0]
        self.assertEqual(set(perms), {"threading", "fs_read"})
        self.assertIs(perms["threading"], True)
        self.assertEqual(len(perms["fs_read"]), 1)
        root = perms["fs_read"][0]
        self.assertTrue(os.path.isabs(root))
        self.assertTrue(root.endswith(os.path.join("orcaslicer_model", "*")))
        if os.name != "nt":
            self.assertIn("orcaslicer_%d" % os.getuid(), root)

    def test_permission_failure_does_not_break_registration(self):
        def boom(**kw):
            raise RuntimeError("no")
        self.orca.request_permissions = boom
        self.pkg.PrintCalculator().register_capabilities()
        self.assertEqual(self.orca.registered, [self.pkg.CalculatorPage])

    def test_missing_request_permissions_is_fine(self):
        del self.orca.request_permissions
        self.pkg.PrintCalculator().register_capabilities()
        self.assertEqual(len(self.orca.registered), 1)

    def test_page_basics(self):
        self.assertEqual(self.page.get_name(), "Print Calculator")
        self.assertEqual(self.page.get_type(), "Pages")
        self.assertEqual(self.page.get_ui(), self.pkg._assets.APP_HTML)
        icon = self.page.get_icon()
        self.assertTrue(icon.startswith(self.orca.storage_dir))
        self.assertEqual(Path(icon).read_text("utf-8"), self.pkg._assets.ICON_SVG)

    def test_unknown_lifecycle_event_is_ignored(self):
        self.page.on_lifecycle_event(LE.PlateSelected, ctx())
        self.page.on_lifecycle_event("SomethingNew", ctx())
        self.assertEqual(self.page.posted, [])

    def test_missing_event_names_do_not_crash(self):
        import types
        self.orca.LifecycleEvent = types.SimpleNamespace(SlicingJobComplete=LE.SlicingJobComplete)
        self.page.on_lifecycle_event(LE.PresetSelected, ctx())  # name not on the enum any more
        self.assertEqual(self.page.posted, [])

    def test_log_file_in_storage(self):
        self.cmd("nope")
        logging.getLogger("orca_print_calculator").handlers[0].flush()
        self.assertTrue((Path(self.orca.storage_dir) / "plugin.log").is_file())


class Rpc(HostCase):
    def test_ready_binds_page_and_posts_nothing(self):
        # The page loads through get_state (timeout, error screen); a `state` push on ready had no listener.
        self.pkg.HOST.page = None
        self.page.on_message({"type": "ready"})
        self.assertIs(self.pkg.HOST.page, self.page)
        self.assertEqual(self.page.posted, [])

    def test_json_string_message_accepted(self):
        self.page.on_message(json.dumps({"type": "cmd", "id": 7, "cmd": "get_state", "args": {}}))
        self.assertEqual(self.page.posted[-1]["id"], 7)
        self.assertTrue(self.page.posted[-1]["ok"])

    def test_garbage_ignored(self):
        for junk in ("not json", 42, None, [], {"type": "other"}):
            self.page.on_message(junk)
        self.assertEqual(self.page.posted, [])

    def test_unknown_command(self):
        self.assertEqual(self.cmd("launch_rockets", id=3), {"type": "res", "id": 3, "ok": False, "error": "unknown_command"})

    def test_bad_args(self):
        self.page.on_message({"type": "cmd", "id": 4, "cmd": "save_settings", "args": "x"})
        self.assertEqual(self.page.posted[-1]["error"], "bad_args")
        self.assertEqual(self.cmd("save_settings", {"settings": [1]})["error"], "bad_args")
        self.assertEqual(self.cmd("save_quotes", {"quotes": {}})["error"], "bad_args")

    def test_handler_exception_becomes_error(self):
        self.host_mod.COMMANDS["get_state"] = lambda host, args, rid: 1 / 0
        res = self.cmd("get_state", id=9)
        self.assertEqual(res, {"type": "res", "id": 9, "ok": False, "error": "host_error"})

    def test_state_shape_matches_types_ts(self):
        state = self.cmd("get_state")["data"]
        self.assertEqual(set(state), STATE_KEYS)
        self.assertEqual(set(state["host"]), HOST_KEYS)
        self.assertEqual(state["host"], {"projectName": "Desk organizer", "printerModel": "Snapmaker U1",
                                         "printerVendor": "Snapmaker", "pluginVersion": "0.0.0-dev"})
        self.assertEqual(state["plates"], [])
        self.assertIsNone(state["settings"])
        self.assertIsNone(state["quotes"])
        self.assertIsNone(state["spooler"])

    def test_state_with_plate_matches_types_ts(self):
        self.slice(0, gcode_file(self.tmp))
        plate = self.cmd("get_state")["data"]["plates"][0]
        self.assertEqual(set(plate), PLATE_KEYS)
        for slot in plate["slots"]:
            self.assertEqual(set(slot), SLOT_KEYS)

    def test_settings_and_quotes_round_trip(self):
        settings = {"version": 1, "language": "pt-BR"}
        self.assertEqual(self.cmd("save_settings", {"settings": settings}), {"type": "res", "id": 1, "ok": True, "data": {}})
        self.assertTrue(self.cmd("save_quotes", {"quotes": [{"id": "q"}]})["ok"])
        state = self.cmd("get_state")["data"]
        self.assertEqual(state["settings"], settings)
        self.assertEqual(state["quotes"], [{"id": "q"}])

    def test_save_over_cap_refused_and_file_untouched(self):  # M3
        self.assertTrue(self.cmd("save_quotes", {"quotes": [{"id": "keep"}]})["ok"])
        path = Path(self.orca.storage_dir) / "quotes.json"
        before = path.read_bytes()
        res = self.cmd("save_quotes", {"quotes": [{"note": "x" * self.host_mod.core.STORE_SAVE_CAP}]})
        self.assertEqual((res["ok"], res["error"]), (False, "too_large"))
        self.assertEqual(path.read_bytes(), before)

    def test_corrupt_settings_file_set_aside(self):
        (Path(self.orca.storage_dir) / "settings.json").write_text("{nope", "utf-8")
        self.assertIsNone(self.cmd("get_state")["data"]["settings"])
        self.assertTrue(any(p.name.startswith("settings.json.corrupt-") for p in Path(self.orca.storage_dir).iterdir()))

    def test_spooler_detected(self):
        datadir = Path(self.orca.storage_dir).parents[2]
        (datadir / "spooler").mkdir()
        (datadir / "spooler" / "spooler_settings.json").write_text(json.dumps({"spoolman_url": "http://10.0.0.2:7912"}))
        (datadir / "spooler" / "profiles.json").write_text(json.dumps({"filaments": {"3": {"U1": "Generic PLA @U1"}}}))
        spooler = self.cmd("get_state")["data"]["spooler"]
        self.assertEqual(set(spooler), SPOOLER_KEYS)
        self.assertEqual(spooler["url"], "http://10.0.0.2:7912")
        self.assertEqual(spooler["presetToFilament"]["Generic PLA @U1"], 3)


class Capture(HostCase):
    def test_single_slice(self):
        self.slice(1, gcode_file(self.tmp))
        plates = self.events("plates")[-1]["plates"]
        self.assertEqual(len(plates), 1)
        p = plates[0]
        self.assertEqual((p["index"], p["seconds"], p["stale"], p["source"], p["fileName"], p["thumb"], p["name"]),
                         (1, 607, False, "slice", None, None, None))
        self.assertRegex(p["slicedAt"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertEqual([s["n"] for s in p["slots"]], [1, 2, 3])
        first = p["slots"][0]
        self.assertEqual(first, {"n": 1, "preset": "_local/spooler/3D Procer PLA Branco @Snapmaker U1", "grams": 1.12,
                                 "color": "#FFFFFF", "costPerKg": 83.1, "notes": "", "material": "PLA"})
        self.assertEqual(self.orca.violations, [])

    def test_slice_all_three_plates(self):
        for i in range(3):
            self.slice(i, gcode_file(self.tmp, name=".1.%d.gcode" % i))
        plates = self.events("plates")[-1]["plates"]
        self.assertEqual([p["index"] for p in plates], [0, 1, 2])
        self.assertEqual(len(self.events("plates")), 3)
        self.assertEqual(self.orca.violations, [])

    def test_reslice_replaces_plate(self):
        path = gcode_file(self.tmp)
        self.slice(0, path)
        self.page.on_lifecycle_event(LE.ObjectTransformed, ctx(msg="moved"))
        self.assertTrue(self.events("plates")[-1]["plates"][0]["stale"])
        self.slice(0, gcode_file(self.tmp, "synthetic_bbl_head.txt", "synthetic_bbl_tail.txt", name=".1.9.gcode"))
        plates = self.events("plates")[-1]["plates"]
        self.assertEqual(len(plates), 1)
        self.assertFalse(plates[0]["stale"])
        self.assertEqual(plates[0]["seconds"], 4180)
        self.assertEqual(plates[0]["slots"][1]["preset"], "Generic PETG; special @BBL X1C")

    def test_export_error_no_update(self):
        self.slice(0, gcode_file(self.tmp) + "\nDisk full")
        self.assertEqual(self.events("plates"), [])

    def test_export_error_code_no_update(self):
        self.orca.state["plate"] = 0
        self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp), code=Code.Error))
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx())
        self.assertEqual(self.events("plates"), [])

    def test_cancelled_job_drops_stash(self):
        self.orca.state["plate"] = 0
        self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp)))
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx(msg="cancelled", code=Code.Warn))
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx())  # nothing left to pair
        self.assertEqual(self.events("plates"), [])

    def test_complete_without_stash(self):
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx())
        self.assertEqual(self.events("plates"), [])

    def test_unreadable_gcode_no_update(self):
        self.slice(0, os.path.join(self.tmp, "missing.gcode"))
        self.assertEqual(self.events("plates"), [])

    def test_export_handler_never_touches_orca(self):
        self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp)))
        self.assertEqual(self.orca.violations, [])
        self.assertEqual(self.page.posted, [])

    def test_missing_gcode_config_falls_back_to_presets(self):
        folder = Path(self.tmp)
        (folder / "h.txt").write_text("; HEADER_BLOCK_START\n; HEADER_BLOCK_END\n")
        (folder / "t.txt").write_text("; filament used [g] = 2.5, 1.0\n; estimated printing time (normal mode) = 1h\n")
        path = folder / ".2.0.gcode"
        path.write_text((folder / "h.txt").read_text() + (folder / "t.txt").read_text())
        self.slice(0, str(path))
        slots = self.events("plates")[-1]["plates"][0]["slots"]
        self.assertEqual(slots[1], {"n": 2, "preset": "Generic PETG (#12)", "grams": 1.0, "color": "#2E6FBF",
                                    "costPerKg": 30.0, "notes": "Spoolman filament 12", "material": "PETG"})

    def test_unknown_values_are_null_not_zero(self):
        folder = Path(self.tmp)
        path = folder / ".3.0.gcode"
        path.write_text("; filament used [mm] = 100\n; filament_cost = 0\n")
        self.orca.state["filaments"] = [Preset("X", {"filament_cost": "0"})]
        self.orca.state["colours"] = ""
        self.slice(0, str(path))
        p = self.events("plates")[-1]["plates"][0]
        self.assertIsNone(p["seconds"])
        self.assertEqual(p["slots"][0]["grams"], None)
        self.assertIsNone(p["slots"][0]["costPerKg"])
        self.assertIsNone(p["slots"][0]["color"])


class Lifecycle(HostCase):
    def setUp(self):
        super().setUp()
        for i in range(3):
            self.slice(i, gcode_file(self.tmp, name=".1.%d.gcode" % i))
        self.page.posted.clear()

    def test_object_and_preset_events_mark_all_stale(self):
        for event in (LE.ObjectAdded, LE.ObjectDeleted, LE.ObjectTransformed, LE.ObjectChanged, LE.PresetSaved):
            self.page.on_lifecycle_event(event, ctx())
        plates_events = self.events("plates")
        self.assertEqual(len(plates_events), 1)  # only the first change is pushed
        self.assertTrue(all(p["stale"] for p in plates_events[0]["plates"]))

    def test_preset_selected_marks_stale_and_pushes_host(self):
        self.orca.state["printer"] = {"printer_model": "Bambu Lab X1 Carbon", "printer_vendor": "BBL"}
        self.page.on_lifecycle_event(LE.PresetSelected, ctx(msg="printer", name="Bambu Lab X1 Carbon 0.4 nozzle"))
        self.assertTrue(all(p["stale"] for p in self.events("plates")[-1]["plates"]))
        host = self.events("host")[-1]
        self.assertEqual(host["kind"], "PresetSelected")
        self.assertEqual(host["host"]["printerModel"], "Bambu Lab X1 Carbon")

    def test_plate_deleted_drops_and_shifts(self):
        self.page.on_lifecycle_event(LE.PlateDeleted, ctx(index=1))
        plates = self.events("plates")[-1]["plates"]
        self.assertEqual([p["index"] for p in plates], [0, 1])
        self.assertEqual(plates[1]["slicedAt"] is not None, True)

    def test_plate_deleted_without_index_marks_stale(self):
        self.page.on_lifecycle_event(LE.PlateDeleted, ctx(index=-1))
        plates = self.events("plates")[-1]["plates"]
        self.assertEqual(len(plates), 3)
        self.assertTrue(all(p["stale"] for p in plates))

    def test_project_opened_clears(self):
        self.orca.state["project"] = "/p/Other.3mf"
        self.page.on_lifecycle_event(LE.ProjectOpened, ctx())
        self.assertEqual(self.events("plates")[-1], {"plates": []})
        self.assertEqual(self.events("host")[-1]["kind"], "ProjectOpened")
        self.assertEqual(self.events("host")[-1]["host"]["projectName"], "Other")
        self.assertEqual(self.cmd("get_state")["data"]["plates"], [])

    def test_new_project_and_close_clear(self):
        self.page.on_lifecycle_event(LE.NewProject, ctx())
        self.assertEqual(self.events("host")[-1]["kind"], "NewProject")
        self.slice(0, gcode_file(self.tmp))
        self.page.on_lifecycle_event(LE.ProjectClosed, ctx())
        self.assertEqual(self.events("plates")[-1], {"plates": []})

    def test_project_open_drops_pending_stash(self):
        self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp)))
        self.page.on_lifecycle_event(LE.ProjectOpened, ctx())
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx())
        self.assertEqual(self.cmd("get_state")["data"]["plates"], [])


class ImportSliced(HostCase):
    def test_happy_path(self):
        project = {"filament_settings_id": ["Bambu PLA Basic @BBL X1C", "Generic PETG"], "filament_cost": ["25.5", "0"],
                   "filament_notes": ["Spoolman filament 7", ""]}
        data = sliced_3mf((FIX / "synthetic_slice_info.xml").read_text("utf-8"), project)
        res = self.cmd("import_sliced", {"name": "box.gcode.3mf", "b64": base64.b64encode(data).decode()})
        self.assertTrue(res["ok"], res)
        plates = res["data"]["plates"]
        self.assertEqual([p["index"] for p in plates], [0, 1])
        p = plates[0]
        self.assertEqual(set(p), PLATE_KEYS)
        self.assertEqual((p["seconds"], p["source"], p["fileName"], p["slicedAt"], p["stale"]),
                         (4180, "file", "box.gcode.3mf", None, False))
        self.assertEqual(p["slots"][0], {"n": 1, "preset": "Bambu PLA Basic @BBL X1C", "grams": 14.92, "color": "#FF0000",
                                         "costPerKg": 25.5, "notes": "Spoolman filament 7", "material": "PLA"})
        self.assertIsNone(p["slots"][1]["costPerKg"])
        self.assertEqual(self.cmd("get_state")["data"]["plates"], [])  # imports are not host state

    def test_without_project_settings(self):
        data = sliced_3mf((FIX / "synthetic_slice_info.xml").read_text("utf-8"))
        slot = self.cmd("import_sliced", {"name": "a.3mf", "b64": base64.b64encode(data).decode()})["data"]["plates"][0]["slots"][0]
        self.assertEqual((slot["preset"], slot["costPerKg"], slot["notes"]), ("", None, ""))

    def test_errors(self):
        b64 = lambda raw: base64.b64encode(raw).decode()
        cases = [
            ({"name": "x.3mf", "b64": b64(b"not a zip")}, "not_zip"),
            ({"name": "plain.3mf", "b64": b64(sliced_3mf())}, "no_slice_info"),
            ({"name": "e.3mf", "b64": b64(sliced_3mf("<config></config>"))}, "no_slice_info"),
            ({"name": "x.3mf", "b64": "@@@not base64"}, "bad_b64"),
            ({"name": "x.3mf", "b64": "A" * (self.host_mod.B64_CAP + 4)}, "too_big"),
            ({"name": "x.3mf"}, "bad_args"),
            ({"name": 3, "b64": ""}, "bad_args"),
        ]
        for args, code in cases:
            with self.subTest(code=code):
                res = self.cmd("import_sliced", args)
                self.assertFalse(res["ok"])
                self.assertEqual(res["error"], code)


class ExportFile(HostCase):
    def test_writes_under_exports(self):
        res = self.cmd("export_file", {"name": "quote-0042.html", "text": "<p>hi</p>"})
        path = Path(res["data"]["path"])
        self.assertEqual(path.parent, Path(self.orca.storage_dir) / "exports")
        self.assertEqual(path.read_text("utf-8"), "<p>hi</p>")

    def test_path_safety(self):
        for name in ("../../evil.html", "/etc/passwd.csv", "..\\x.csv"):
            res = self.cmd("export_file", {"name": name, "text": "x"})
            self.assertTrue(res["ok"])
            self.assertEqual(Path(res["data"]["path"]).parent, Path(self.orca.storage_dir) / "exports")
        for name, code in (("a.exe", "bad_name"), ("config.html", "bad_name"), ("", "bad_name")):
            self.assertEqual(self.cmd("export_file", {"name": name, "text": "x"})["error"], code)
        self.assertEqual(self.cmd("export_file", {"name": "a.csv"})["error"], "bad_args")


class FakeResp(io.BytesIO):
    def __init__(self, url, body):
        super().__init__(json.dumps(body).encode())
        self.url = url

    def geturl(self):
        return self.url

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def spoolman_opener(calls=None, error=None):
    bodies = {
        "/api/v1/info": {"version": "0.27.1"},
        "/api/v1/setting/currency": {"value": '"BRL"', "is_set": True},
        "/api/v1/filament": [{"id": 3, "name": "PLA+ White", "vendor": {"name": "eSun"}, "material": "PLA", "price": 89.9,
                              "weight": 1000, "color_hex": "FFFFFF"}],
        "/api/v1/spool?allow_archived=false": [{"id": 1, "filament": {"id": 3}, "price": 95.0, "initial_weight": 1000,
                                                "remaining_weight": 412.5, "archived": False, "last_used": "2026-11-01T10:00:00Z"}],
    }

    def opener(req, timeout=None):
        if calls is not None:
            calls.append(threading.current_thread() is threading.main_thread())
        if error is not None:
            raise error
        url = req.full_url
        path = url[url.index("/api/"):]
        return FakeResp(url, bodies[path])
    return opener


class Spoolman(HostCase):
    def test_fetch_on_worker_thread(self):
        calls = []
        self.host_mod.opener = spoolman_opener(calls)
        self.page.on_message({"type": "cmd", "id": 5, "cmd": "spoolman_fetch", "args": {"url": "localhost:7912"}})
        res = self.wait_res(5)
        self.assertTrue(res["ok"], res)
        self.assertEqual(calls, [False] * 4)  # every request off the UI thread
        data = res["data"]
        self.assertEqual(set(data), {"currency", "filaments", "spools"})
        self.assertEqual(data["currency"], "BRL")
        self.assertEqual(data["filaments"], [{"id": 3, "name": "PLA+ White", "vendor": "eSun", "material": "PLA",
                                              "price": 89.9, "weight": 1000.0, "colorHex": "#FFFFFF"}])
        self.assertEqual(set(data["spools"][0]), SPOOL_KEYS)
        self.assertEqual(data["spools"][0]["filamentId"], 3)
        self.assertEqual(data["spools"][0]["remainingWeight"], 412.5)  # SpoolPicker shows grams left
        self.assertEqual(set(data["filaments"][0]), FILAMENT_KEYS)
        self.assertEqual(self.orca.violations, [])

    def test_error_codes(self):
        cases = [
            (urllib.error.URLError(ConnectionRefusedError("refused")), "unreachable"),
            (urllib.error.URLError(TimeoutError("slow")), "timeout"),
            (urllib.error.HTTPError("http://h/api/v1/info", 503, "down", {}, None), "http_503"),
            (urllib.error.URLError(PermissionError("audit")), "denied"),
        ]
        for i, (error, code) in enumerate(cases, start=10):
            with self.subTest(code=code):
                self.host_mod.opener = spoolman_opener(error=error)
                self.page.on_message({"type": "cmd", "id": i, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
                res = self.wait_res(i)
                self.assertEqual((res["ok"], res["error"]), (False, code))

    def test_redirected_and_too_large_keep_their_codes(self):  # M2: distinct end to end
        self.host_mod.opener = lambda req, timeout=None: FakeResp("http://elsewhere.example/api/v1/info", {})
        self.page.on_message({"type": "cmd", "id": 40, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertEqual(self.wait_res(40)["error"], "redirected")
        big = FakeResp("http://h:7912/api/v1/info", {})
        big.read = big.read1 = lambda n=-1: b"x" * (n if n > 0 else 1)
        self.host_mod.opener = lambda req, timeout=None: big
        self.page.on_message({"type": "cmd", "id": 41, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertEqual(self.wait_res(41)["error"], "too_large")

    def test_bad_url_and_args(self):
        self.assertEqual(self.cmd("spoolman_fetch", {"url": "ftp://h"})["error"], "bad_url")
        self.assertEqual(self.cmd("spoolman_fetch", {})["error"], "bad_args")

    def test_denied_retries_with_only_a_probe_on_ui_thread(self):  # M1
        self.host_mod.opener = spoolman_opener(error=urllib.error.URLError(PermissionError("audit")))
        self.page.on_message({"type": "cmd", "id": 20, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertEqual(self.wait_res(20)["error"], "denied")
        calls = []
        self.host_mod.opener = spoolman_opener(calls)
        self.page.on_message({"type": "cmd", "id": 21, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912/"}})
        self.assertEqual(calls[:1], [True])  # one /api/v1/info probe on the UI thread, where Orca can prompt
        res = self.wait_res(21)
        self.assertTrue(res["ok"])
        self.assertEqual(calls, [True] + [False] * 4)  # the full fetch ran on the worker

    def test_denied_probe_reports_denied_and_stays_on_ui_path(self):
        self.host_mod.opener = spoolman_opener(error=urllib.error.URLError(PermissionError("audit")))
        self.page.on_message({"type": "cmd", "id": 22, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.wait_res(22)
        self.assertEqual(self.cmd("spoolman_fetch", {"url": "http://h:7912"}, id=23)["error"], "denied")
        calls = []
        self.host_mod.opener = spoolman_opener(calls)
        self.page.on_message({"type": "cmd", "id": 24, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertTrue(self.wait_res(24)["ok"])
        self.assertEqual(calls[0], True)

    def test_one_fetch_in_flight_per_url(self):  # L8
        gate, calls = threading.Event(), []
        inner = spoolman_opener()

        def slow(req, timeout=None):
            calls.append(req.full_url)
            gate.wait(5)
            return inner(req, timeout)
        self.host_mod.opener = slow
        before = threading.active_count()
        for rid in (50, 51, 52):
            self.page.on_message({"type": "cmd", "id": rid, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertLessEqual(threading.active_count(), before + 1)
        gate.set()
        for rid in (50, 51, 52):
            self.assertTrue(self.wait_res(rid)["ok"])
        self.assertEqual(len(calls), 4)  # one fetch served all three requests

    def test_url_host_never_logged(self):
        self.host_mod.opener = spoolman_opener(error=urllib.error.URLError(ConnectionRefusedError("refused")))
        self.page.on_message({"type": "cmd", "id": 30, "cmd": "spoolman_fetch", "args": {"url": "http://secret-nas.lan:7912"}})
        self.wait_res(30)
        logging.getLogger("orca_print_calculator").handlers[0].flush()
        self.assertNotIn("secret-nas", (Path(self.orca.storage_dir) / "plugin.log").read_text("utf-8"))



class ReviewFixes(HostCase):  # T5.3
    def test_thread_start_failure_does_not_wedge_the_url(self):  # HIGH
        from unittest import mock
        self.host_mod.opener = spoolman_opener()
        with mock.patch.object(threading.Thread, "start", side_effect=RuntimeError("can't start new thread")):
            self.page.on_message({"type": "cmd", "id": 1, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertEqual(self.wait_res(1)["error"], "host_error")
        self.assertEqual(self.pkg.HOST.inflight, {})
        self.page.on_message({"type": "cmd", "id": 2, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertTrue(self.wait_res(2)["ok"])

    def test_worker_crash_still_clears_inflight(self):
        self.host_mod.opener = spoolman_opener()
        self.host_mod.spoolman_data = lambda raw: 1 / 0
        self.page.on_message({"type": "cmd", "id": 3, "cmd": "spoolman_fetch", "args": {"url": "http://h:7912"}})
        self.assertEqual(self.wait_res(3)["error"], "host_error")
        self.assertTrue(self.page.wait_for(lambda _: self.pkg.HOST.inflight == {}))

    def test_wrong_type_settings_set_aside(self):
        store = Path(self.orca.storage_dir)
        (store / "settings.json").write_text("[1, 2]", "utf-8")
        self.assertIsNone(self.cmd("get_state")["data"]["settings"])
        self.assertFalse((store / "settings.json").exists())
        self.assertTrue(any(p.name.startswith("settings.json.corrupt-") for p in store.iterdir()))

    def test_one_unreadable_file_does_not_fail_get_state(self):
        from unittest import mock
        store = Path(self.orca.storage_dir)
        self.assertTrue(self.cmd("save_settings", {"settings": {"version": 1}})["ok"])
        (store / "quotes.json").write_text("{bad", "utf-8")
        with mock.patch("os.replace", side_effect=PermissionError("locked")):
            res = self.cmd("get_state", id=4)
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["data"]["settings"], {"version": 1})
        self.assertIsNone(res["data"]["quotes"])
        self.assertEqual(res["data"]["unreadable"], ["quotes"])  # the page shows a banner, not first-run
        # the unreadable file is protected: no save may replace it this session
        self.assertEqual(self.cmd("save_quotes", {"quotes": []}, id=5)["error"], "unreadable")
        self.assertEqual((store / "quotes.json").read_text("utf-8"), "{bad")

    def test_project_closed_pushes_host(self):
        self.page.on_lifecycle_event(LE.ProjectClosed, ctx())
        self.assertEqual(self.events("host")[-1]["kind"], "ProjectClosed")

    def test_export_on_worker_writes_no_log(self):
        with self.assertNoLogs("orca_print_calculator"):
            self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp)))

    def test_stash_is_capped(self):
        for i in range(20):
            self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp, name=".9.%d.gcode" % i)))
        self.assertLessEqual(len(self.pkg.HOST.stash), self.host_mod.STASH_CAP)
        self.assertTrue(self.pkg.HOST.stash[-1][0].endswith(".9.19.gcode"))

    def test_known_path_pairs_with_its_plate_after_a_plate_switch(self):  # open question 1
        a, b = gcode_file(self.tmp, name=".1.0.gcode"), gcode_file(self.tmp, name=".1.1.gcode")
        self.slice(0, a)
        self.slice(1, b)
        first = self.events("plates")[-1]["plates"][0]["slicedAt"]
        self.page.on_lifecycle_event(LE.ObjectTransformed, ctx())
        self.slice(1, a)  # user switched to plate 1 while plate 0 re-sliced: the path still says plate 0
        plates = self.events("plates")[-1]["plates"]
        self.assertEqual([p["stale"] for p in plates], [False, True])
        self.assertIsNotNone(first)

    def test_path_map_follows_plate_delete(self):
        a, b = gcode_file(self.tmp, name=".1.0.gcode"), gcode_file(self.tmp, name=".1.1.gcode")
        self.slice(0, a)
        self.slice(1, b)
        self.page.on_lifecycle_event(LE.PlateDeleted, ctx(index=0))
        self.page.on_lifecycle_event(LE.ObjectTransformed, ctx())
        self.slice(5, b)  # b's plate is now index 0
        self.assertEqual([p["stale"] for p in self.events("plates")[-1]["plates"]], [False])

    def test_user_export_outside_temp_tree_never_read(self):  # open question 2
        elsewhere = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, elsewhere, True)
        self.slice(0, gcode_file(elsewhere, name="user-export.gcode"))
        self.assertEqual(self.events("plates"), [])

    @unittest.skipIf(os.name == "nt", "symlinks need privileges on Windows")
    def test_symlinked_temp_root_both_ways(self):  # macOS: $TMPDIR /var/folders/... -> /private/var/folders/...
        real = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, real, True)
        link = Path(tempfile.mkdtemp()) / "var"
        self.addCleanup(shutil.rmtree, link.parent, True)
        os.symlink(real, link)
        model = real / "orcaslicer_501" / "orcaslicer_model" / "Tue_Nov_10" / "14_32_13#9918#116" / "Metadata"
        model.mkdir(parents=True)
        cases = [(link / "orcaslicer_501" / "orcaslicer_model", str(real)),   # grant via link, Orca reports real
                 (real / "orcaslicer_501" / "orcaslicer_model", str(link))]   # grant real, Orca reports via link
        for i, (root, prefix) in enumerate(cases):
            with self.subTest(root=str(root)):
                self.host_mod.TEMP_MODEL_DIR = str(root)
                gcode = gcode_file(model, name=".9918.%d.gcode" % i)
                reported = prefix + gcode[len(str(real)):]
                self.slice(i, reported)
                self.assertEqual([p["index"] for p in self.events("plates")[-1]["plates"]], list(range(i + 1)))
        self.host_mod.TEMP_MODEL_DIR = str(real / "orcaslicer_501" / "orcaslicer_model")
        sibling = real / "orcaslicer_501" / "orcaslicer_model_evil"  # prefix match must not count
        sibling.mkdir()
        before = len(self.events("plates"))
        self.slice(3, gcode_file(sibling, name="x.gcode"))
        self.assertEqual(len(self.events("plates")), before)

    def test_unreadable_is_empty_when_files_are_fine(self):
        self.assertEqual(self.cmd("get_state")["data"]["unreadable"], [])

    def test_plate_created_forgets_path_to_plate_map(self):  # insert-before may renumber without PlateDeleted
        a, b = gcode_file(self.tmp, name=".1.0.gcode"), gcode_file(self.tmp, name=".1.1.gcode")
        self.slice(0, a)
        self.slice(1, b)
        self.page.on_lifecycle_event(LE.PlateCreated, ctx())
        self.slice(2, a)  # a's plate may now be index 2: trust the selected plate, not the stale map
        self.assertEqual([p["stale"] for p in self.events("plates")[-1]["plates"]], [True, True, False])

    def test_old_stash_dropped(self):
        clock = [100.0]
        self.host_mod.clock = lambda: clock[0]
        self.orca.state["plate"] = 0
        self.on_worker(LE.GCodeExportFinished, ctx(msg=gcode_file(self.tmp)))
        clock[0] += self.host_mod.STASH_MAX_AGE + 1
        self.page.on_lifecycle_event(LE.SlicingJobComplete, ctx())
        self.assertEqual(self.events("plates"), [])

    def test_plate_created_marks_stale(self):  # open question 3
        self.slice(0, gcode_file(self.tmp))
        self.page.on_lifecycle_event(LE.PlateCreated, ctx())
        self.assertTrue(self.events("plates")[-1]["plates"][0]["stale"])

    def test_plate_deleted_event_names_the_index(self):
        for i in range(3):
            self.slice(i, gcode_file(self.tmp, name=".1.%d.gcode" % i))
        self.page.on_lifecycle_event(LE.PlateDeleted, ctx(index=1))
        last = self.events("plates")[-1]
        self.assertEqual(last["deleted"], 1)
        self.assertEqual([p["index"] for p in last["plates"]], [0, 1])


if __name__ == "__main__":
    unittest.main()
