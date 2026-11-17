# Image-generation prompts

The mark and the tab icon are **vector-composed** (`brand/src/build.mjs`); the SVG is the source of truth for the mark. The prompts below are for exploring variants of the mark and the empty-state illustrations with an image model.

The store tile, the listing, social and README images are generated photographs. Their exact prompts are recorded per file in `assets/marketing/asset-manifest.json`, and the screenshots inside them are real captures of the plugin's page (sample data, mock host, not inside OrcaSlicer).

## Shared style block (append to every prompt)
```
Brand: "Print Calculator", an OrcaSlicer plugin that prices 3D prints. Palette: deep green #446600, lime #B9DC6C, graphite #2B2B2B, off-white #FAFAFA, the price figure in lime; amber only for warnings. Flat vector, precise engineering feel; 1.5px strokes, 2px corner radius, generous negative space, geometric sans-serif type. Pixel-sharp edges, solid fills, no texture.
Negative prompt: glossy 3D render, gradient, glow, drop shadow, robot, AI motif, sparkle, orca/whale mascot, coins, dollar-sign clipart, emoji, stock photo, hands, watermark, misspelled or extra text; no text unless stated.
```

## 1. Logo mark
```
Size: 1024x1024. Background: transparent.
Minimal logo mark: a price tag pointing left, drawn as a single outline (flat right edge, angled left point), stroke weight about 8% of the mark's width, round caps and joins. A solid circular punch hole sits inside the left point. To the right of the hole, two short parallel horizontal bars (layer lines) stacked with a gap equal to the stroke weight. Single color deep green #446600. Geometric, optically centered, legible at 16px, nothing else.
Negative prompt: shading, ring or circle around the tag, spool, string, text, arrows, face.
```

## 2. Tab icon
The store tile at 40x40, no prompt of its own: `brand/plugin-icon.png`. The header glyph `ui/src/icon.svg` is hand-authored: same geometry as the mark, 24x24 viewBox, `stroke-width="1.5"`, round caps and joins, `currentColor`.

## 3. Empty-state illustrations (x3)
```
Size: 240x160. Background: transparent. Single-stroke line illustration, 1.5px stroke, round caps and joins, one color lime #B9DC6C on transparent, secondary lines at 40% opacity, no fills.
(a) unsliced build plate: isometric flat bed with faint grid and a dashed isometric box on it where a part will go.
(b) unplugged spool for "Spoolman not connected": spool front-on with concentric rings at left and a cable running out of it, a gap, then a plug with two prongs and its own cable at right.
(c) blank quote sheet: page with folded corner, faint placeholder lines, dashed line at the bottom for the total.
Negative prompt: fills, shadows, faces, text.
```
