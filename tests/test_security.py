"""Regression tests for the T3.5 security review (core.py). Each mirrors a PoC from the review.
Run: python3 -m unittest discover tests"""
import http.server
import io
import json
import os
import socket
import struct
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "orca_print_calculator"))

import core  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"


def serve(handler):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def quiet(cls):
    cls.log_message = lambda self, *a: None
    return cls


@quiet
class Recorder(http.server.BaseHTTPRequestHandler):
    hits = []

    def do_GET(self):
        Recorder.hits.append(self.path)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"[]")


def redirector(location):
    @quiet
    class Redirect(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.startswith("/moved"):
                body = json.dumps({"version": "1"}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(302)
            self.send_header("Location", location(self))
            self.end_headers()
    return Redirect


class RedirectSsrf(unittest.TestCase):  # M2
    def setUp(self):
        Recorder.hits = []
        self.target = serve(Recorder)
        self.addCleanup(self.target.shutdown)

    def fetch_code(self, location):
        a = serve(redirector(location))
        self.addCleanup(a.shutdown)
        with self.assertRaises(core.CoreError) as ctx:
            core.spoolman_fetch("127.0.0.1:%d" % a.server_port, timeout=2)
        return ctx.exception.code

    def test_cross_host_redirect_is_not_followed(self):
        url = "http://127.0.0.1:%d/internal-admin?action=x" % self.target.server_port
        self.assertEqual(self.fetch_code(lambda h: url), "redirected")
        self.assertEqual(Recorder.hits, [])  # the hop was never requested

    def test_ftp_redirect_never_connects(self):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(0.5)
        self.addCleanup(listener.close)
        url = "ftp://127.0.0.1:%d/x" % listener.getsockname()[1]
        self.assertEqual(self.fetch_code(lambda h: url), "redirected")
        with self.assertRaises(socket.timeout):
            listener.accept()[0].close()

    def test_file_redirect_refused(self):
        self.assertEqual(self.fetch_code(lambda h: "file:///etc/passwd"), "redirected")

    def test_same_origin_redirect_followed(self):
        a = serve(redirector(lambda h: "/moved"))
        self.addCleanup(a.shutdown)
        info = core._get_json("http://127.0.0.1:%d" % a.server_port, "/api/v1/info", core.open_url, 2,
                              time.monotonic() + 5)
        self.assertEqual(info, {"version": "1"})

    def test_handler_rejects_downgrade_and_port_change(self):
        handler = core._SameOriginRedirect()
        req = urllib.request.Request("https://sm.lan/api/v1/info")
        for new in ("http://sm.lan/api/v1/info", "https://sm.lan:8443/api/v1/info", "https://other.lan/x"):
            with self.assertRaises(core.CoreError, msg=new) as ctx:
                handler.redirect_request(req, None, 302, "Found", {}, new)
            self.assertEqual(ctx.exception.code, "redirected")
        self.assertIsNotNone(handler.redirect_request(req, None, 302, "Found", {}, "https://SM.lan:443/x"))


@quiet
class Trickle(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        try:
            for ch in b'{"version":"x"' + b" " * 40 + b"}":
                self.wfile.write(bytes([ch]))
                self.wfile.flush()
                time.sleep(0.2)
        except OSError:
            pass


class Deadline(unittest.TestCase):  # M1
    def test_trickle_server_hits_total_deadline(self):
        s = serve(Trickle)
        self.addCleanup(s.shutdown)
        with self.assertRaises(core.CoreError) as ctx:
            core.spoolman_fetch("127.0.0.1:%d" % s.server_port, timeout=1, deadline=1.5)
        self.assertEqual(ctx.exception.code, "timeout")  # wall time is bounded by the fake-clock test below

    def test_total_deadline_with_fake_clock(self):
        now = [0.0]

        def tick():
            now[0] += 0.5
            return now[0]
        self.addCleanup(setattr, core, "clock", core.clock)
        core.clock = tick

        class Drip(io.BytesIO):
            def read1(self, n=-1):
                return b" "  # never ends, never errors: only the deadline stops it
        timeouts = []

        def opener(req, timeout=None):
            timeouts.append(timeout)
            return Drip()
        with self.assertRaises(core.CoreError) as ctx:
            core.spoolman_fetch("http://h", opener=opener, timeout=5, deadline=15)
        self.assertEqual(ctx.exception.code, "timeout")
        self.assertEqual(timeouts, [5])  # one request; per-op timeout never above the time left
        self.assertLessEqual(now[0], 15 + 1.0)  # stopped within one clock tick of the deadline

    def test_probe_only_requests_info(self):
        seen = []

        def opener(req, timeout=None):
            seen.append(req.full_url)
            return io.BytesIO(b'{"version": "1"}')
        core.spoolman_probe("http://h:7912", opener=opener)
        self.assertEqual(seen, ["http://h:7912/api/v1/info"])

    def test_json_depth_bomb_is_bad_json(self):
        deep = b"[" * 200000 + b"]" * 200000
        with self.assertRaises(core.CoreError) as ctx:
            core.spoolman_fetch("http://h", opener=lambda req, timeout=None: io.BytesIO(deep))
        self.assertEqual(ctx.exception.code, "bad_json")


class StoreCaps(unittest.TestCase):  # M3, L3
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "quotes.json"

    def test_load_cap_larger_than_save_cap(self):
        self.assertGreater(core.STORE_LOAD_CAP, core.STORE_SAVE_CAP)

    def test_file_at_save_cap_round_trips(self):
        empty = len(json.dumps({"a": ""}, ensure_ascii=False, indent=2).encode())
        obj = {"a": "x" * (core.STORE_SAVE_CAP - empty)}
        core.save_json(self.path, obj)
        self.assertEqual(self.path.stat().st_size, core.STORE_SAVE_CAP)
        self.assertEqual(core.load_json(self.path, None), obj)

    def test_over_cap_refused_and_existing_file_untouched(self):
        core.save_json(self.path, [{"id": "old"}])
        before = self.path.read_bytes()
        with self.assertRaises(core.CoreError) as ctx:
            core.save_json(self.path, [{"note": "x" * core.STORE_SAVE_CAP}])
        self.assertEqual(ctx.exception.code, "too_large")
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(sorted(p.name for p in self.path.parent.iterdir()), ["quotes.json"])

    def test_depth_bomb_set_aside(self):
        self.path.write_bytes(b"[" * 200000 + b"]" * 200000)
        self.assertEqual(core.load_json(self.path, {"d": 1}), {"d": 1})
        self.assertFalse(self.path.exists())
        self.assertTrue(any(p.name.startswith("quotes.json.corrupt-") for p in self.path.parent.iterdir()))


def zip_bytes(flag=None, method=None, corrupt=False):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Metadata/slice_info.config", "<config><plate/></config>" * 50)
    raw = bytearray(buf.getvalue())
    cd = raw.rfind(b"PK\x01\x02")
    if flag:
        raw[6:8] = struct.pack("<H", flag)
        raw[cd + 8:cd + 10] = struct.pack("<H", flag)
    if method:
        raw[8:10] = struct.pack("<H", method)
        raw[cd + 10:cd + 12] = struct.pack("<H", method)
    if corrupt:
        raw[40:60] = b"\xff" * 20
    return bytes(raw)


class ZipHardening(unittest.TestCase):  # L1, L2
    def test_odd_zips_are_bad_zip(self):
        for label, data in [("encrypted", zip_bytes(flag=1)), ("method 99", zip_bytes(method=99)),
                            ("corrupt deflate", zip_bytes(corrupt=True)), ("bz2", zip_bytes(method=12))]:
            with self.subTest(label), self.assertRaises(core.CoreError) as ctx:
                core.read_sliced_3mf(data)
            self.assertEqual(ctx.exception.code, "bad_zip")

    def test_too_many_entries_rejected_fast(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
            for i in range(core.ZIP_ENTRY_CAP + 1):
                z.writestr("e%d" % i, b"")
            z.writestr("Metadata/slice_info.config", "<config><plate/></config>")
        t0 = time.monotonic()
        with self.assertRaises(core.CoreError) as ctx:
            core.read_sliced_3mf(buf.getvalue())
        self.assertEqual(ctx.exception.code, "bad_zip")
        self.assertLess(time.monotonic() - t0, 0.2)

    def test_read_once_returns_plates_and_fields(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("Metadata/slice_info.config", (FIX / "synthetic_slice_info.xml").read_text("utf-8"))
            z.writestr("Metadata/project_settings.config", json.dumps({"filament_settings_id": ["A", "B"]}))
        plates, fields = core.read_sliced_3mf(buf.getvalue())
        self.assertEqual([p["prediction"] for p in plates], [4180, 600])
        self.assertEqual(fields["filament_presets"], ["A", "B"])


class ExportNames(unittest.TestCase):  # L4, L11
    def test_windows_device_names_with_extra_dots(self):
        for name in ("CON.tar.html", "nul.csv.html", "com1.x.html", "con.html", "LPT9.a.b.csv"):
            safe = core.safe_export_name(name)
            self.assertTrue(safe.startswith("_"), safe)
        self.assertEqual(core.safe_export_name("console.html"), "console.html")

    @unittest.skipIf(os.name == "nt", "symlinks need privileges on Windows")
    def test_symlinked_exports_dir_refused(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as elsewhere:
            os.symlink(elsewhere, os.path.join(root, core.EXPORT_DIR))
            with self.assertRaises(core.CoreError) as ctx:
                core.write_export(root, "q.html", "x")
            self.assertEqual(ctx.exception.code, "denied")
            self.assertEqual(os.listdir(elsewhere), [])


if __name__ == "__main__":
    unittest.main()
