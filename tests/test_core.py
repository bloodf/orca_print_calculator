"""Tests for core.py (orca-free). Run: python3 -m unittest discover tests"""
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path

# The package __init__ imports the host-only `orca` module, so load core.py directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "orca_print_calculator"))

import core  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"


def fx(name):
    return (FIX / name).read_text("utf-8")


class CoreImports(unittest.TestCase):
    def test_module_has_docstring(self):
        self.assertTrue(core.__doc__)


class Duration(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(core.parse_duration("1d 2h 3m 4s"), 93784)
        self.assertEqual(core.parse_duration("2h 3m"), 7380)
        self.assertEqual(core.parse_duration("45s"), 45)
        self.assertEqual(core.parse_duration("10m 7s"), 607)

    def test_garbage(self):
        for bad in ("", "abc", "1x", None, "5"):
            self.assertIsNone(core.parse_duration(bad))


class SplitMsg(unittest.TestCase):
    def test_split(self):
        self.assertEqual(core.split_export_msg("/a/b.gcode"), ("/a/b.gcode", None))
        self.assertEqual(core.split_export_msg("/a/b.gcode\nboom"), ("/a/b.gcode", "boom"))
        self.assertEqual(core.split_export_msg(None), ("", None))


class ParseGcodeOrca(unittest.TestCase):
    """Real Snapmaker U1 captures (Orca layout: config at the end of the file)."""

    def test_temp_plate(self):
        r = core.parse_gcode(fx("snapmaker_u1_temp_plate1.head.txt"), fx("snapmaker_u1_temp_plate1.tail.txt"))
        self.assertEqual(r["seconds"], 607)
        self.assertEqual(r["flavour"], "orca")
        self.assertIsNone(r["model_seconds"])
        self.assertEqual(r["total_grams"], 3.09)
        self.assertEqual(r["printer_model"], "Snapmaker U1")
        self.assertEqual([s["n"] for s in r["slots"]], [1, 2, 3])  # slot 4 is 0.00
        self.assertEqual(r["slots"][0], {"n": 1, "grams": 1.12, "mm": 374.69, "cm3": 0.9})
        self.assertEqual(r["slots"][2]["grams"], 1.05)
        self.assertEqual(r["filament_cost"], [83.1, 83.1, 83.1, 20.0])
        self.assertEqual(r["filament_density"], [1.24] * 4)
        self.assertEqual(r["filament_notes"], ["", "", "", ""])
        self.assertEqual(r["filament_colour"], ["#FFFFFF", "#000000", "#0000FF", "#080A0D"])
        self.assertEqual(r["filament_type"], ["PLA"] * 4)
        self.assertEqual(len(r["filament_presets"]), 4)
        self.assertEqual(r["filament_presets"][3], "_local/spooler/Snapmaker PLA SnapSpeed Black @Snapmaker U1")

    def test_export_5h(self):
        r = core.parse_gcode(fx("snapmaker_u1_export_5h.head.txt"), fx("snapmaker_u1_export_5h.tail.txt"))
        self.assertEqual(r["seconds"], 5 * 3600 + 5 * 60 + 15)
        self.assertEqual([s["grams"] for s in r["slots"]], [53.08, 19.05, 36.98, 0.5])
        self.assertEqual(r["slots"][3]["n"], 4)
        self.assertEqual(r["total_grams"], 109.61)

    def test_empty_gives_none_never_guess(self):
        r = core.parse_gcode("", "")
        self.assertIsNone(r["seconds"])
        self.assertIsNone(r["total_grams"])
        self.assertIsNone(r["printer_model"])
        self.assertIsNone(r["filament_cost"])
        self.assertEqual(r["slots"], [])
        self.assertEqual(r["flavour"], "orca")

    def test_consumption_state(self):  # F02: absent data is "missing", never a free plate
        cases = [
            ("", "missing"),
            ("; total filament used [g] = 12.5\n", "missing"),
            ("; total filament used [g] = 0.00\n", "zero"),
            ("; filament used [g] = 0.00, 0.00\n", "zero"),
            ("; filament used [g] = 0.00, x\n", "missing"),
            ("; filament used [mm] = 0.00\n", "missing"),
            ("; filament used [g] = 1.5, 0.00\n", "known"),
        ]
        for tail, want in cases:
            with self.subTest(tail=tail):
                self.assertEqual(core.parse_gcode("", tail)["consumption"], want)

    def test_total_from_sum_when_line_missing(self):
        tail = "; filament used [g] = 1.50, 0.00, 2.25\n"
        self.assertEqual(core.parse_gcode("", tail)["total_grams"], 3.75)


class ParseGcodeBbl(unittest.TestCase):
    """SYNTHETIC fixtures (synthetic_bbl_*.txt) built from docs/spike.md section 4.
    They must be replaced by a real Bambu capture once one exists."""

    def setUp(self):
        self.r = core.parse_gcode(fx("synthetic_bbl_head.txt"), fx("synthetic_bbl_tail.txt"))

    def test_time_uses_total_estimated(self):
        self.assertEqual(self.r["flavour"], "bbl")
        self.assertEqual(self.r["seconds"], 3600 + 9 * 60 + 40)
        self.assertEqual(self.r["model_seconds"], 3600 + 2 * 60 + 3)

    def test_usage_and_config_from_head(self):
        self.assertEqual([s["grams"] for s in self.r["slots"]], [14.92, 3.67])
        self.assertEqual(self.r["total_grams"], 18.59)
        self.assertEqual(self.r["printer_model"], "Bambu Lab X1 Carbon")
        self.assertEqual(self.r["filament_cost"], [25.5, 30.0])

    def test_quoted_values_with_separator_and_escape(self):
        self.assertEqual(self.r["filament_presets"],
                         ["Bambu PLA Basic @BBL X1C", "Generic PETG; special @BBL X1C"])
        self.assertEqual(self.r["filament_notes"], ["Spoolman filament 7", "line one\nline two; with semicolon"])


class ReadGcodeParts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, name, data):
        p = Path(self.tmp.name) / name
        p.write_bytes(data)
        return str(p)

    def test_short_file(self):
        path = self.write("a.gcode", b"; hi\n")
        self.assertEqual(core.read_gcode_parts(path), ("; hi\n", "; hi\n"))

    def test_undecodable_bytes(self):
        head, tail = core.read_gcode_parts(self.write("b.gcode", b"; ok \xff\xfe\n"))
        self.assertIn("ok", head)
        self.assertIn("\ufffd", tail)

    def test_missing_and_directory(self):
        with self.assertRaises(core.CoreError) as ctx:
            core.read_gcode_parts(str(Path(self.tmp.name) / "nope"))
        self.assertEqual(ctx.exception.code, "missing")
        with self.assertRaises(core.CoreError):
            core.read_gcode_parts(self.tmp.name)

    def test_orca_layout_head_stays_small(self):
        data = (fx("snapmaker_u1_temp_plate1.head.txt") + fx("snapmaker_u1_temp_plate1.tail.txt")).encode()
        head, tail = core.read_gcode_parts(self.write("c.gcode", data))
        self.assertLessEqual(len(head), 4096)
        r = core.parse_gcode(head, tail)
        self.assertEqual(r["seconds"], 607)
        self.assertEqual(r["printer_model"], "Snapmaker U1")

    def test_bbl_head_extends_to_config_block_end(self):
        text = fx("synthetic_bbl_head.txt")
        filler = "".join("; unrelated_key_%d = value\n" % i for i in range(1500))  # ~40 KB > 4 KB
        text = text.replace("; filament_colour", filler + "; filament_colour", 1)
        body = text + "G1 X1\n" * 100000 + fx("synthetic_bbl_tail.txt")  # file larger than head cap
        head, tail = core.read_gcode_parts(self.write("d.gcode", body.encode()))
        self.assertGreater(len(head), 4096)
        self.assertLess(len(head), core.HEAD_CAP)
        self.assertTrue(head.rstrip().endswith("CONFIG_BLOCK_END"))
        r = core.parse_gcode(head, tail)
        self.assertEqual(r["printer_model"], "Bambu Lab X1 Carbon")
        self.assertEqual(r["seconds"], 4180)
        self.assertEqual(r["total_grams"], 18.59)

    def test_head_cap(self):
        body = b"; HEADER_BLOCK_START\n; HEADER_BLOCK_END\n; CONFIG_BLOCK_START\n" + b"; x = y\n" * 200000
        head, _ = core.read_gcode_parts(self.write("e.gcode", body))
        self.assertLessEqual(len(head), core.HEAD_CAP)


class SliceInfo(unittest.TestCase):
    def test_parse_xml(self):
        plates = core.parse_slice_info(fx("synthetic_slice_info.xml"))
        self.assertEqual(len(plates), 2)
        p = plates[0]
        self.assertEqual((p["index"], p["source_index"], p["prediction"]), (0, 1, 4180))
        self.assertEqual(p["filaments"][0], {"id": 1, "used_g": 14.92, "used_m": 5.0, "type": "PLA", "color": "#FF0000"})
        self.assertEqual(p["filaments"][1]["type"], "PETG")
        self.assertEqual(plates[1]["index"], 1)
        self.assertEqual(plates[1]["prediction"], 600)

    def test_rejects_doctype_and_entities(self):
        bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><config><plate>&a;</plate></config>'
        with self.assertRaises(core.CoreError) as ctx:
            core.parse_slice_info(bomb)
        self.assertEqual(ctx.exception.code, "bad_xml")

    def test_bad_xml_and_bad_values(self):
        with self.assertRaises(core.CoreError):
            core.parse_slice_info("<config><plate>")
        plates = core.parse_slice_info(
            '<config><plate><filament id="x" used_g="nan" color="red"/></plate></config>')
        self.assertEqual(plates[0]["index"], 0)  # falls back to position
        self.assertEqual(plates[0]["filaments"][0],
                         {"id": None, "used_g": None, "used_m": None, "type": None, "color": None})

    def zip_with(self, files):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for name, data in files.items():
                z.writestr(name, data)
        return buf.getvalue()

    def test_3mf(self):
        data = self.zip_with({"Metadata/plate_1.gcode": "G1\n" * 1000,
                              "Metadata/slice_info.config": fx("synthetic_slice_info.xml")})
        plates = core.read_sliced_3mf(data)[0]
        self.assertEqual([p["prediction"] for p in plates], [4180, 600])

    def test_3mf_missing_file_and_bad_zip(self):
        self.assertEqual(core.read_sliced_3mf(self.zip_with({"a.txt": "x"})), ([], {}))
        with self.assertRaises(core.CoreError) as ctx:
            core.read_sliced_3mf(b"not a zip")
        self.assertEqual(ctx.exception.code, "bad_zip")

    def test_3mf_cap(self):
        big = "<config>" + " " * (core.SLICE_INFO_CAP + 10) + "</config>"
        with self.assertRaises(core.CoreError) as ctx:
            core.read_sliced_3mf(self.zip_with({"Metadata/slice_info.config": big}))
        self.assertEqual(ctx.exception.code, "too_large")

    def test_3mf_doctype_rejected(self):
        evil = '<!DOCTYPE a [<!ENTITY b "c">]><config/>'
        with self.assertRaises(core.CoreError):
            core.read_sliced_3mf(self.zip_with({"Metadata/slice_info.config": evil}))

    def test_project_filaments(self):
        cfg = {"filament_settings_id": ["A @X", "B"], "filament_cost": ["25.5", "x"], "filament_notes": ["n", 3],
               "filament_type": ["PLA", "PETG"]}
        got = core.read_sliced_3mf(self.zip_with({"Metadata/project_settings.config": json.dumps(cfg)}))[1]
        self.assertEqual(got, {"filament_presets": ["A @X", "B"], "filament_cost": [25.5, None],
                               "filament_notes": ["n", ""], "filament_colour": None, "filament_type": ["PLA", "PETG"]})

    def test_project_filaments_best_effort(self):
        fields = lambda files: core.read_sliced_3mf(self.zip_with(files))[1]  # noqa: E731
        self.assertEqual(fields({"a.txt": "x"}), {})
        self.assertEqual(fields({"Metadata/project_settings.config": "{bad"}), {})
        self.assertEqual(fields({"Metadata/project_settings.config": "[]"}), {})
        self.assertEqual(fields({"Metadata/project_settings.config": "[" * 100000}), {})


class NormalizeUrl(unittest.TestCase):
    def test_ok(self):
        n = core.normalize_base_url
        self.assertEqual(n("http://localhost:7912"), "http://localhost:7912")
        self.assertEqual(n("  HTTP://Spool.Local/ "), "http://spool.local")
        self.assertEqual(n("http://h:7912/api/v1/"), "http://h:7912")
        self.assertEqual(n("https://h/spoolman/api/v1"), "https://h/spoolman")
        self.assertEqual(n("localhost:7912"), "http://localhost:7912")
        self.assertEqual(n("http://h:80/?x=1#f"), "http://h:80")
        self.assertEqual(n("http://[::1]:7912/"), "http://[::1]:7912")

    def test_errors(self):
        n = core.normalize_base_url
        cases = {"": "empty", None: "empty", "ftp://h": "scheme", "file:///etc": "scheme",
                 "http://": "host", "http://u:p@h": "credentials", "http://u@h": "credentials",
                 "http://h:abc": "port", "http://h:99999": "port", "http://h /x": "invalid"}
        for text, code in cases.items():
            with self.assertRaises(ValueError, msg=repr(text)) as ctx:
                n(text)
            self.assertEqual(str(ctx.exception), code, msg=repr(text))


class FakeResp:
    def __init__(self, body, url):
        self.body = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.url = url
        self.pos = 0

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n=-1):
        out = self.body[self.pos:] if n < 0 else self.body[self.pos:self.pos + n]
        self.pos += len(out)
        return out

    def geturl(self):
        return self.url


def make_opener(routes, seen=None):
    def opener(req, timeout=None):
        url = req.full_url
        if seen is not None:
            seen.append((url, timeout))
        for suffix, result in routes.items():
            if url.endswith(suffix):
                if isinstance(result, Exception):
                    raise result
                return result(url) if callable(result) else FakeResp(result, url)
        raise AssertionError("unrouted " + url)
    return opener


GOOD = {
    "/api/v1/info": {"version": "0.27.1"},
    "/api/v1/setting/currency": {"value": '"brl"', "is_set": True},
    "/api/v1/filament": [
        {"id": 1, "name": "PLA Branco", "vendor": {"name": "3D Procer"}, "material": "PLA",
         "price": 83.1, "weight": 1000, "color_hex": "FFFFFF"},
        {"id": 2, "name": "x" * 500, "price": "free", "weight": -5, "color_hex": "zz"},
        {"name": "no id"}, "junk", {"id": True}, {"id": "3"},
    ],
    "/api/v1/spool?allow_archived=false": [
        {"id": 10, "filament": {"id": 1}, "price": 90, "initial_weight": 1000, "remaining_weight": 0, "archived": False,
         "last_used": "2026-11-01T10:00:00Z"},
        {"id": 11, "filament_id": 2, "archived": True},
        {"id": 12, "filament": {}}, 5,
    ],
}


class SpoolmanFetch(unittest.TestCase):
    def fetch(self, routes=None, **kw):
        return core.spoolman_fetch("http://sm:7912/", opener=make_opener({**GOOD, **(routes or {})}), **kw)

    def test_happy(self):
        seen = []
        r = core.spoolman_fetch("http://sm:7912/api/v1", opener=make_opener(GOOD, seen), timeout=3)
        self.assertEqual(r["currency"], "BRL")
        self.assertEqual(r["version"], "0.27.1")
        self.assertEqual(r["filaments"][0], {"id": 1, "name": "PLA Branco", "vendor": "3D Procer",
                                             "material": "PLA", "price": 83.1, "weight": 1000.0,
                                             "color_hex": "FFFFFF"})
        f2 = r["filaments"][1]
        self.assertEqual(len(f2["name"]), 200)
        self.assertIsNone(f2["price"])
        self.assertIsNone(f2["weight"])
        self.assertIsNone(f2["color_hex"])
        self.assertEqual([s["id"] for s in r["spools"]], [10, 11])
        self.assertEqual(r["spools"][0]["filament_id"], 1)
        self.assertTrue(r["spools"][1]["archived"])
        self.assertEqual(r["spools"][0]["remaining_weight"], 0.0)  # empty spool is 0, not unknown
        self.assertIsNone(r["spools"][1]["remaining_weight"])
        self.assertEqual(r["skipped"], 4 + 2)
        self.assertEqual({u for u, _ in seen},
                         {"http://sm:7912" + p for p in GOOD})
        self.assertTrue(all(t == 3 for _, t in seen))

    def test_currency_unset_or_invalid(self):
        for payload in ({"value": '"EUR"', "is_set": False}, {"value": '"EURO"'}, {"value": 5}, []):
            self.assertIsNone(self.fetch({"/api/v1/setting/currency": payload})["currency"])
        self.assertIsNone(self.fetch({"/api/v1/setting/currency":
                                      urllib.error.HTTPError("u", 404, "nf", {}, None)})["currency"])
        self.assertEqual(self.fetch({"/api/v1/setting/currency": {"value": "usd"}})["currency"], "USD")

    def code(self, routes=None, url="http://sm:7912"):
        with self.assertRaises(core.CoreError) as ctx:
            core.spoolman_fetch(url, opener=make_opener({**GOOD, **(routes or {})}))
        return ctx.exception.code

    def test_error_codes(self):
        info = "/api/v1/info"
        self.assertEqual(self.code({info: TimeoutError("t")}), "timeout")
        self.assertEqual(self.code({info: urllib.error.URLError(TimeoutError("t"))}), "timeout")
        self.assertEqual(self.code({info: urllib.error.URLError(ConnectionRefusedError("r"))}), "unreachable")
        self.assertEqual(self.code({info: OSError("net down")}), "unreachable")
        self.assertEqual(self.code({info: urllib.error.HTTPError("u", 500, "x", {}, None)}), "http_500")
        self.assertEqual(self.code({info: PermissionError("audit")}), "denied")
        self.assertEqual(self.code({info: urllib.error.URLError(PermissionError("audit"))}), "denied")
        self.assertEqual(self.code({info: b"<html>"}), "bad_json")
        self.assertEqual(self.code({info: b"\xff\xfe"}), "bad_json")
        self.assertEqual(self.code({"/api/v1/filament": {"a": 1}}), "bad_json")
        self.assertEqual(self.code({"/api/v1/spool?allow_archived=false": "x"}), "bad_json")
        self.assertEqual(self.code(url="ftp://sm"), "bad_url")

    def test_too_large(self):
        big = b'{"version": "' + b"a" * (core.SPOOLMAN_MAX_BYTES + 5) + b'"}'
        self.assertEqual(self.code({"/api/v1/info": big}), "too_large")

    def test_cross_host_redirect(self):
        other = lambda url: FakeResp({"version": "1"}, "http://evil.example/api/v1/info")  # noqa: E731
        self.assertEqual(self.code({"/api/v1/info": other}), "redirected")

    def test_same_host_redirect_ok(self):
        same = lambda url: FakeResp({"version": "1"}, "http://SM:7912/other/path")  # noqa: E731
        self.assertEqual(self.fetch({"/api/v1/info": same})["version"], "1")


class SpoolerFiles(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def put(self, name, text):
        (self.dir / "spooler").mkdir(exist_ok=True)
        (self.dir / "spooler" / name).write_text(text, "utf-8")

    def test_detected(self):
        self.put("profiles.json", json.dumps({"filaments": {
            "12": {"Snapmaker U1": "_local/spooler/3D Procer PLA Branco @Snapmaker U1",
                   "Other": "_local/spooler/3D Procer PLA Branco @Other"},
            "x": {"P": "_local/spooler/skip"}, "7": "not a dict"}}))
        self.put("spooler_settings.json", json.dumps({"spoolman_url": "http://h:7912/api/v1/"}))
        r = core.read_spooler_files(str(self.dir))
        self.assertTrue(r["detected"])
        self.assertEqual(r["spoolman_url"], "http://h:7912")
        m = r["preset_to_filament"]
        self.assertEqual(m["_local/spooler/3D Procer PLA Branco @Snapmaker U1"], 12)
        self.assertEqual(m["3D Procer PLA Branco @Snapmaker U1"], 12)
        self.assertNotIn("skip", m)

    def test_failures_not_detected(self):
        empty = {"detected": False, "spoolman_url": None, "preset_to_filament": {}}
        self.assertEqual(core.read_spooler_files(str(self.dir)), empty)
        self.assertEqual(core.read_spooler_files(str(self.dir / "nope")), empty)
        self.assertEqual(core.read_spooler_files(None), empty)
        self.put("profiles.json", "{broken")
        self.put("spooler_settings.json", "[1]")
        self.assertEqual(core.read_spooler_files(str(self.dir)), empty)
        self.put("profiles.json", json.dumps({"filaments": []}))
        self.put("spooler_settings.json", json.dumps({"spoolman_url": "ftp://x"}))
        self.assertEqual(core.read_spooler_files(str(self.dir)), empty)

    def test_url_only(self):
        self.put("spooler_settings.json", json.dumps({"spoolman_url": "http://h"}))
        r = core.read_spooler_files(str(self.dir))
        self.assertTrue(r["detected"])
        self.assertEqual(r["preset_to_filament"], {})


class Storage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_roundtrip_and_no_tmp_left(self):
        p = self.dir / "sub" / core.SETTINGS_FILE
        core.save_json(p, {"a": [1, "é"]})
        self.assertEqual(core.load_json(p, {}), {"a": [1, "é"]})
        core.save_json(p, {"a": 2})
        self.assertEqual(core.load_json(p, {}), {"a": 2})
        self.assertEqual([f.name for f in p.parent.iterdir()], [core.SETTINGS_FILE])

    def test_default_when_missing_is_a_copy(self):
        default = {"k": []}
        got = core.load_json(self.dir / "none.json", default)
        got["k"].append(1)
        self.assertEqual(default, {"k": []})

    def test_corrupt_is_set_aside(self):
        p = self.dir / core.QUOTES_FILE
        p.write_text("{oops", "utf-8")
        self.assertEqual(core.load_json(p, []), [])
        self.assertFalse(p.exists())
        aside = [f for f in self.dir.iterdir() if f.name.startswith(core.QUOTES_FILE + ".corrupt-")]
        self.assertEqual(len(aside), 1)
        self.assertEqual(aside[0].read_text("utf-8"), "{oops")
        p.write_bytes(b"\xff\xfe")  # second corruption in the same second must not clobber the first
        core.load_json(p, [])
        self.assertEqual(len([f for f in self.dir.iterdir() if ".corrupt-" in f.name]), 2)

    def test_oversize_is_set_aside(self):
        p = self.dir / "big.json"
        p.write_bytes(b" " * (core.JSON_FILE_CAP + 1))
        self.assertEqual(core.load_json(p, {"d": 1}), {"d": 1})
        self.assertFalse(p.exists())

    def test_save_unserialisable_keeps_old_file(self):
        p = self.dir / "s.json"
        core.save_json(p, {"ok": 1})
        for bad in ({"x": object()}, {"x": float("nan")}):
            with self.assertRaises(core.CoreError):
                core.save_json(p, bad)
        self.assertEqual(core.load_json(p, None), {"ok": 1})
        self.assertEqual(len(list(self.dir.iterdir())), 1)

    def test_save_does_not_mutate_input(self):
        obj = {"a": [1, 2]}
        core.save_json(self.dir / "m.json", obj)
        self.assertEqual(obj, {"a": [1, 2]})


class Exports(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_names(self):
        s = core.safe_export_name
        self.assertEqual(s("quote-123.html"), "quote-123.html")
        self.assertEqual(s("Quote 1.CSV"), "Quote_1.csv")
        self.assertEqual(s("../../etc/passwd.html"), "passwd.html")
        self.assertEqual(s("/abs/path/x.csv"), "x.csv")
        self.assertEqual(s("..\\..\\win\\x.html"), "x.html")
        self.assertEqual(s("C:\\Users\\a\\x.html"), "x.html")
        self.assertEqual(s("a\x00b.html"), "a_b.html")
        self.assertEqual(s(".hidden.html"), "hidden.html")
        self.assertEqual(s("nul.html"), "_nul.html")
        long = s("a" * 500 + ".html")
        self.assertEqual(len(long), core.EXPORT_NAME_MAX)
        self.assertTrue(long.endswith(".html"))

    def test_bad_names(self):
        for bad, code in (("x.exe", "extension"), ("x", "extension"), ("x.html.exe", "extension"),
                          (".html", "extension"), ("_.html", "name"), ("../", "extension"), ("config.html", "denied"),
                          ("Secret.csv", "denied"), (None, "name"), (5, "name")):
            with self.assertRaises(ValueError, msg=repr(bad)) as ctx:
                core.safe_export_name(bad)
            self.assertEqual(str(ctx.exception), code, msg=repr(bad))

    def test_write_export_stays_inside(self):
        root = Path(self.tmp.name)
        for name in ("q.html", "../../escape.csv", "/etc/evil.html", "..\\x.csv", "a\x00b.html"):
            path = Path(core.write_export(root, name, "<p>é</p>"))
            self.assertEqual(path.parent, root / core.EXPORT_DIR)
            self.assertEqual(path.read_text("utf-8"), "<p>é</p>")
        self.assertEqual({p.name for p in root.iterdir()}, {core.EXPORT_DIR})

    def test_write_export_rejects(self):
        with self.assertRaises(ValueError):
            core.write_export(self.tmp.name, "x.exe", "t")
        with self.assertRaises(core.CoreError):
            core.write_export(self.tmp.name, "x.html", b"bytes")
        with self.assertRaises(core.CoreError) as ctx:
            core.write_export(self.tmp.name, "x.html", "a" * (core.EXPORT_CAP + 1))
        self.assertEqual(ctx.exception.code, "too_large")


class DenyList(unittest.TestCase):
    def test_helper(self):
        for bad in ("/a/config/x", "/a/Conf/x", "C:\\a\\secrets\\x", "/a/cert", "/a/certs/x.html",
                    "/a/my.conf", "/a/x.INI", "secret"):
            self.assertTrue(core.deny_listed(bad), bad)
        for ok in ("/a/plugin_data/orca_print_calculator/settings.json", "/a/configuration/x",
                   "/a/slice_info.config", "/a/certificate.html"):
            self.assertFalse(core.deny_listed(ok), ok)

    def test_our_files_pass(self):
        self.assertEqual(core.SETTINGS_FILE, "settings.json")
        self.assertEqual(core.QUOTES_FILE, "quotes.json")
        base = Path("/Users/x/Library/Application Support/OrcaSlicer/orca_plugins/plugin_data/orca_print_calculator")
        for rel in (core.SETTINGS_FILE, core.QUOTES_FILE, core.EXPORT_DIR, core.EXPORT_DIR + "/quote-1.html",
                    core.EXPORT_DIR + "/quote-1.csv", "icon.svg"):
            self.assertFalse(core.deny_listed(base / rel), rel)
        self.assertFalse(core.deny_listed("spooler/profiles.json"))
        self.assertFalse(core.deny_listed("spooler/spooler_settings.json"))
        self.assertFalse(core.deny_listed(core.safe_export_name("quote-9.html")))


if __name__ == "__main__":
    unittest.main()
