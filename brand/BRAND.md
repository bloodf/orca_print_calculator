# Orca Print Calculator — brand

## Name and tagline
- Name: **Orca Print Calculator** (never "OrcaCalc", never "Orca Calculator"). Always written in full; "Orca" alone refers to OrcaSlicer.
- Tagline en: **Price every plate.**
- Tagline pt-BR: **Precifique cada placa.**
- Descriptor en: Calculator for OrcaSlicer. pt-BR: Calculadora para OrcaSlicer.

## Voice
Workshop-precise, plain, numerate. Says what the number is and where it came from. Short sentences, active verbs, units always shown. pt-BR uses the imperative ("Precifique", "Envie"), not the formal "o usuário". No hype ("revolutionary", "powerful"), no exclamation marks, no AI talk, no emoji. Money and grams are the heroes; the copy stays out of their way.

## Palette
| Token | Hex | Use |
|---|---|---|
| Orca teal | `#009688` | Mark and non-text accents on light |
| Deep teal | `#00675B` | Text, links and focus on light surfaces; fill under white text |
| Teal light | `#2EBBAA` | Mark, text, links on graphite (dark-theme counterpart of teal) |
| Graphite | `#2B2B2B` | Dark surface; text on light |
| Off-white | `#FAFAFA` | Light surface; text on dark |
| Amber | `#F5A524` | **Only the price.** Dark surfaces only |
| Amber, light theme | `#8A5800` | The price on light surfaces (6.04 on `#FFFFFF`, 5.79 on `#FAFAFA`) |
| Muted (dark) | `#A8A8A8` | Secondary text on graphite |
| Muted (light) | `#5C6664` | Secondary text on off-white |

Brand values above are for assets and docs. The plugin UI follows the host `--orca-*` tokens, with the rules below. `#2EBBAA`, `#A8A8A8`, `#5C6664` extend the plan palette to keep AA on both themes.

### Contrast (WCAG 2.x, computed)
| Pair | Ratio | Verdict |
|---|---|---|
| `#2B2B2B` on `#FAFAFA` (and reverse) | 13.57 | AAA text |
| `#00675B` on `#FAFAFA` | 6.51 | AA text |
| `#00675B` on `#FFFFFF` | 6.79 | AA text |
| `#2EBBAA` on `#2B2B2B` | 5.94 | AA text |
| `#A8A8A8` on `#2B2B2B` | 5.95 | AA text |
| `#5C6664` on `#FAFAFA` | 5.68 | AA text |
| `#F5A524` on `#2B2B2B` | 6.94 | AA text |
| `#8A5800` on `#FFFFFF` | 6.04 | AA text |
| `#8A5800` on `#FAFAFA` | 5.79 | AA text |
| `#FFFFFF` on `#00675B` | 6.79 | AA text |
| `#009688` on `#FFFFFF` | 3.67 | Graphics and large text only (3:1) |
| `#009688` on `#FAFAFA` | 3.52 | Graphics and large text only |
| `#009688` on `#2B2B2B` | 3.86 | Graphics and large text only |
| `#FFFFFF` on `#009688` | 3.67 | Large text and icons only |
| `#00675B` on `#2B2B2B` | 2.08 | **Fail** — never use on dark |
| `#F5A524` on `#FFFFFF` | 2.04 | **Fail** — never use amber on light |

### UI rules (plugin CSS)
- `--orca-accent` (`#009688` light, `#00675B` dark) is for fills under `--orca-accent-fg` and for borders only. Never use it as text, link or focus colour on dark (2.08:1).
- Accent text, links and focus rings on dark use `--opc-accent-text: #2EBBAA`:
```css
:root { --opc-accent-text: #00675B; --opc-price: #8A5800; }
[data-orca-theme="dark"] { --opc-accent-text: #2EBBAA; --opc-price: #F5A524; }
```
- Price figure: `--opc-price`, one per screen. Muted text: `--orca-muted`; check it reaches 4.5:1 on `--orca-bg` in both themes.

Rule of thumb: on light, teal text is `#00675B`; on dark, teal text is `#2EBBAA`. Plain `#009688` is for the mark and non-text graphics.

## Typography
- Assets (build on macOS: text uses the system Avenir Next, other OSes fall back to different metrics): geometric sans, bold (700) for wordmark and headlines, semibold (600) for labels. Rendered assets use Avenir Next with Helvetica Neue fallback (system fonts, no licensing).
- Plugin UI: inherit `--orca-font`; do not ship a webfont. Tabular numerals for money and weights.
- Scale (assets): wordmark 34-56, headline 52, label 12-18. Letter-spacing -0.01em on display sizes only.

## Logo
The mark: a price tag pointing left (the "price"), a punched hole at its point, two layer-line bars on the face (the "print"). 24x24 grid, 1.5 stroke, round caps and joins, single color. Spool meaning lives in the empty states and copy, not in the mark. Do not put a centered hub circle in a ring: that is the Spooler tab glyph.
- Construction: tag `M2.75 12L8 6.25H21.25V17.75H8Z`; hole `circle (7.75,12) r1.25` solid; bars `M12 9.6H18M12 14.4H18` (y snapped to the 1.2 grid so edges land on whole pixels at 20px).
- Files: `brand/logo.svg` (teal `#009688`, for light), `brand/logo-dark.svg` (`#2EBBAA`, for graphite), `ui/src/icon.svg` (`currentColor`, 20px tab glyph, same geometry and 1.5 stroke as the Spooler and Orca tab icons).
- Clear space: 1/4 of mark width on all sides. Minimum size: 16px. Wordmark lockup minimum 120px wide.
- Lockup: mark left, wordmark right, gap = 1/3 mark width, vertically centered.
- Tile (`icon-512.png`): graphite rounded square, mark in teal light at 60% width, 1px inner border.
- Checked at 16px and 20px on `#2B2B2B` and `#FFFFFF`, beside the Spooler glyph (nearest-neighbour zoom): tag outline, hole and both bars stay separate at 20px; at 16px the bars are slightly soft but distinct.

## Do
- Use graphite surfaces for marketing images; teal as a thin rule or the mark only.
- Show the price colour (amber on dark, `#8A5800` on light) on exactly one number per screen: the suggested price, or the selected channel's price.
- Keep strokes 1.5-2px, corners 2px (6px for cards), generous negative space.
- Show real-looking data: plates, grams, spool names, currency symbols.

## Don't
- No gradients, glows, glossy 3D, mascots or orcas, sparkles, robots, coins or dollar-sign clipart.
- No `#F5A524` on light; no `#00675B` on dark; no teal body text on `#009688`.
- Do not recolor, outline, rotate, stretch or add effects to the mark; do not place it on busy imagery.
- Do not fill the ring or merge the dot into the bars.
- No emoji in UI or marketing copy.

## Asset index
`brand/logo.svg`, `logo-dark.svg`, `logo-512.png`, `logo-1024.png` (transparent), `icon-512.png`, `icon-256.png`, `hero.png`, `social.png`, `listing-1..4.png` + `-pt`, `ui/src/icon.svg`, `ui/src/assets/empty-{plate,spool,quote}.svg`. SVG sources and the regeneration script live in `brand/src/` (`npm i --no-save sharp && node brand/src/build.mjs`).
