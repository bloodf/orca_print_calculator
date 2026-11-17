"""The tab icon OrcaSlicer shows: brand/plugin-icon.png is the store tile at 40x40.
Run: python3 -m unittest discover tests"""
import struct
import unittest
import zlib
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON = ROOT / "brand" / "plugin-icon.png"
TILE = ROOT / "assets" / "orca-cloud" / "orca_print_calculator-tile.png"


def read_png(path):
    """(width, height, rows of RGBA tuples) for 8-bit RGB/RGBA non-interlaced PNGs, stdlib only."""
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    pos, idat = 8, b""
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8 and ctype in (2, 6) and not interlace, (depth, ctype, interlace)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    bpp = 4 if ctype == 6 else 3
    raw, stride, prev, rows = zlib.decompress(idat), w * bpp, bytearray(w * bpp), []
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a, b = line[i - bpp] if i >= bpp else 0, prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            p = a + b - c
            pred = (0, a, b, (a + b) // 2, a if abs(p - a) <= abs(p - b) and abs(p - a) <= abs(p - c) else b if abs(p - b) <= abs(p - c) else c)[f]
            line[i] = (line[i] + pred) & 255
        rows.append([tuple(line[x * bpp:(x + 1) * bpp]) + ((255,) if bpp == 3 else ()) for x in range(w)])
        prev = line
    return w, h, rows


class PluginIcon(unittest.TestCase):
    def test_icon_is_the_tile_at_40px(self):
        w, h, icon = read_png(ICON)
        self.assertEqual((w, h), (40, 40))
        self.assertLess(ICON.stat().st_size, 100 * 1024)
        for x, y in ((0, 0), (39, 0), (0, 39), (39, 39)):
            self.assertLess(icon[y][x][3], 16, "corner (%d,%d) should be transparent" % (x, y))
        _, _, tile = read_png(TILE)
        band = Counter(px[:3] for row in tile for px in row).most_common(1)[0][0]
        opaque = Counter(px[:3] for row in icon for px in row if px[3] == 255)
        self.assertTrue(all(abs(a - b) <= 6 for a, b in zip(opaque.most_common(1)[0][0], band)), (opaque.most_common(1), band))
        self.assertTrue(any(min(c) > 200 for c in opaque), "the white mark is missing")


if __name__ == "__main__":
    unittest.main()
