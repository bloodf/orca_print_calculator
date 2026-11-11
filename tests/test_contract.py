"""The committed contract fixtures (tests/contract/*.json) must equal a fresh run of scripts/gen_contract.py.
A host change that alters any message shape fails here until the fixtures are regenerated, and the UI
suite (ui/tests/contract.test.ts) then replays the new shapes through the real bridge and store."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_gen():
    spec = importlib.util.spec_from_file_location("gen_contract", ROOT / "scripts" / "gen_contract.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ContractFixtures(unittest.TestCase):
    def test_committed_fixtures_match_the_host(self):
        gen = load_gen()
        fresh = gen.generate()
        for name, steps in fresh.items():
            with self.subTest(scenario=name):
                path = gen.OUT / (name + ".json")
                self.assertTrue(path.is_file(), "missing %s: run python3 scripts/gen_contract.py" % path.name)
                self.assertEqual(path.read_text("utf-8"), gen.dump(steps),
                                 "%s drifted from the host: run python3 scripts/gen_contract.py" % path.name)

    def test_every_message_is_json_shaped(self):
        fresh = load_gen().generate()
        for name, steps in fresh.items():
            for step in steps:
                for msg in step["out"]:
                    self.assertIn(msg["type"], ("res", "event"), name)
                    if msg["type"] == "res":
                        self.assertIsInstance(msg["ok"], bool)
                        if not msg["ok"]:
                            self.assertIsInstance(msg["error"], str)


if __name__ == "__main__":
    unittest.main()
