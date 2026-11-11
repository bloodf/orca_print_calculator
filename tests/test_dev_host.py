"""scripts/dev_host.py (the UI e2e driver's host) must still turn a `slice` line into a `plates` event."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DevHost(unittest.TestCase):
    def test_slice_line_emits_plates(self):
        with tempfile.TemporaryDirectory() as tmp:
            storage = Path(tmp) / "OrcaSlicer" / "orca_plugins" / "plugin_data" / "orca_print_calculator"
            lines = [{"page": {"type": "ready"}}, {"page": {"type": "cmd", "id": 1, "cmd": "get_state", "args": {}}},
                     {"slice": [0, "snapmaker_u1_temp_plate1.head.txt", "snapmaker_u1_temp_plate1.tail.txt"]}]
            out = subprocess.run([sys.executable, str(ROOT / "scripts" / "dev_host.py"), str(storage)],
                                 input="".join(json.dumps(x) + "\n" for x in lines), capture_output=True,
                                 text=True, timeout=60, check=True).stdout
        msgs = [json.loads(line) for line in out.splitlines() if line.strip()]
        plates = [m for m in msgs if m.get("type") == "event" and m.get("name") == "plates"]
        self.assertEqual(len(plates), 1, out)
        self.assertEqual(plates[0]["data"]["plates"][0]["seconds"], 607)


if __name__ == "__main__":
    unittest.main()
