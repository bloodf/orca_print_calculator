# Orca Print Calculator — brand

## Name and tagline
- Name: **Orca Print Calculator** (never "OrcaCalc", never "Orca Calculator"). Always written in full; "Orca" alone refers to OrcaSlicer.
- Tagline en: **Price every plate.**
- Tagline pt-BR: **Precifique cada placa.**
- Descriptor en: Calculator for OrcaSlicer. pt-BR: Calculadora para OrcaSlicer.

## Voice
Workshop-precise, plain, numerate. Says what the number is and where it came from. Short sentences, active verbs, units always shown. pt-BR uses the imperative ("Precifique", "Envie"), not the formal "o usuário". No hype ("revolutionary", "powerful"), no exclamation marks, no AI talk, no emoji. Money and grams are the heroes; the copy stays out of their way.

## Palette
Since 0.5.0 the plugin is lime, the accent it has in the Orca UI foundation 4 family (each sibling plugin has its own). The suggested price is the hero, in the accent. Amber is for warnings only: a partial price, a missing value, a stand-in price.

| Token | Hex | Use |
|---|---|---|
| Deep green | `#446600` | The app band (same in both themes), the mark on light surfaces, fills under white text |
| Lime | `#B9DC6C` | Mark, rules, bars, text and the price on graphite (dark-theme counterpart of deep green) |
| Graphite | `#2B2B2B` | Dark surface for marketing images; text on light |
| Off-white | `#FAFAFA` | Light surface; text on dark |
| Muted (dark) | `#A8A8A8` | Secondary text on graphite |
| Muted (light) | `#5C6664` | Secondary text on off-white |
| Warning amber, light | `#7A4F00` | Warnings on light surfaces only (from the shared palette) |
| Warning amber, dark | `#F3CC70` | Warnings on dark surfaces only (from the shared palette) |

Brand values above are for assets and docs. The plugin UI takes every colour from the shared foundation (`ui/shared`, `--oui-*` tokens) with the `lime` accent (`installOrcaUI(app, locale, "lime")` in `ui/src/orcaUi.ts`); it writes no colour of its own.

### Contrast (WCAG 2.x, computed)
| Pair | Ratio | Verdict |
|---|---|---|
| `#2B2B2B` on `#FAFAFA` (and reverse) | 13.57 | AAA text |
| `#446600` on `#FFFFFF` | 6.67 | AA text |
| `#446600` on `#FAFAFA` | 6.39 | AA text |
| `#FFFFFF` on `#446600` | 6.67 | AA text (the app band) |
| `#B9DC6C` on `#2B2B2B` | 9.11 | AAA text |
| `#B9DC6C` on `#343434` | 8.01 | AAA text |
| `#A8A8A8` on `#2B2B2B` | 5.95 | AA text |
| `#5C6664` on `#FAFAFA` | 5.68 | AA text |
| `#7A4F00` on `#FFFFFF` | 7.13 | AA text |
| `#446600` on `#2B2B2B` | 2.12 | **Fail** — never use deep green on dark |
| `#B9DC6C` on `#FFFFFF` | 1.55 | **Fail** — never use lime on light |

### UI rules (plugin CSS)
- No colour literals in `ui/src`: use `--oui-*` tokens (`--oui-primary` for the accent, `--oui-warning` for warnings), or `.orca-dark` for anything else. Never `light-dark()`. `ui/tests/themeContrast.test.ts` checks the pairs from the shared palette.
- Price figure: the hero readout in the accent band, one per screen. A partial price leaves the band for the warning tint and is marked incomplete; a loss takes the danger tint.
- The printed quote is the customer's document: white paper, the shop's own logo and rule colour (Settings, Quote sheet), ink text. It does not use the plugin's palette.

Rule of thumb: on light, green text is `#446600`; on dark, it is `#B9DC6C`.

## Typography
- Assets (build on macOS: text uses the system Avenir Next, other OSes fall back to different metrics): geometric sans, bold (700) for wordmark and headlines, semibold (600) for labels. Rendered assets use Avenir Next with Helvetica Neue fallback (system fonts, no licensing).
- Plugin UI: Manrope, embedded by the shared foundation (`ui/shared/src/fonts`, a `data:` font allowed by the page policy `font-src data:`). Tabular numerals for money and weights.
- Scale (assets): wordmark 34-56, headline 52, label 12-18. Letter-spacing -0.01em on display sizes only.

## Logo
The mark: a price tag pointing left (the "price"), a punched hole at its point, two layer-line bars on the face (the "print"). 24x24 grid, 1.5 stroke, round caps and joins, single color. Spool meaning lives in the empty states and copy, not in the mark. Do not put a centered hub circle in a ring: that is the Spooler tab glyph.
- Construction: tag `M2.75 12L8 6.25H21.25V17.75H8Z`; hole `circle (7.75,12) r1.25` solid; bars `M12 9.6H18M12 14.4H18` (y snapped to the 1.2 grid so edges land on whole pixels at 20px).
- Files: `brand/logo.svg` (deep green `#446600`, for light), `brand/logo-dark.svg` (lime `#B9DC6C`, for graphite), `ui/src/icon.svg` (`currentColor`, 20px tab glyph, same geometry and 1.5 stroke as the Spooler and Orca tab icons).
- Clear space: 1/4 of mark width on all sides. Minimum size: 16px. Wordmark lockup minimum 120px wide.
- Lockup: mark left, wordmark right, gap = 1/3 mark width, vertically centered.
- Tile (`icon-512.png`): graphite rounded square, mark in lime at 60% width, 1px inner border.
- Checked at 16px and 20px on `#2B2B2B` and `#FFFFFF`, beside the Spooler glyph (nearest-neighbour zoom): tag outline, hole and both bars stay separate at 20px; at 16px the bars are slightly soft but distinct.

## Do
- Use graphite surfaces for marketing images; lime as a thin rule, bars and the mark.
- Show the price in the accent (lime on dark, the deep green band in the UI) on exactly one number per screen: the suggested price, or the selected channel's price.
- Keep strokes 1.5-2px, corners 2px (6px for cards), generous negative space.
- Show real-looking data: plates, grams, spool names, currency symbols.

## Don't
- No gradients, glows, glossy 3D, mascots or orcas, sparkles, robots, coins or dollar-sign clipart.
- No `#B9DC6C` on light; no `#446600` on dark; no amber except for a warning.
- Do not recolor, outline, rotate, stretch or add effects to the mark; do not place it on busy imagery.
- Do not fill the ring or merge the dot into the bars.
- No emoji in UI or marketing copy.

## Asset index
`brand/logo.svg`, `logo-dark.svg`, `logo-512.png`, `logo-1024.png` (transparent), `icon-512.png`, `icon-256.png`, `hero.png`, `social.png`, `listing-1..4.png` + `-pt`, `ui/src/icon.svg`, `ui/src/assets/calculator-quote.webp` (the empty-state illustration, from the foundation's illustration set). SVG sources and the regeneration script live in `brand/src/` (`npm i --no-save sharp && node brand/src/build.mjs`).
