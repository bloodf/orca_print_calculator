#!/usr/bin/env python3
"""Finish the store and README images: put a real screenshot into the empty square of each generated image, then
export the listing sizes.

    python3 scripts/brand_assets.py <shots dir>       # needs Pillow; not part of the plugin build or of CI

<shots dir> holds the captures written by ui/e2e/brand-shots.mjs (mock host, sample data, headless Chrome).
Sources are the native generated images in assets/marketing/source/; they are never modified. Every export is
recorded in assets/marketing/asset-manifest.json under "exports" (source, screenshot, operation, size, bytes, date).
"""
import datetime
import hashlib
import json
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "marketing" / "source"
MANIFEST = ROOT / "assets" / "marketing" / "asset-manifest.json"
ID = "orca_print_calculator"
MAX_BYTES = 2_000_000  # listing limit per image
INTERIORS = ((27, 34, 23), (254, 254, 254))  # the empty square is one flat colour: dark images, light images
MARK = (255, 0, 255)

LAND, SQUARE, SOCIAL, TILE = (1600, 900), (900, 900), (1280, 640), (512, 512)


def jobs():
    """(source file, screenshot or None, export path, export size)"""
    out = [("workshop-tile", None, "assets/orca-cloud/%s-tile.png" % ID, TILE)]
    for lang, main in (("en", "workshop-cover-en"),):  # English only; README.pt-BR.md keeps its earlier exports
        out.append((main, "slot-overview-dark-" + lang, "assets/orca-cloud/%s-main-%s.png" % (ID, lang), LAND))
        out.append(("workshop-main-square-" + lang, "slot-price-square-dark-" + lang, "assets/orca-cloud/%s-main-square-%s.png" % (ID, lang), SQUARE))
        for feature, shot in (("01-filament", "filament"), ("02-costs", "costs"), ("03-price", "price"), ("04-quotes", "quotes")):
            out.append(("workshop-feature-%s-%s" % (feature, lang), "slot-%s-dark-%s" % (shot, lang), "assets/orca-cloud/%s-feature-%s-%s.png" % (ID, feature, lang), LAND))
        for theme in ("dark", "light"):
            out.append(("workshop-hero-%s-%s" % (theme, lang), "slot-overview-%s-%s" % (theme, lang), "assets/readme/%s-hero-%s-%s.png" % (ID, theme, lang), LAND))
        out.append(("workshop-social-preview-" + lang, "slot-overview-social-dark-" + lang, "assets/social/%s-social-preview-%s.png" % (ID, lang), SOCIAL))
    return out


SCREENSHOTS = ["%s-%s-%s" % (view, theme, lang) for view in ("calculator", "quotes") for theme in ("dark", "light") for lang in ("en",)]


def find_square(im):
    """Mask ("L", 255 inside) and bounding box of the empty square, read from the pixels: the largest flat area in
    one of the two interior colours. The mask follows the rounded corners and stops at the frame."""
    small = im.resize((im.width // 8, im.height // 8), Image.NEAREST)
    best = None
    for colour in INTERIORS:
        hits = [(x, y) for y in range(small.height) for x in range(small.width)
                if max(abs(a - b) for a, b in zip(small.getpixel((x, y)), colour)) <= 8]
        if len(hits) < 0.03 * small.width * small.height:
            continue
        xs, ys = sorted(x for x, _ in hits), sorted(y for _, y in hits)
        seed = (xs[len(xs) // 2] * 8, ys[len(ys) // 2] * 8)
        work = im.copy()
        ImageDraw.floodfill(work, seed, MARK, thresh=14)
        diff = ImageChops.difference(work, Image.new("RGB", im.size, MARK)).split()
        mask = ImageChops.lighter(ImageChops.lighter(diff[0], diff[1]), diff[2]).point(lambda v: 255 if v == 0 else 0)
        box = mask.getbbox()
        if not box:
            continue
        w, h = box[2] - box[0], box[3] - box[1]
        area = mask.histogram()[255] / (w * h)
        if 0.85 < w / h < 1.2 and area > 0.97 and w > im.width / 4 and (best is None or w * h > best[2]):
            best = (mask, box, w * h)
    if best is None:
        raise SystemExit("no empty square found")
    mask, box, _ = best
    # close pin holes left by image noise: whatever the outside cannot reach belongs to the square
    crop = ImageOps.expand(mask.crop(box), 1, 0)
    ImageDraw.floodfill(crop, (0, 0), 128)
    mask.paste(crop.point(lambda v: 0 if v == 128 else 255).crop((1, 1, crop.width - 1, crop.height - 1)), box)
    return mask, box


def composite(source, shot):
    base = Image.open(source).convert("RGB")
    mask, box = find_square(base)
    w, h = box[2] - box[0], box[3] - box[1]
    fill = ImageOps.fit(Image.open(shot).convert("RGB"), (w, h), Image.LANCZOS, centering=(0.5, 0.0))  # cover, keep the top
    layer = base.copy()
    layer.paste(fill, box[:2])
    return Image.composite(layer, base, mask), box


def save(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise SystemExit("%s is %d bytes, over %d" % (path.relative_to(ROOT), size, MAX_BYTES))
    return {"width": im.width, "height": im.height, "bytes": size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    shots = pathlib.Path(sys.argv[1])
    today = datetime.date.today().isoformat()
    exports = []
    for name, shot, target, size in jobs():
        source = SOURCE / ("%s-%s.png" % (ID, name))
        entry = {"file": target, "source": str(source.relative_to(ROOT).as_posix())}
        if shot:
            im, box = composite(source, shots / (shot + ".png"))
            entry["screenshot"] = shot + ".png"
            entry["operation"] = "screenshot scaled to cover the empty square at %d,%d %dx%d of the source and clipped to its rounded corners; " % (box[0], box[1], box[2] - box[0], box[3] - box[1])
        else:
            im = Image.open(source).convert("RGB")
            entry["operation"] = ""
        if im.width * size[1] != im.height * size[0]:
            entry["operation"] += "centre crop to the aspect of %dx%d; " % size
        entry["operation"] += "Lanczos resize from %dx%d" % im.size
        entry.update(save(ImageOps.fit(im, size, Image.LANCZOS), ROOT / target), date=today)
        exports.append(entry)
        print(target, entry["bytes"])
    for name in SCREENSHOTS:
        target = "docs/screenshots/%s.png" % name
        im = Image.open(shots / (name + ".png")).convert("RGB")
        entry = {"file": target, "source": "ui/e2e/brand-shots.mjs", "screenshot": name + ".png",
                 "operation": "mock-host capture at device scale 2, saved as is"}
        entry.update(save(im, ROOT / target), date=today)
        exports.append(entry)
        print(target, entry["bytes"])
    manifest = json.loads(MANIFEST.read_text("utf-8"))
    manifest["exports"] = exports
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", "utf-8")


if __name__ == "__main__":
    main()
