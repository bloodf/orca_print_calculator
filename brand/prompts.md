# Image-generation prompts

Every asset was **vector-composed** (`brand/src/build.mjs`), not generated: no image-generation tool was available. These prompts are for exploring variants with an image model; the SVG is the source of truth for the mark.

Note: the UI mocks in sections 4 and 5 are design mockups, not product screenshots. Real screenshots of the plugin UI (sample data, mock host, not inside OrcaSlicer) are in `docs/screenshots/`.

## Shared style block (append to every prompt)
```
Brand: "Orca Print Calculator", an OrcaSlicer plugin that prices 3D prints. Palette: Orca teal #009688, deep teal #00675B, graphite #2B2B2B, off-white #FAFAFA, one warm amber #F5A524 used only for the price figure. Flat vector, precise engineering feel; 1.5px strokes, 2px corner radius, generous negative space, geometric sans-serif type. Pixel-sharp edges, solid fills, no texture.
Negative prompt: glossy 3D render, gradient, glow, drop shadow, robot, AI motif, sparkle, orca/whale mascot, coins, dollar-sign clipart, emoji, stock photo, hands, watermark, misspelled or extra text; no text unless stated.
```

## 1. Logo mark
```
Size: 1024x1024. Background: transparent.
Minimal logo mark: a price tag pointing left, drawn as a single outline (flat right edge, angled left point), stroke weight about 8% of the mark's width, round caps and joins. A solid circular punch hole sits inside the left point. To the right of the hole, two short parallel horizontal bars (layer lines) stacked with a gap equal to the stroke weight. Single color teal #009688. Geometric, optically centered, legible at 16px, nothing else.
Negative prompt: shading, ring or circle around the tag, spool, string, text, arrows, face.
```

## 2. Tab icon
Hand-authored SVG, no image-model prompt: `ui/src/icon.svg`. Same geometry as the mark, 24x24 viewBox, `stroke-width="1.5"`, round caps and joins, `currentColor`, rendered at 20px.

## 3. Hub listing icon
```
Size: 512x512 and 256x256. Background: transparent corners.
App icon: rounded-square tile, graphite #2B2B2B, corner radius 22%, 1px inner border #4A4A4A inset 12px. Logo mark in light teal #2EBBAA centered at 60% of tile width. Nothing else.
Negative prompt: gloss, bevel, shadow, gradient, text.
```

## 4. README hero
```
Size: 1600x640. Background: graphite #2B2B2B, 4px teal rule along the top edge.
Left third (only text here): logo mark, wordmark "Orca Print Calculator" in bold geometric sans (white), tagline "Price every plate." in light teal, small muted line "Calculator for OrcaSlicer".
Right two thirds: flat dark UI mock of a slicer tab in a window frame: three build-plate cards (bed thumbnail with 1-2 simple colored blocks, plate name, time, two filament chips with color dots, cost at right) beside a panel with a five-row cost breakdown bar list (Filament, Energy, Labor, Failure losses, Margin) and one large amber #F5A524 price "$28.90" labelled "Suggested price". Use short labels and numbers only where listed; every other line of text is an abstract grey bar.
Negative prompt: any other text, perspective tilt, device mockup frame.
```

## 5. Hub description images (x4, plus pt-BR variants)
```
Size: 1280x800 each. Background: graphite. Small mark + "Orca Print Calculator" top-left in muted grey, large bold caption in off-white with a short teal rule beneath, flat dark UI mock filling the lower 65%.
1. "Every plate, priced" / pt-BR "Cada placa, precificada": plate cards plus cost breakdown, amber total.
2. "Real filament cost from Spoolman" / pt-BR "Custo real de filamento via Spoolman": rows linking printer slots (AMS A1...) to spool color ring, name, remaining bar, price per kg.
3. "Know your margin on every channel" / pt-BR "Saiba sua margem em cada canal": user-defined channel rows Direct, Online store, Marketplace, Wholesale (pt-BR: Direto, Loja online, Marketplace, Atacado) with illustrative fee, amber price, margin bar.
4. "Send a quote in one click" / pt-BR "Envie um orçamento em um clique": white printable quote sheet with line items and a graphite total bar with amber total.
Text allowed: the caption and the price figures named for each image; every other label is an abstract grey bar. Quote sheet carries a placeholder shop name ("Studio Layer"), not the plugin brand.
Negative prompt: lorem ipsum, real marketplace names or logos, extra text.
```

## 6. Social preview
```
Size: 1280x640. Background: graphite, 6px teal rule across the top.
Left-center: logo mark (light teal), wordmark "Orca Print Calculator" bold white, short teal rule, tagline "Price every plate." in light teal, muted line "Calculator for OrcaSlicer". Bottom-right muted "OrcaSlicer plugin".
Negative prompt: illustration, UI mock, gradient.
```

## 7. Empty-state illustrations (x3)
```
Size: 240x160. Background: transparent. Single-stroke line illustration, 1.5px stroke, round caps and joins, one color teal #2EBBAA on transparent, secondary lines at 40% opacity, no fills.
(a) unsliced build plate: isometric flat bed with faint grid and a dashed isometric box on it where a part will go.
(b) unplugged spool for "Spoolman not connected": spool front-on with concentric rings at left and a cable running out of it, a gap, then a plug with two prongs and its own cable at right.
(c) blank quote sheet: page with folded corner, faint placeholder lines, dashed line at the bottom for the total.
Negative prompt: fills, shadows, faces, text.
```
