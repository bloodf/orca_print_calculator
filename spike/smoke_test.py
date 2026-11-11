"""Smoke test: run the spike against a fake orca module and a real G-code fixture."""
import enum, importlib.util, os, shutil, sys, tempfile, types, json, base64, io, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
store = tempfile.mkdtemp()
orca = types.ModuleType("orca")
posted = []

class PagesBase:
    def __init__(self): pass
    def post_message(self, m): posted.append(m)

class Step(enum.Enum):
    posSlice = 1; psGCodePostProcess = 2
class Code(enum.Enum):
    Ok = 0; Error = 1; Warn = 2
class LE(enum.Enum):
    GCodeExportFinished = 1; SlicingJobComplete = 2; PresetSelected = 3

class Preset:
    def __init__(self, name, cfg): self.name, self.cfg, self.is_system, self.bundle_id = name, cfg, True, ""
    def config_value(self, k): return self.cfg.get(k)

class Bundle:
    def current_printer_preset(self): return Preset("Snapmaker U1", {"printer_model": "Snapmaker U1"})
    def current_filament_presets(self): return [Preset("PLA", {"filament_cost": "20"}), None]
    def full_config_value(self, k): return "x"

class Model:
    def current_plate_index(self): return 2
    def object_count(self): return 3

registered = []
orca.pages = types.SimpleNamespace(PagesPluginCapabilityBase=PagesBase)
orca.slicing = types.SimpleNamespace(SlicingPipelineCapabilityBase=object, Step=Step)
orca.PluginType = types.SimpleNamespace(Pages="Pages")
orca.ExecutionResult = types.SimpleNamespace(success=lambda *a: "ok")
orca.LifecycleEvent = LE
orca.host = types.SimpleNamespace(plugin=types.SimpleNamespace(storage=lambda: store), preset_bundle=Bundle,
                                  model=Model, plater=lambda: types.SimpleNamespace(project_path=lambda: "/p.3mf"),
                                  app_info=lambda: {"v": "2.5.0"})
orca.base = object
orca.plugin = lambda cls: cls
perms = {}
orca.request_permissions = lambda **kw: perms.update(kw)
orca.register_capability = registered.append
sys.modules["orca"] = orca

spec = importlib.util.spec_from_file_location("spike", ROOT + "/spike/print_calc_spike.py")
spike = importlib.util.module_from_spec(spec); spec.loader.exec_module(spike)
spike.SpikePlugin().register_capabilities()
assert perms == {"threading": True}, perms
assert len(registered) == 2

# fake temp gcode = fixture head + tail
gdir = tempfile.mkdtemp(); g = os.path.join(gdir, ".1.0.gcode")
with open(g, "wb") as f:
    f.write(open(ROOT + "/tests/fixtures/snapmaker_u1_temp_plate1.head.txt", "rb").read())
    f.write(b"\n" * 10000)
    f.write(open(ROOT + "/tests/fixtures/snapmaker_u1_temp_plate1.tail.txt", "rb").read())

page = spike.SpikePage(); page.on_load()
html = page.get_ui(); assert len(html) > 250_000 and 'type="module"' in html
page.on_message({"type": "ready", "html_length": 1})
ctx = lambda **k: types.SimpleNamespace(**{"msg": "", "name": "", "previous_name": "", "index": -1, "id": "", "device_id": "",
                                          "job_id": "", "source": "", "dirty": False, "code": Code.Ok, **k})
import threading
t = threading.Thread(target=page.on_lifecycle_event, args=(LE.GCodeExportFinished, ctx(msg=g))); t.start(); t.join()
page.on_lifecycle_event(LE.SlicingJobComplete, ctx())
page.on_message(json.dumps({"type": "cmd", "cmd": "dump"}))
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z: z.writestr("Metadata/slice_info.config", "<config><plate><metadata key=\"index\" value=\"1\"/></plate></config>")
page.on_message({"type": "cmd", "cmd": "import", "name": "a.gcode.3mf", "b64": base64.b64encode(buf.getvalue()).decode()})
page.on_message({"type": "cmd", "cmd": "read_path", "path": "/nonexistent"})

log = open(os.path.join(store, "spike.log")).read()
print(log[-3500:])
for needle in ("STASH path=", "PAIR stash_depth=1", "CAPTURE READ OK", '"used_g": [1.12, 0.92, 1.05, 0.0]',
               "estimated printing time (normal mode) = 10m 7s", "filament_notes", "CAPTURE SIBLINGS", "DUMP ",
               "IMPORT slice_info.config", "PATH read FAILED"):
    assert needle in log, needle
assert os.path.exists(os.path.join(store, "fixtures/plate2_1.tail.txt"))
assert "[worker:" in log and "[ui:" in log
print("SMOKE OK")
shutil.rmtree(store); shutil.rmtree(gdir)
