"""Release metadata: the version, the changelog section Orca Cloud receives, and the publish workflow's contract.
Run: python3 -m unittest discover tests"""
import re
import sys
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import release_notes  # noqa: E402

PROJECT = tomllib.loads((ROOT / "pyproject.toml").read_text("utf-8"))["project"]
PUBLISH = (ROOT / ".github" / "workflows" / "publish-orcacloud.yml").read_text("utf-8")
CHANGELOG = (ROOT / "CHANGELOG.md").read_text("utf-8")


class ReleaseNotes(unittest.TestCase):
    def test_version_is_numeric_and_has_a_dated_section(self):
        version = PROJECT["version"]
        self.assertRegex(version, r"^\d+\.\d+\.\d+$")
        self.assertRegex(CHANGELOG, r"(?m)^## \[%s\] - \d{4}-\d{2}-\d{2}$" % re.escape(version))
        self.assertTrue(release_notes.section(CHANGELOG, version))

    def test_missing_or_empty_section_is_refused(self):
        self.assertIsNone(release_notes.section(CHANGELOG, "99.0.0"))
        self.assertEqual(release_notes.section("## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n- x\n", "Unreleased"), "")

    def test_section_stops_at_the_next_version(self):
        text = "## [2.0.0] - 2026-02-01\n- new\n### Fixed\n- a\n\n## [1.0.0] - 2026-01-01\n- old\n"
        self.assertEqual(release_notes.section(text, "2.0.0"), "- new\n### Fixed\n- a")

    def test_orca_cloud_copy_fits_the_changelog_field(self):
        full = release_notes.section(CHANGELOG, PROJECT["version"])
        footer = "\n\n... Full notes: https://github.com/bloodf/orca_print_calculator/releases/tag/v%s" % PROJECT["version"]
        short = release_notes.fit(full, 3900, footer)
        self.assertLessEqual(len(short), 4000)
        self.assertLessEqual(len(short.encode("utf-8")), 3900)
        if short != full:
            self.assertTrue(short.endswith(footer))
            self.assertTrue(full.startswith(short[:-len(footer)]))
        self.assertEqual(release_notes.fit(full, 0, footer), full)


class WheelPackaging(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import tempfile
        import zipfile
        import build
        cls.zip = zipfile.ZipFile(build.build(out_dir=Path(tempfile.mkdtemp())))
        cls.addClassCleanup(cls.zip.close)

    def test_licenses_travel_with_the_wheel(self):
        di = "orca_print_calculator-%s.dist-info/licenses/" % PROJECT["version"]
        names = set(self.zip.namelist())
        self.assertEqual(self.zip.read(di + "LICENSE"), (ROOT / "LICENSE").read_bytes())
        for name in ("Vue.txt", "PrimeVue.txt", "PrimeUIX.txt"):
            self.assertIn(di + name, names)

    def test_page_is_offline(self):
        page = self.zip.read("orca_print_calculator/_assets.py").decode("utf-8")
        # A real @import is followed by a quote or url(; PrimeVue 5's style sanitizer only names "@import\s+" in a regex.
        self.assertIsNone(re.search(r"<script[^>]+src=|<link[^>]+href=.?https?:|@import\s*(?:url\(|['\"])|url\(https?:|\bnew Function\b|\beval\(", page))


class PublishWorkflow(unittest.TestCase):
    def test_runs_on_published_release_only(self):
        self.assertRegex(PUBLISH, r"(?m)^on:\n  release:\n    types: \[published\]\n")
        self.assertNotRegex(PUBLISH, r"(?m)^  workflow_dispatch")
        self.assertNotRegex(PUBLISH, r"(?m)^  push:")

    def test_tag_version_and_audience(self):
        self.assertIn("github.event.release.tag_name", PUBLISH)
        self.assertIn('"$TAG" != "v$version"', PUBLISH)
        self.assertIn("--release-tag", PUBLISH)
        self.assertIn("audience=orcacloud", PUBLISH)
        self.assertIn("api/v1/plugin-publish/releases", PUBLISH)
        self.assertIn("add-mask", PUBLISH)

    def test_same_gates_as_ci(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text("utf-8")
        for step in ("pnpm -C ui install --frozen-lockfile", "node ui/shared/scripts/check.mjs", "pnpm -C ui lint",
                     "pnpm -C ui typecheck", "pnpm -C ui test:coverage", "scripts/gen_contract.py --check",
                     "python -m unittest discover tests", "-le 960000"):
            self.assertIn(step, ci, step)
            self.assertIn(step, PUBLISH, step)

    def test_pinned_actions_match_ci(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text("utf-8")
        uses = lambda text: set(re.findall(r"uses: (\S+@[0-9a-f]{40})", text))
        self.assertTrue(uses(PUBLISH))
        self.assertEqual(uses(PUBLISH), uses(ci))
        self.assertEqual(len(re.findall(r"uses: \S+", PUBLISH)), len(re.findall(r"uses: \S+@[0-9a-f]{40}", PUBLISH)))


if __name__ == "__main__":
    unittest.main()
