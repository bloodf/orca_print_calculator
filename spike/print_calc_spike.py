# /// script
# requires-python = ">=3.12"
# dependencies = []
#
# [tool.orcaslicer.plugin]
# name = "Print Calc Spike"
# description = "Throwaway capture spike for Orca Print Calculator: logs lifecycle events and slice data"
# author = "orca_print_calculator"
# version = "0.0.1"
# ///
"""Capture spike (T1.1). Everything goes to <plugin storage>/spike.log and the tab's log pane.

Flip DECLARE_TEMP_READ to True for the second run: it declares a read-only tree grant on Orca's
temp model folder, so the UI-thread read of the temp G-code should then succeed without a prompt.
"""

import base64
import io
import json
import os
import re
import tempfile
import threading
import time
import webbrowser
import zipfile

import orca

DECLARE_TEMP_READ = False

HEAD_BYTES = 4096
TAIL_BYTES = 192 * 1024
PAD_BYTES = 250_000  # dummy payload inside the module script (question 7)
LOG_KEEP = 500       # lines buffered for the page before it says "ready"


def _temp_model_root() -> str:
    """Orca's temp model folder: wxFileName::GetTempDir() + /orcaslicer_<uid> (POSIX) + /orcaslicer_model."""
    base = tempfile.gettempdir()
    if os.name != "nt":
        base = os.path.join(base, "orcaslicer_%d" % os.getuid())
    return os.path.join(base, "orcaslicer_model")


TEMP_ROOT = _temp_model_root()  # computed at import: no audit scope is open yet

_lock = threading.Lock()
_stash = []            # [(path, code, thread, t)] from GCodeExportFinished, consumed by SlicingJobComplete
_lines = []            # recent log lines, replayed to the page on "ready"
_state = {"page": None, "log_path": None, "ui_ident": None, "fixture_n": {}}


# ---------------------------------------------------------------------------------- logging

def _thread_tag() -> str:
    t = threading.current_thread()
    ident = threading.get_ident()
    where = "ui" if ident == _state["ui_ident"] else ("main" if t is threading.main_thread() else "worker")
    return "%s:%s:%d" % (where, t.name, ident)


def _storage() -> str | None:
    if _state["log_path"] is None:
        try:
            _state["log_path"] = os.path.join(orca.host.plugin.storage(), "spike.log")
        except Exception as e:  # outside a plugin callback
            _lines.append("storage() failed: %r" % e)
            return None
    return os.path.dirname(_state["log_path"])


def log(msg: str) -> None:
    line = "%s [%s] %s" % (time.strftime("%H:%M:%S"), _thread_tag(), msg)
    with _lock:
        _lines.append(line)
        del _lines[:-LOG_KEEP]
        if _storage():
            try:
                with open(_state["log_path"], "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            except OSError as e:
                _lines.append("log write failed: %r" % e)
    page = _state["page"]
    if page is not None:
        try:
            page.post_message({"type": "log", "line": line})
        except Exception:
            pass


def _write(rel: str, data: bytes) -> str:
    path = os.path.join(_storage() or ".", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


# ---------------------------------------------------------------------------------- G-code

GCODE_KEYS = ("printer_model", "printer_settings_id", "filament_settings_id", "filament_notes",
              "filament_cost", "filament_density", "filament_type", "filament_colour")


def parse_gcode(head: str, tail: str) -> dict:
    """Footer numbers, time lines and selected config keys. Last occurrence wins."""
    out = {"time_lines": [], "keys_present": []}
    for line in (head + "\n" + tail).splitlines():
        m = re.match(r";\s*filament used \[(g|mm|cm3)\]\s*=\s*(.*)", line)
        if m:
            out["used_" + m.group(1)] = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", m.group(2))]
        elif re.search(r"(printing|estimated|print) time", line, re.I) and line.startswith(";") and len(line) < 300:
            out["time_lines"].append(line.strip())
        else:
            m = re.match(r";\s*(\w+)\s*=\s*(.*)", line)
            if m and m.group(1) in GCODE_KEYS:
                out[m.group(1)] = m.group(2)[:300]
    out["keys_present"] = [k for k in GCODE_KEYS if k in out]
    out["time_lines"] = out["time_lines"][-12:]
    return out


def read_head_tail(path: str) -> tuple[bytes, bytes]:
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(HEAD_BYTES)
        f.seek(max(0, size - TAIL_BYTES))
        tail = f.read()
    return head, tail


def capture(path: str, plate: int) -> None:
    """UI thread: read, parse, list siblings, save fixtures. Logs every failure with its text."""
    log("CAPTURE plate_index=%d path=%s (a permission prompt right now = fs grant needed)" % (plate, path))
    try:
        head, tail = read_head_tail(path)
    except Exception as e:
        log("CAPTURE READ FAILED %s: %s" % (type(e).__name__, e))
        return
    log("CAPTURE READ OK head=%d tail=%d bytes" % (len(head), len(tail)))
    parsed = parse_gcode(head.decode("utf-8", "replace"), tail.decode("utf-8", "replace"))
    log("CAPTURE PARSED plate_index=%d %s" % (plate, json.dumps(parsed)))
    try:
        folder = os.path.dirname(path)
        names = sorted(os.listdir(folder))
        log("CAPTURE SIBLINGS %s" % json.dumps({n: os.path.getsize(os.path.join(folder, n)) for n in names}))
    except Exception as e:
        log("CAPTURE LISTDIR FAILED %s: %s" % (type(e).__name__, e))
    n = _state["fixture_n"][plate] = _state["fixture_n"].get(plate, 0) + 1
    try:
        _write("fixtures/plate%d_%d.head.txt" % (plate, n), head)
        p = _write("fixtures/plate%d_%d.tail.txt" % (plate, n), tail)
        log("CAPTURE FIXTURES saved %s" % p.replace(".tail.txt", ".{head,tail}.txt"))
    except Exception as e:
        log("CAPTURE FIXTURE WRITE FAILED %s: %s" % (type(e).__name__, e))


# ---------------------------------------------------------------------------------- host state

def _cv(preset, key):
    try:
        return preset.config_value(key)
    except Exception as e:
        return "<%s>" % type(e).__name__


def dump_state() -> dict:
    bundle = orca.host.preset_bundle()
    pr = bundle.current_printer_preset()
    printer = {"name": pr.name, "is_system": pr.is_system, "bundle_id": getattr(pr, "bundle_id", None)}
    for k in ("printer_model", "printer_vendor", "printer_settings_id", "inherits", "printer_variant", "host_type"):
        printer[k] = _cv(pr, k)
    printer["full_printer_model"] = bundle.full_config_value("printer_model")
    slots = []
    for i, fp in enumerate(bundle.current_filament_presets()):
        if fp is None:
            slots.append({"slot": i + 1, "preset": None})
            continue
        row = {"slot": i + 1, "preset": fp.name}
        for k in ("filament_cost", "filament_density", "filament_notes", "filament_vendor", "filament_type", "inherits"):
            row[k] = _cv(fp, k)
        slots.append(row)
    model = orca.host.model()
    return {"printer": printer, "filaments": slots, "filament_colour": bundle.full_config_value("filament_colour"),
            "current_plate_index": model.current_plate_index(), "object_count": model.object_count(),
            "project_path": _safe(lambda: orca.host.plater().project_path())}


def _safe(fn):
    try:
        return fn()
    except Exception as e:
        return "<%s: %s>" % (type(e).__name__, e)


def import_3mf(name: str, b64: str) -> None:
    raw = base64.b64decode(b64)
    log("IMPORT received name=%s bytes=%d" % (name, len(raw)))
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names = z.namelist()
        log("IMPORT entries=%d gcode=%s" % (len(names), [n for n in names if n.endswith(".gcode")]))
        if "Metadata/slice_info.config" not in names:
            log("IMPORT no Metadata/slice_info.config (not a sliced .gcode.3mf)")
            return
        info = z.read("Metadata/slice_info.config")
    p = _write("fixtures/slice_info.config.xml", info)  # .xml: a ".config" base name stays readable
    log("IMPORT slice_info.config %d bytes saved %s" % (len(info), p))
    log("IMPORT slice_info head: %s" % info[:1500].decode("utf-8", "replace").replace("\n", " "))


def read_path(path: str) -> None:
    log("PATH read attempt %s (prompt here = path needs a grant)" % path)
    try:
        with open(path, "rb") as f:
            magic = f.read(4)
        log("PATH read OK magic=%r size=%d" % (magic, os.path.getsize(path)))
    except Exception as e:
        log("PATH read FAILED %s: %s" % (type(e).__name__, e))


def export_test() -> None:
    try:
        p = _write("exports/spike-test.html", b"<!doctype html><title>spike</title><h1>Exported by Print Calc Spike</h1>")
        log("EXPORT wrote %s" % p)
    except Exception as e:
        log("EXPORT write FAILED %s: %s" % (type(e).__name__, e))
        return
    try:  # macOS: webbrowser runs osascript via subprocess -> audited as ProcessCreate
        log("EXPORT webbrowser.open -> %r" % webbrowser.open("file://" + p))
    except Exception as e:
        log("EXPORT open FAILED %s: %s" % (type(e).__name__, e))


# ---------------------------------------------------------------------------------- page

def page_html() -> str:
    pad = ("0123456789" * (PAD_BYTES // 10 + 1))[:PAD_BYTES]
    return PAGE.replace("__PAD__", pad).replace("__TEMP_ROOT__", json.dumps(TEMP_ROOT).replace("<", "\\u003c"))


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:var(--orca-font,sans-serif);background:var(--orca-bg);color:var(--orca-fg);margin:12px}
button{background:var(--orca-accent);color:var(--orca-accent-fg);border:0;padding:6px 10px;margin:2px;border-radius:2px}
#log{border:1px solid var(--orca-border);height:60vh;overflow:auto;white-space:pre-wrap;font:12px monospace;padding:6px}
.m{color:var(--orca-muted)}
</style></head><body>
<h3>Print Calc Spike</h3>
<div class="m">classic script: <b id="classic">did not run</b> · module script: <b id="mod">did not run</b></div>
<div class="m">temp root: <span id="root"></span></div>
<p>
<button id="dump">Dump state</button>
<button id="print">window.print()</button>
<button id="export">Export test file</button>
<label>Pick .3mf: <input type="file" id="file" accept=".3mf"></label>
<input id="path" size="50" placeholder="or paste a .gcode.3mf path"><button id="readpath">Read path</button>
</p>
<div id="log"></div>
<script>
const logEl = document.getElementById('log');
function show(line){ const d=document.createElement('div'); d.textContent=line; logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight; }
function send(msg){ window.orca.postMessage(msg); }
function note(text){ show('[page] '+text); send({type:'note', text:text}); }
document.getElementById('classic').textContent = 'ran';
document.getElementById('root').textContent = __TEMP_ROOT__;
window.orca.onMessage(function(m){ if (m && m.type==='log') show(m.line); });
document.getElementById('dump').onclick = () => send({type:'cmd', cmd:'dump'});
document.getElementById('export').onclick = () => send({type:'cmd', cmd:'export'});
document.getElementById('readpath').onclick = () => send({type:'cmd', cmd:'read_path', path:document.getElementById('path').value});
document.getElementById('print').onclick = () => {
  const t0 = Date.now(); let r;
  try { r = window.print(); note('window.print() returned '+r+' after '+(Date.now()-t0)+' ms (a dialog = works)'); }
  catch(e){ note('window.print() threw '+e); }
};
document.getElementById('file').onchange = async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) { note('file input: no file'); return; }
  note('file input: name='+f.name+' size='+f.size+' type='+f.type+' path='+(f.path||'(none)')+' webkitRelativePath='+(f.webkitRelativePath||'(none)'));
  try {
    const buf = new Uint8Array(await f.arrayBuffer());
    note('file input: read '+buf.length+' bytes, magic='+Array.from(buf.slice(0,4)).map(b=>b.toString(16)).join(' '));
    let s=''; for (let i=0;i<buf.length;i+=0x8000) s += String.fromCharCode.apply(null, buf.subarray(i,i+0x8000));
    const t0 = Date.now(); send({type:'cmd', cmd:'import', name:f.name, b64:btoa(s)});
    note('file input: posted base64 ('+Math.round(s.length*4/3)+' chars) in '+(Date.now()-t0)+' ms');
  } catch(e){ note('file input: read failed '+e); }
};
send({type:'ready', html_length: document.documentElement.outerHTML.length});
</script>
<script type="module">
const PAD = "__PAD__";
document.getElementById('mod').textContent = 'module script ran (' + PAD.length + ' bytes padding)';
window.orca.postMessage({type:'note', text:'module script ran, pad='+PAD.length});
</script>
</body></html>"""


def _parse(data):
    if isinstance(data, str):
        try:
            return json.loads(data)
        except ValueError:
            return {"type": "raw", "text": data}
    return data if isinstance(data, dict) else {"type": "raw", "text": repr(data)}


def on_event(event, ctx) -> None:
    name = getattr(event, "name", str(event))
    fields = {k: getattr(ctx, k, None) for k in
              ("msg", "name", "previous_name", "index", "id", "device_id", "job_id", "source", "dirty")}
    fields["code"] = getattr(getattr(ctx, "code", None), "name", str(getattr(ctx, "code", None)))
    log("EVENT %s %s" % (name, json.dumps(fields, default=str)))
    if name == "GCodeExportFinished":
        # Slicing worker: stash only. Never touch presets/UI here.
        path = str(fields["msg"] or "").split("\n", 1)[0]
        with _lock:
            _stash.append((path, fields["code"], threading.get_ident(), time.time()))
            depth = len(_stash)
        log("STASH path=%s code=%s depth=%d" % (path, fields["code"], depth))
        return
    if threading.get_ident() != _state["ui_ident"] and threading.current_thread() is not threading.main_thread():
        return  # not provably the UI thread: no host calls
    plate = _safe(lambda: orca.host.model().current_plate_index())
    log("  current_plate_index=%s" % plate)
    if name == "SlicingJobComplete":
        with _lock:
            stashed, _stash[:] = list(_stash), []
        log("PAIR stash_depth=%d code=%s plate_index=%s" % (len(stashed), fields["code"], plate))
        if stashed and fields["code"] == "Ok" and isinstance(plate, int):
            capture(stashed[-1][0], plate)


# ---------------------------------------------------------------------------------- capabilities

class SpikePage(orca.pages.PagesPluginCapabilityBase):
    def __init__(self):
        super().__init__()
        _state["page"] = self

    def get_name(self):
        return "Print Calc Spike"

    def get_type(self):
        return orca.PluginType.Pages

    def get_icon(self):
        return ""

    def get_ui(self):
        html = page_html()
        log("get_ui() -> %d chars" % len(html))
        return html

    def on_load(self):
        _state["ui_ident"] = _state["ui_ident"] or threading.get_ident()
        log("on_load storage=%s temp_root=%s DECLARE_TEMP_READ=%s app=%s" %
            (_storage(), TEMP_ROOT, DECLARE_TEMP_READ, _safe(lambda: orca.host.app_info())))

    def on_message(self, data):
        _state["ui_ident"] = threading.get_ident()  # page messages arrive on the UI thread
        msg = _parse(data)
        kind, cmd = msg.get("type"), msg.get("cmd")
        try:
            if kind == "ready":
                log("PAGE ready html_length=%s" % msg.get("html_length"))
                for line in list(_lines):
                    self.post_message({"type": "log", "line": line})
            elif kind == "note":
                log("PAGE %s" % msg.get("text"))
            elif cmd == "dump":
                log("DUMP %s" % json.dumps(dump_state(), default=str))
            elif cmd == "export":
                export_test()
            elif cmd == "import":
                import_3mf(str(msg.get("name")), str(msg.get("b64") or ""))
            elif cmd == "read_path":
                read_path(str(msg.get("path") or "").strip())
            else:
                log("PAGE unhandled %r" % msg)
        except Exception as e:
            log("on_message %s/%s FAILED %s: %s" % (kind, cmd, type(e).__name__, e))

    def on_lifecycle_event(self, event, ctx):
        try:
            on_event(event, ctx)
        except Exception as e:
            log("on_lifecycle_event FAILED %s: %s" % (type(e).__name__, e))

    def on_unload(self):
        log("on_unload")
        _state["page"] = None


_SLICING = hasattr(getattr(orca, "slicing", None), "SlicingPipelineCapabilityBase")

if _SLICING:
    class SpikeGcodeHook(orca.slicing.SlicingPipelineCapabilityBase):
        """Optional: only runs when the process preset lists it under Slicing Pipeline Plugin.
        At psGCodePostProcess Orca grants the G-code folder as a scoped root (no fs grant needed)."""

        def get_name(self):
            return "Print Calc Spike: G-code hook"

        def execute(self, ctx):
            try:
                if ctx.step == getattr(orca.slicing.Step, "psGCodePostProcess", None):
                    log("HOOK psGCodePostProcess path=%s host=%s output_name=%s" % (ctx.gcode_path, ctx.host, ctx.output_name))
                    head, tail = read_head_tail(ctx.gcode_path)
                    parsed = parse_gcode(head.decode("utf-8", "replace"), tail.decode("utf-8", "replace"))
                    log("HOOK READ OK used_g=%s time_lines=%s" % (parsed.get("used_g"), parsed["time_lines"][-2:]))
            except Exception as e:
                log("HOOK FAILED %s: %s" % (type(e).__name__, e))
            return orca.ExecutionResult.success()


@orca.plugin
class SpikePlugin(orca.base):
    def register_capabilities(self):
        request = getattr(orca, "request_permissions", None)
        if request is not None:
            kwargs = {"threading": True}
            if DECLARE_TEMP_READ:
                kwargs["fs_read"] = [os.path.join(TEMP_ROOT, "*")]
            request(**kwargs)
        orca.register_capability(SpikePage)
        if _SLICING:
            orca.register_capability(SpikeGcodeHook)
