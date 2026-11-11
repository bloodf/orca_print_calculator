"""The real Python host behind a JSON-lines pipe, with the fake `orca` from tests/fakes.py. For browser smokes
without OrcaSlicer: a driver forwards the page's postMessage here and feeds every printed line to
window.__orcaDispatch.

    python3 scripts/dev_host.py <storage-dir>

stdin, one JSON object per line:
    {"page": <message>}                         page -> host (on_message)
    {"slice": [plate, head, tail]}              worker GCodeExportFinished + SlicingJobComplete, fixture files
    {"lifecycle": "<LifecycleEvent>", ...ctx}   any other lifecycle event (ctx: msg, name, index)
    {"state": {...}}                            merge into the fake orca.state (printer, project, plate, ...)
stdout: every message the host posts, one JSON object per line. <storage-dir> must end in
orca_plugins/plugin_data/<name> for Spooler detection, like Orca's own layout.
"""

import json
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures"
sys.path.insert(0, str(ROOT / "tests"))

from fakes import LifecycleEvent as LE, ctx, install_orca, load_plugin  # noqa: E402

out_lock = threading.Lock()


def emit(msg):
    with out_lock:
        sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main(storage):
    Path(storage).mkdir(parents=True, exist_ok=True)
    orca = install_orca(storage=storage)
    pkg = load_plugin(ROOT / "src")
    page = pkg.CalculatorPage()
    page.post_message = emit  # any thread, like the real host
    page.on_load()
    tmp = Path(storage) / "_gcode"
    tmp.mkdir(exist_ok=True)
    pkg.host.TEMP_MODEL_DIR = str(tmp)  # stands in for Orca's temp model tree: capture reads nothing outside it
    for line in sys.stdin:
        if not line.strip():
            continue
        cmd = json.loads(line)
        if "page" in cmd:
            page.on_message(cmd["page"])
        elif "slice" in cmd:
            plate, head, tail = cmd["slice"]
            orca.state["plate"] = plate
            path = tmp / (".%d.0.gcode" % plate)
            path.write_bytes((FIX / head).read_bytes() + b"\n" * 10000 + (FIX / tail).read_bytes())
            t = threading.Thread(target=page.on_lifecycle_event, args=(LE.GCodeExportFinished, ctx(msg=str(path))))
            t.start()
            t.join()
            page.on_lifecycle_event(LE.SlicingJobComplete, ctx())
        elif "lifecycle" in cmd:
            kw = {k: v for k, v in cmd.items() if k in ("msg", "name", "index")}
            page.on_lifecycle_event(LE[cmd["lifecycle"]], ctx(**kw))
        elif "state" in cmd:
            orca.state.update(cmd["state"])
    if orca.violations:
        sys.stderr.write("orca called off the UI thread: %s\n" % orca.violations)
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
