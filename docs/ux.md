# Orca Print Calculator — UX spec (T4.1)

UI specification. Brand rules: `brand/BRAND.md`.

Engine API consumed (read the files, not restated): `ui/src/engine/quote.ts` (`computeQuote`, `QuoteInput`,
`QuoteOk`, `PlateRow`, `QuoteLine`, `BatchRow`, `ProblemCode`), `quotePricing.ts` (`ChannelOk`, `ChannelQuote`,
`ChannelProblem`, `PrettyMode`, `DiscountTier`, `prettyUp`), `channels.ts` (`ChannelDef`, `TierDef`,
`validateChannelDef`, `validateChannelList`, `toChannelInput`, `newCustomChannel`, `MAX_TIERS`; presets not used), `match.ts`
(`matchSlot`, `pricePerKg`, `MatchSource`, `SlotOverride`), `money.ts` (`currencyDigits`, `parseMoney`,
`parseScaled`, `formatMoney`, `kwhE4`, `separators`), `printerMatch.ts` (`resolveWatts`, `matchPrinter`),
`costs.ts` (`feeFor`, `deadZones`, `LineId`).

**Do not import `ui/src/engine/cost.ts`.** It is the vendored float/BRL legacy file kept only for the vendored
printers test; its labels are Portuguese literals.

---

## 0. Surface classification (visant-frontend step 0)

| Route / region | Class | Business variable | Persuasion present |
|---|---|---|---|
| Calculator: plates + sections (left) | B Work | time-to-trustworthy-price; decision quality (no underpricing) | none; every pixel is data |
| Calculator: price panel (right) | B Work | decision quality: price, margin, break-even read in one glance | none; one amber number is the decision |
| Quotes list | B Work | throughput: reopen or resend a quote in ≤ 2 clicks | none |
| Settings | C Trust | correctness of defaults (every future price inherits them); reversibility | none; auto-save with undo |
| Quote sheet (printed / PDF) | A Acquisition | customer acceptance of the quote | light: clean total, shop name, validity date; no internal numbers |

---

## 1. Product principles and primary job

**Primary job.** User slices in OrcaSlicer, opens the tab, and reads a price they trust in under 5 seconds with
zero typing once defaults are set. Every layout decision below is judged against that sentence.

1. **The price is the only loud thing.** One amber number per screen (`--opc-price`): the suggested price of
   the selected channel. Every other figure is `--opc-fg` or `--opc-muted`. → Decision: channel comparison
   prices, plate costs, quote totals in lists and tile values are never amber.
2. **Never a silent zero.** A missing input (no filament price, energy price not set, Spoolman offline) is
   counted as 0 *and named* next to the price. → Decision: the price panel has a "not counted" flag list; the
   hero label changes to "Suggested price (incomplete)"; customer export is replaced by a reason text.
3. **Defaults carry the work; overrides are visible.** Everything except plates, quantity and per-quote extras
   comes from Settings. A value changed in the calculator is a per-quote override, marked with a dot and a reset
   button. → Decision: sections start collapsed and show their cost in the header, so nothing needs opening to
   trust the price.
4. **Say where each number came from.** Filament chips carry the match source ("Spooler", "#12", "Preset
   price"); the printer chip says "estimated" until the user calibrates watts. → Decision: source badges are
   always rendered for filament; never hidden behind hover.
5. **Native beside Spooler.** Host font, host colours, 13px base, 4px control radius, segmented top tabs like
   Spooler's. No webfont, no UI kit, no decoration. → Decision: tokens map to `--orca-*`; derived surfaces use
   the same 5% / 8% fg-over-bg mix Spooler uses.

---

## 2. Information architecture

### 2.1 Views and navigation

Three views, switched by a segmented tab control in the header (same pattern as Spooler's `.tabs`). No router;
`state.view: "calc" | "quotes" | "settings"`. The view is kept in memory only (tab reload returns to Calculator).

| View | Purpose | Entry points |
|---|---|---|
| Calculator (default) | Price the open project; save, print, CSV | header tab; "Open" on a quote; after first run |
| Quotes | Saved quotes: search, reopen, duplicate, print, CSV, delete | header tab; toast "View quotes" after save |
| Settings | Tabbed: Spoolman, Costs, Pricing, Sales channels, Printers, Quote sheet, Language and currency, About (the extras catalog lives in the "Extras and stock" view) | header tab; links "Edit in settings" from sections and chips (scrolls to the anchor `#settings-<section>`) |

The quote sheet preview is a sub-state of Calculator (`state.preview = true`), not a fourth tab: it replaces the
calculator body with the sheet and a toolbar (Back, Itemized/Summary, Print or save PDF, Save HTML).

### 2.2 What persists where

| Data | Store | Written by | When |
|---|---|---|---|
| Settings (defaults, channels, printers, overrides, catalog, sheet, language, currency, Spoolman URL, UI open sections, onboarded) | `settings.json` via `save_settings` | store action `patchSettings` | debounced 600 ms after the last valid change |
| Saved quotes (frozen `QuoteInput` + display metadata) | `quotes.json` via `save_quotes` | store actions `saveQuote`, `deleteQuote`, `duplicateQuote` | immediately on the action |
| Working quote (draft) | memory only | calculator controls | lost on tab reload; reset on `ProjectOpened` / `NewProject` (ponytail: add persistence if users report lost drafts) |
| Plates | host memory, pushed with `plates` event | host | each slice / invalidation |
| Spoolman data (filaments, spools, currency) | memory | `spoolman_fetch` | on load, on URL change, on Refresh, on Retry |

**Scope of each input** (the full field table is in §7.6):

- **Global default** (Settings): energy price, failure rate and mode, depreciation on/off, maintenance per hour,
  fixed cost per print hour, labor rate, labor minutes per run, setup minutes, target margin, pretty rounding,
  minimum order, default channel, compared channels, default discount tiers, default shipping, quote validity.
- **Per printer model** (`settings.printers[printer_model]`): average watts, printer price, lifetime hours. Edited
  from the printer chip and the Machine section; always saved to the profile (never a per-quote override),
  because the printer is the same printer on every quote.
- **Per filament preset** (`settings.slotOverrides[preset]`, `settings.manualPrices[preset]`): manual spool pick
  or typed price per kg. Saved globally because a preset is the same material on every quote.
- **Per quote only**: plate include and copies, pieces per set, quantity, selected channel, extras rows, discount
  tiers (seeded from defaults), shipping amount and mode (seeded from defaults), title, customer, note, and any
  override of a global default.

### 2.3 Progressive disclosure (decided)

Visible by default on Calculator:

- Plate list with filament chips, cost per plate, include toggle, copies stepper.
- Price panel: channel, quantity, target margin, hero price, profit and margin tiles, flags, actions.
- Breakdown bars (open), Batch pricing (collapsed unless quantity > 1 or tiers exist), Channel comparison
  (only with 2+ channels; collapsed by default).

Behind collapsed sections in the left column, each header showing its per-piece cost so the user never has to
open one to audit the price:

| Section | Header summary (collapsed) | Auto-expands when |
|---|---|---|
| Machine and energy | `Energy {e} · Machine {d+m}` per piece | a field in it is invalid; energy price not set **and** first run was skipped |
| Labor | `{minutes} min · {labor}` | invalid field |
| Extras and accessories | `{n} items · {total}` or `None` | invalid field. When empty the body is only the `+ Extra` button (optional field rule) |
| Shipping | `Customer pays {x}` / `Included in price {x}` / `Not included` | invalid field |
| Sales fee | `Fee {pct} + {fixed} · tax {tax}` or `No fees` | first run (starts open); invalid field; selected channel invalid |

Rationale: every section has working defaults after setup, so expanding is an audit act, not a fill-in act. Open
state per section is remembered in `settings.ui.open[sectionId]`.

### 2.4 First-run flow

Trigger: `settings.onboarded !== true` (no `settings.json`, or new install).

1. Calculator opens normally (never a modal, never a wizard screen). Above the plate list a **Setup checklist**
   (`FirstRunChecklist`) renders as one bordered surface with three rows:
   1. **Filament prices** — if `spooler.url` is present: text "Spooler uses Spoolman at {url}." + button
      "Use this Spoolman". Else: URL field + "Connect" button. Secondary text button "Skip, use preset prices".
   2. **Energy price** — one MoneyField "Price per kWh" with helper "From your electricity bill." Saves to
      defaults on valid input.
   3. **Your time** — MoneyField "Labor rate per hour" and PercentField "Target margin" (prefilled 30%).
   Each row shows a check icon and collapses to one line ("Energy price · R$ 0,95/kWh · Edit") when done.
   Under the rows, one sm muted line: `setup.permission` (why the plugin reads Orca's temp slicing folder; the
   grant was shown once in OrcaSlicer's enable prompt). It is shown only in the checklist and in Settings › About.
   Footer: "Done" primary button (always enabled; incomplete rows stay listed in the price panel as "not
   counted"). Done sets `onboarded = true`.
2. Currency before Spoolman connects: `settings.currency ?? (navigator.language starts with "pt" ? "BRL" : "USD")`.
   The header currency chip shows it with source "Set in settings"; once Spoolman responds, Spoolman's currency
   wins and the chip source reads "From Spoolman".
3. Language: `auto` → `pt-BR` if `navigator.language` starts with `pt`, else `en`.
4. Sales: settings hold one channel, "Direct", with zero fees. The **Sales fee** section starts open on first run
   (Fee %, Fixed fee per sale, Tax %) so the user sets what their platform or payment provider keeps. No channel
   select, no comparison until they add a second channel in Settings.
5. No printer profile yet: watts come from `resolveWatts` (estimated badge). Printer price and lifetime are
   empty → depreciation not counted → listed under "not counted: printer wear" until set or depreciation is
   switched off in Settings.

---

## 3. Layout grid

### 3.1 Breakpoints (webview width = tab width; media queries on viewport, no container queries)

| Name | Width | Grid | Gap | Body padding |
|---|---|---|---|---|
| N narrow | < 900 | one column | 12 | 12 |
| M compact | 900–1099 | `minmax(0,1fr) 340px` | 12 | 12 |
| W wide | 1100–1439 | `minmax(0,1fr) 384px` | 16 | 16 |
| X extra | ≥ 1440 | `minmax(0,1fr) 440px`, content `max-width: 1680px; margin: 0 auto` | 24 | 16 |

Plate list inside the left column: `grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 8px`.
Results: 1 column at M and W, 2 at 1440, 3 at 1920. Sections stay full width; their bodies use
`.form-grid { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px }`.

### 3.2 Shell and scrolling

- Header: 44px high, `position: sticky; top: 0`, background `--opc-bg`, bottom border 1px `--opc-border`.
- M, W, X with viewport height ≥ 720: `html, body` do not scroll. Main area is `height: calc(100vh - 44px)`;
  left column and right column are separate scroll containers (`overflow-y: auto`). Right column is a flex
  column: **PriceSummary** (`flex: none`, never scrolls) and **PriceDetails** (`flex: 1 1 auto; overflow-y:
  auto`) holding breakdown, comparison, batch.
- Viewport height < 720 (any width ≥ 900): the right column scrolls as a whole; PriceSummary is not pinned.
- N: the page scrolls as one column. Order: header → checklist (first run) → plate list → **price panel in
  flow** (`id="price"`) → sections → details. A **PriceBar** (56px, `position: fixed; bottom: 0`, full width,
  background `--opc-raised`, top border) shows the price, margin and a "Details" button that scrolls to
  `#price`. PriceBar is hidden (`hidden` attribute) while `#price` intersects the viewport (IntersectionObserver),
  so at most one amber number is visible. Main gets `padding-bottom: 68px` while the bar shows.
- Use `100vh`, not `dvh` (Safari 15.4+). Header sticky, not fixed, at N.

### 3.3 Spacing, radii, density

- Spacing scale (px): 4, 8, 12, 16, 24, 32 as `--opc-s1`…`--opc-s6`. Inside a zone 4–8; between zones 12–16;
  between page regions 24. No other values.
- Radii: `--opc-r-control: 4px` (inputs, buttons, selects, steppers, tabs), `--opc-r-surface: 6px` (plate
  cards, sections, price column, tiles container, toasts), `--opc-r-pill: 999px` (chips, badges, status dots).
- Control height 28px (inputs, buttons, selects); primary button 32px; table row 32px; section header 40px;
  plate card min-height 88px. Minimum hit target 24×24 (icon buttons are 24×24 with a 16px glyph).
- Borders 1px `--opc-border`. No shadows except popovers and toasts (`--opc-shadow`).
- **No card in card.** Material rows inside a plate card are separated by a hairline, not boxed. Tiles inside
  the price column are grid cells separated by a 1px divider, not bordered boxes. Details blocks in the price
  column use the `flush` Section variant (top hairline, no border box).

### 3.4 Type scale (host base 13px)

| Token | px | Ratio to 13 | Weight | Line height | Use |
|---|---|---|---|---|---|
| `--opc-fs-xs` | 11 | 0.85 | 500 | 1.3 | badges, match source, table micro labels |
| `--opc-fs-sm` | 12 | 0.92 | 400 | 1.35 | meta, helper text, table headers, tile labels |
| `--opc-fs-md` | 13 | 1 | 400 | 1.4 | body, inputs, buttons (500), table cells |
| `--opc-fs-lg` | 15 | 1.15 | 500 | 1.25 | plate name, section title, settings group title |
| `--opc-fs-xl` | 20 | 1.54 | 600 | 1.2 | view title, tile values |
| `--opc-fs-price` | 40 (34 at M, 22 in PriceBar) | 3.08 | 600 | 1.05 | hero price only; `letter-spacing: -0.02em` |

Weight 600 only for: view title, hero price, tile values. Everything else ≤ 500. Font: `var(--orca-font,
-apple-system, "Segoe UI", system-ui, sans-serif)` on `html`; never set a family elsewhere.

**Numerics.** Every money, gram, time, percent and count gets `.num` (`font-variant-numeric: tabular-nums;
white-space: nowrap`). Numbers in tables are right-aligned; their headers too. Units are part of the string
("41 g", "120 W", "2h 14m"), never a separate column.

---

## 4. Design tokens (`ui/src/theme.css`)

### 4.1 Strategy and `color-mix` fallback

Build target is Safari 14. `color-mix()` needs Safari 16.2, so derived colours are defined twice:

1. Explicit hex values per theme (below) — always correct on our fallback palette, approximately correct on
   the real host.
2. An `@supports (color: color-mix(in srgb, red 50%, blue))` block that redefines only the derived tokens from
   the host `--orca-*` values, so they track the real host theme exactly.

Do not write `--x: color-mix(...)` outside the `@supports` block: an unsupported value inside a custom property
is invalid at computed time and drops to `unset`, not to the fallback.

Theme switching: `:root` holds light values; `html[data-orca-theme="dark"]` overrides. Never use
`prefers-color-scheme`. Host values win through `var(--orca-x, fallback)`; fallbacks are for the dev harness.

### 4.2 Token list

```css
:root {
  /* host-mapped */
  --opc-bg: var(--orca-bg, #FFFFFF);
  --opc-fg: var(--orca-fg, #2B2B2B);
  --opc-muted: var(--orca-muted, #5C6664);
  --opc-border: var(--orca-border, #D9D9D9);
  --opc-accent: var(--orca-accent, #009688);          /* fills + borders only, never text on dark */
  --opc-accent-fg: var(--orca-accent-fg, #FFFFFF);
  --opc-primary-bg: #00675B;                           /* light: deep teal so white label is 6.79:1 */
  --opc-font: var(--orca-font, -apple-system, "Segoe UI", system-ui, sans-serif);
  /* brand rules */
  --opc-accent-text: #00675B;                          /* links, accent text, focus, ok status */
  --opc-price: #8A5800;                                /* the one amber number */
  /* derived surfaces (fallback hex) */
  --opc-raised: #F4F4F4;                               /* fg 5% over bg */
  --opc-hover: #EBEBEB;                                /* fg 8% over bg */
  --opc-selected: #E6F5F3;                             /* accent 10% over bg */
  --opc-selected-border: #66C0B8;                      /* accent 60% over bg */
  --opc-track: #E3E3E3;                                /* bar track: fg 10% over bg */
  --opc-bar: #8A9290;                                  /* breakdown bars: muted */
  --opc-bar-profit: #009688;                           /* profit bar: accent */
  /* status (text-safe on bg and raised) */
  --opc-ok: var(--opc-accent-text);
  --opc-warn: #A63D0F;
  --opc-bad: #B42318;
  --opc-warn-bg: #FBEDE6;                              /* warn 10% over bg */
  --opc-bad-bg: #F8E9E8;                               /* bad 10% over bg */
  /* focus, shadow */
  --opc-focus: 0 0 0 2px var(--opc-bg), 0 0 0 4px var(--opc-accent-text);
  --opc-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  /* scale */
  --opc-s1: 4px; --opc-s2: 8px; --opc-s3: 12px; --opc-s4: 16px; --opc-s5: 24px; --opc-s6: 32px;
  --opc-r-control: 4px; --opc-r-surface: 6px; --opc-r-pill: 999px;
  --opc-fs-xs: 11px; --opc-fs-sm: 12px; --opc-fs-md: 13px; --opc-fs-lg: 15px; --opc-fs-xl: 20px; --opc-fs-price: 40px;
  --opc-dur-fast: 120ms; --opc-dur: 180ms; --opc-ease: cubic-bezier(0.2, 0, 0, 1);
}
html[data-orca-theme="dark"] {
  --opc-bg: var(--orca-bg, #2B2B2B);
  --opc-fg: var(--orca-fg, #FAFAFA);
  --opc-muted: var(--orca-muted, #A8A8A8);
  --opc-border: var(--orca-border, #4A4A4A);
  --opc-accent: var(--orca-accent, #00675B);
  --opc-accent-fg: var(--orca-accent-fg, #FFFFFF);
  --opc-primary-bg: var(--opc-accent);                 /* dark: #00675B under white, 6.79:1 */
  --opc-accent-text: #2EBBAA;
  --opc-price: #F5A524;
  --opc-raised: #353535;
  --opc-hover: #3B3B3B;
  --opc-selected: #2B403E;
  --opc-selected-border: #2EBBAA;
  --opc-track: #404040;
  --opc-bar: #8C8C8C;
  --opc-bar-profit: #2EBBAA;
  --opc-warn: #F0875F;
  --opc-bad: #FF8B85;
  --opc-warn-bg: #44342D;
  --opc-bad-bg: #463333;
  --opc-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
@supports (color: color-mix(in srgb, red 50%, blue)) {
  :root, html[data-orca-theme="dark"] {
    --opc-raised: color-mix(in srgb, var(--opc-fg) 5%, var(--opc-bg));
    --opc-hover: color-mix(in srgb, var(--opc-fg) 8%, var(--opc-bg));
    --opc-track: color-mix(in srgb, var(--opc-fg) 10%, var(--opc-bg));
    --opc-selected: color-mix(in srgb, var(--opc-accent-text) 12%, var(--opc-bg));
    --opc-warn-bg: color-mix(in srgb, var(--opc-warn) 12%, var(--opc-bg));
    --opc-bad-bg: color-mix(in srgb, var(--opc-bad) 12%, var(--opc-bg));
  }
}
html { font-family: var(--opc-font); font-size: 13px; line-height: 1.4; color: var(--opc-fg); background: var(--opc-bg); }
body { margin: 0; background: var(--opc-bg); color: var(--opc-fg); }
```

`--opc-selected-border` stays explicit in both themes (no mix needed).

### 4.3 Contrast (WCAG 2.x, computed on the fallback palette)

| Pair | Dark (on bg / raised) | Light (on bg / raised) | Use |
|---|---|---|---|
| `--opc-fg` | 13.57 / 11.75 | 14.16 / 12.87 | body |
| `--opc-muted` | 5.95 / 5.16 | 5.93 / 5.39 | secondary text |
| `--opc-accent-text` (= ok) | 5.94 / 5.14 | 6.79 / 6.18 | links, focus, ok |
| `--opc-price` | 6.94 / 6.01 | 6.04 / 5.49 | hero price |
| `--opc-warn` | 5.62 / 4.87 | 6.37 / 5.79 | warn text and icons |
| `--opc-bad` | 6.26 / 5.42 | 6.57 / 5.98 | error text and icons |
| `--opc-accent-fg` on `--opc-accent` | 6.79 (on `#00675B`) | 3.67 (on `#009688`) | primary button label |

Light primary button: white on `#009688` is 3.67, below AA for 13px text. **Decision:** the primary button uses
`--opc-primary-bg`: `#00675B` in light (6.79), `var(--opc-accent)` in dark (host `#00675B`, 6.79).
Host `--orca-muted` and `--orca-border` are unknown until T5.1 runs in Orca; T4.9 must measure muted ≥ 4.5:1 on
`--opc-bg` and `--opc-raised` in both themes and, if it fails, pin `--opc-muted` to the brand value.

Warn (hue 17°) and the price amber (hue 37°) are kept apart: warn never appears inside PriceSummary. Flags under
the price use `--opc-bad` (money loss) or `--opc-muted` with an info icon (neutral facts).

### 4.4 Focus

`:focus { outline: none; box-shadow: var(--opc-focus); }` and `:focus:not(:focus-visible) { box-shadow: none; }`
(Safari 14 ignores the second rule, so mouse focus also shows the ring there; acceptable). Inputs keep their
border and add the ring. Never remove focus without replacement.

### 4.5 Base component classes (in `theme.css`, used instead of wrapper components)

- `.btn` 28px, padding 0 10px, radius control, 1px border `--opc-border`, transparent bg, fg text, weight 500;
  hover `border-color: var(--opc-accent-text)`; active `background: var(--opc-hover)`.
- `.btn.primary` 32px, padding 0 16px, bg `--opc-primary-bg`, text `--opc-accent-fg`, border same as bg.
- `.btn.ghost` no border, `--opc-accent-text` text; hover `background: var(--opc-hover)`.
- `.btn.icon` 24×24, no border, glyph 16px, `--opc-muted`; hover fg + `--opc-hover` bg.
- `.btn.danger` text `--opc-bad`.
- `input, select, textarea` 28px (textarea auto), padding 0 8px, radius control, bg `--opc-bg`, border
  `--opc-border`, fg. `[aria-invalid="true"]` border `--opc-bad`. `option` bg `--opc-bg` fg `--opc-fg` (Spooler fix).
- `.num`, `.muted` (`color: var(--opc-muted)`), `.sr-only`, `.hairline` (`border-top: 1px solid var(--opc-border)`).
- `.skeleton` block with `background: var(--opc-track)`, radius control; no shimmer animation.
- Native checkbox and radio are kept native (Safari 14 has no `accent-color`); size 14px.

### 4.6 Icons (inline SVG, `components/base/icons.ts` → `Icon.vue`)

All: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
stroke-linejoin="round"`, rendered at 16px (20px in header tabs), `aria-hidden="true"` unless standalone (then
the button carries the label). "dot(x,y)" = `<circle cx cy r="1" fill="currentColor" stroke="none"/>`.

| Name | Paths |
|---|---|
| `mark` | the app glyph: copy `ui/src/icon.svg` geometry |
| `chevron-down` | `M6 9l6 6 6-6` |
| `chevron-right` | `M9 6l6 6-6 6` |
| `arrow-left` | `M19 12H5M11 6l-6 6 6 6` |
| `plus` | `M12 5v14M5 12h14` |
| `minus` | `M5 12h14` |
| `x` | `M6 6l12 12M18 6L6 18` |
| `check` | `M5 12.5l4.5 4.5L19 7` |
| `refresh` | `M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9M19.5 4.5V9H15` |
| `reset` | `M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9` |
| `sliders` (Settings tab) | `M4 7h9M17 7h3M4 17h3M11 17h9` + `circle(15,7,2)` + `circle(9,17,2)` |
| `list` (Quotes tab) | `M9 7h11M9 12h11M9 17h11` + dot(5,7) dot(5,12) dot(5,17) |
| `calc` (Calculator tab) | `rect x4.75 y3.75 w14.5 h16.5 rx2` + `M8 7.75h8` + dot(8.5,12) dot(12,12) dot(15.5,12) dot(8.5,16) dot(12,16) dot(15.5,16) |
| `alert-triangle` (warn) | `M12 3.75L21.25 19.75H2.75Z M12 9.75v4.5` + dot(12,17) |
| `alert-circle` (bad) | `circle(12,12,8.25)` + `M12 7.75v5` + dot(12,16) |
| `info` | `circle(12,12,8.25)` + `M12 11v5` + dot(12,8) |
| `printer-3d` (printer chip) | `M4.75 20.25V3.75h14.5v16.5M4.75 8h14.5M10 8v3.5l2 2 2-2V8M8 20.25h8` |
| `print` (paper) | `M7 9V3.75h10V9M7 17H4.75V9h14.5v8H17M7 14h10v6.25H7Z` |
| `download` (CSV / Save HTML) | `M12 4v11M7 10l5 5 5-5M5 20h14` |
| `upload` (import file) | `M12 15V4M7 9l5-5 5 5M5 20h14` |
| `copy` | `rect x8 y8 w12 h12 rx2` + `M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8` |
| `trash` | `M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5` |
| `pencil` | `M4.5 19.5l1-4L16 5a2.1 2.1 0 0 1 3 3L8.5 18.5Z` |
| `link` (spool linked) | `M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1` |
| `link-off` (no price) | `link` paths + `M4 4l16 16` |
| `clock` | `circle(12,12,8.25)` + `M12 7.5V12l3 2` |
| `more` | dot(6,12) dot(12,12) dot(18,12) with r 1.25 |
| `search` | `circle(11,11,6.25)` + `M20 20l-4.5-4.5` |
| `bolt` (energy, Machine header) | `M13 3.75L5.75 13.5H12l-1 6.75 7.25-9.75H12Z` |

No other icons. The spool glyph is deliberately absent (Spooler's tab mark); Spoolman status is a dot + text.

---

## 5. Data shapes and component inventory

### 5.1 Shared state (`ui/src/state/types.ts`, owned by T4.2)

Bridge payloads the UI assumes (T3.4 / T5.1 must deliver these; see §12 for flagged assumptions):

```ts
type HostInfo = { projectName: string | null; printerModel: string | null; printerVendor: string | null; pluginVersion: string };
type HostSlot = { n: number; preset: string; grams: number | null; color: string | null; costPerKg: number | null; notes: string; material: string | null };
type HostPlate = {
  index: number; name: string | null; seconds: number | null; stale: boolean; thumb: string | null /* data: URI */;
  slicedAt: string | null /* ISO time the host captured it */; source: "slice" | "file"; fileName: string | null; slots: HostSlot[];
};
```

**Unknown is not zero.** Any host field may be `null` when the G-code lacks it (Bambu-vendor G-code has no total
cost, layer count or `; total filament used [g]` line; with `gcode_skip_config_block` there is no config block).
The UI renders an unknown value as "—" with sr text `a11y.unknown`, never as `0`. In `derive.ts` an unknown
`seconds` or `grams` enters the engine as 0 **and** adds a not-counted item (`notCounted.time` for the plate,
`notCounted.grams` for the slot), so the price panel names it (§6.12). The UI never reads or shows G-code total
cost or layer count; costs come only from the engine.

```ts
type SpoolerInfo = { url: string | null; presetToFilament: Record<string, number> } | null;
type HostState = { host: HostInfo; plates: HostPlate[]; settings: Settings | null; quotes: SavedQuote[] | null; spooler: SpoolerInfo };
```

Settings and quotes (opaque JSON to Python; the schema lives here once):

```ts
type Lang = "auto" | "en" | "pt-BR";
type ShippingMode = "none" | "customer" | "absorbed";      // "none" maps to engine {mode:"customer", minor:0}
type PrinterProfile = { watts: number | null; acquisitionMinor: number | null; lifetimeHours: number | null };
type CatalogExtra = { key: string; label: string; unitMinor: number; qtyE3: number; per: "piece" | "plate" | "order" };
type Defaults = {
  energyPerKwh: string | null;      // canonical "0.95" (dot decimal, major units); null = not set
  failureBp: number; failureMode: "markup" | "expected_waste"; failureIncludesMachine: boolean;
  depreciationEnabled: boolean; maintenancePerHourMinor: number; fixedPerPrintHourMinor: number;
  laborPerHourMinor: number | null; laborMinutes: number; setupMinutes: number;
  targetMarginBp: number; pretty: PrettyMode; minOrderMinor: number;
  shipping: { mode: ShippingMode; minor: number }; discountTiers: DiscountTier[];
};
type Settings = {
  version: 1; onboarded: boolean; language: Lang; currency: string | null; defaultsCurrency: string | null;
  spoolman: { url: string }; defaults: Defaults;
  channels: ChannelDef[]; comparedChannelIds: string[]; defaultChannelId: string;
  printers: Record<string, PrinterProfile>;                 // key = printer_model
  slotOverrides: Record<string, SlotOverride>;              // key = filament preset name
  manualPrices: Record<string, number>;                     // key = preset; minor units per kg
  extrasCatalog: CatalogExtra[];
  sheet: { shopName: string; footer: string; validityDays: number; nextNo: number };
  ui: { open: Record<string, boolean>; sheetMode: "itemized" | "summary" };
};
type PlateSnapshot = { index: number; name: string | null; seconds: number; slots: (QuoteSlot & { color: string | null; source: MatchSource | "manual" })[] };
type SavedQuote = {
  id: string; no: number; createdAt: string; updatedAt: string;
  title: string; customer: string; note: string;
  currency: string; channelId: string; plates: PlateSnapshot[];
  input: QuoteInput;                                         // frozen; reopening recomputes from this exactly
  summary: { channelName: string; price: number; grandTotal: number; marginBp: number; quantity: number };
};
type Draft = {
  quoteId: string | null; title: string; customer: string; note: string;
  channelId: string; quantity: number; unitsPerSet: number;
  plates: Record<number, { include: boolean; copies: number }>;
  overrides: Partial<Record<OverridableKey, unknown>>;       // keys of Defaults the user changed for this quote
  extras: QuoteExtra[]; discountTiers: DiscountTier[];
  frozenPlates: PlateSnapshot[] | null;                      // set when a saved quote is open
};
```

Initial `Defaults` (built-in, used until the user edits): `energyPerKwh null, failureBp 500, failureMode
"expected_waste", failureIncludesMachine false, depreciationEnabled true, maintenancePerHourMinor 0,
fixedPerPrintHourMinor 0, laborPerHourMinor null, laborMinutes 10, setupMinutes 0, targetMarginBp 3000, pretty
(engine default, §12.13), minOrderMinor 0, shipping {none, 0}, discountTiers []`. Initial sheet: `shopName "", footer "",
validityDays 15, nextNo 1`. Initial channels: one channel `{id: "direct", name: t("channel.directName"), taxBp 0,
surchargeMinor 0, tiers [{0,0,0,0}], currency null, note "", sourceUrl "", asOf ""}`; compared = all; default
`direct`. The UI does not call `channelsForCurrency` or read `DEFAULT_CHANNELS` presets. Initial `pretty` = the
engine's default mode (§7.6).

`derive.ts` (T4.2) exposes, as Vue `computed`s: `currency`, `digits`, `locale` (`"en-US"` for en, `"pt-BR"`),
`slotMatches` (per plate/slot: `matchSlot` result, then `manualPrices[preset]` applied when source is `none` or
`preset` → source `"manual"`), `quoteInput: QuoteInput`, `result: QuoteResult`, `selected: ChannelQuote | null`,
`notCounted: NotCounted[]` (see §6.12), `fieldErrors: Record<path, ProblemCode>`. Slot key rule:
`sm:<filamentId>:<spoolId|0>`, `manual:<preset>`, `preset:<preset>`, `none:<preset>`; `pricePerKgMinor =
round(pricePerKg × 10^digits)`; `gramsMg = round(grams × 1000)`. Energy: `kwhE4(energyPerKwh, digits) ?? 0`.
Watts: `resolveWatts(printerModel, printerVendor, printers)` → `wattsW10 = round(watts × 10)`. Setup uses the
labor rate. Channels: compared ∪ selected defs through `toChannelInput`; invalid defs are skipped and reported.

### 5.2 Primitives (T4.2, `components/base/`)

| Component | Props | Emits | States / behaviour |
|---|---|---|---|
| `Icon` | `name: IconName; size?: 16 \| 20` | — | `aria-hidden="true"` always; labels live on the parent |
| `NumberField` | `modelValue: number \| null; label: string; scale: number` (1, 10, 100, 1000, 3600…) `; unit?: string` (suffix) `; prefix?: string; min?: number; max?: number; step: number` (model units) `; nullable?: boolean; required?: boolean; defaultValue?: number \| null` (shows reset when different) `; error?: string; helper?: string; id?: string; width?: "sm" \| "md"` | `update:modelValue`, `reset` | default, hover, focus, invalid, disabled (only inside a read-only saved view, never on primary paths), overridden (dot + reset button). Parsing via `parseScaled(text, scale, locale)`; formatting via `Intl.NumberFormat(locale, {maximumFractionDigits})`. Rules in §7.4 |
| `MoneyField` | as NumberField minus `scale`; `digits` from store; prefix = currency symbol from `formatToParts` | same | parses with `parseMoney(text, digits, locale)`; shows `"/kWh"`, `"/h"`, `"/kg"` via `unit` |
| `PercentField` | as NumberField; model in bp; scale 100; unit `%`; max default 9900 | same | |
| `Stepper` | `modelValue: number; min: number; max: number; label: string` | `update:modelValue` | `[−] [ 12 ] [+]`, 28px; input editable; − disabled at min shows as muted but stays focusable with `aria-disabled` |
| `Section` | `id: string; title: string; summary?: string; open: boolean; variant?: "box" \| "flush"; overridden?: boolean; invalid?: boolean` | `update:open` | header is a `<button aria-expanded aria-controls>` 40px; chevron rotates 90° (reduced motion: no rotation transition); summary right-aligned `.num .muted`; `overridden` = 6px dot `--opc-accent-text` before title with `sr-only` "Edited"; `invalid` = `alert-circle` in `--opc-bad`, forces open |
| `Segmented` | `options: {value, label, icon?}[]; modelValue; label: string` | `update:modelValue` | `role="radiogroup"`, arrow keys move; selected = `--opc-primary-bg` fill + accent-fg text (Spooler `.tabs .on`) |
| `Badge` | `tone: "neutral" \| "ok" \| "warn" \| "bad" \| "info"; text` | — | 18px pill, `--opc-fs-xs` 500; neutral = border + muted; warn = warn text on warn-bg; bad = bad text on bad-bg; ok = accent-text on selected |
| `InlineAlert` | `tone: "info" \| "warn" \| "bad"; title?: string; actions?: {label, run}[]` + default slot | — | left 3px border in tone colour, bg raised (info) / warn-bg / bad-bg; icon info / alert-triangle / alert-circle; `role="status"` (info, warn) or `role="alert"` (bad) |
| `ToastHost` + `state/toast.ts` | `toast({text, tone?, action?: {label, run}, ms?})` | — | bottom-right 16px, width 360 max, stack ≤ 3, newest bottom; 5 s default, 8 s with an action, errors stay until closed; `role="status"` / `role="alert"`; close button `x` |
| `EmptyState` | `art: "plate" \| "spool" \| "quote"; title; body?` + actions slot | — | SVG from `assets/empty-*.svg` inlined at 240×160, `color: var(--opc-muted)`; title lg 500; body sm muted; max-width 360 centered |
| `Popover` | `open: boolean; anchor: HTMLElement; label: string` + slot | `close` | `position: fixed` computed from anchor rect (never clipped by scroll containers); Esc and outside click close; focus moves to first field on open and returns to anchor on close; `role="dialog" aria-label` |
| `ResetButton` | `label: string; defaultText: string` | `click` | `.btn.icon` with `reset` glyph, `aria-label` = t("a11y.resetTo", {label, value}) |

### 5.3 Feature components

#### AppHeader (T4.4) — `AppHeader.vue`, `PrinterChip.vue`, `SpoolmanStatus.vue`

Layout, 44px, flex, gap 12, padding 0 12 (16 at W/X): `[mark 20px] [Segmented tabs: Calculator | Quotes |
Settings] [project name, flex 1, truncate, muted; hidden at M and N] [PrinterChip] [SpoolmanStatus] [Currency
chip] [Language select]`.

- **Tabs**: `Segmented` with icons `calc`, `list`, `sliders`; at N labels hide (icon only, `aria-label` kept).
- **PrinterChip** props: `model: string | null; watts: number; source: "saved" | "match"; estimated: boolean`.
  Render `[printer-3d] {model} · {watts} W` + Badge info "Estimated" when `source === "match" && estimated`.
  Model truncates at 18ch (M: 12ch; N: icon + watts only). No model: muted "No printer".
  Click → Popover: NumberField "Average power" (unit W, scale 1 stored as W, step 10, min 1, max 5000), helper
  "Smart-plug kWh ÷ print hours × 1000", line "Suggested: {w} W ({how})" where how ∈ exact / alias / tokens /
  default → i18n `printer.how.*`, ResetButton "Use suggested". Saves to `settings.printers[model].watts`
  immediately (debounced persist). Link "Printer price and lifetime" → Settings#settings-printers.
- **SpoolmanStatus** props: `state: "unset" | "connecting" | "prompt" | "ok" | "offline"; spools?: number;
  error?: SpoolmanError`. 8px dot + text. unset: hollow dot muted, "Spoolman not set". connecting: muted dot,
  "Connecting…". prompt: muted dot, "Allow access in OrcaSlicer". ok: dot `--opc-ok`, "Spoolman · {n} spools".
  offline: dot `--opc-bad`, "Spoolman offline". Click: unset → Settings#settings-spoolman; offline → Popover
  with error text + "Retry" + "Settings"; ok → triggers Refresh (re-fetch) with toast "Spoolman refreshed".
  At M/N the text collapses to the dot plus `aria-label`.
- **Currency chip**: `.btn` showing ISO code ("BRL"); `title` = source; click → Settings#settings-language.
- **Language select**: native `<select>` 28px: "Auto", "English", "Português (Brasil)". Switches without
  reload (i18n reactive).

#### PlateList + PlateCard + FilamentChip + MaterialRow + SpoolPicker + ImportButton (T4.3)

**PlateList** props: none (reads store). Structure:

```
Project name · 3 plates · 6h 14m · 296 g                     [↻ Refresh] [⇪ Import sliced file]
[InlineAlert warn if any stale] [InlineAlert info if source is imported file]
[plate grid]
One run of these plates makes [− 1 +] piece(s)        (pieces per set; Draft.unitsPerSet)
```

Title row: project name `--opc-fs-xl` 600 (falls back to "Untitled project"), meta `.num .muted` sums of
included plates (time = Σ seconds × copies, grams = Σ × copies). Refresh = `get_state` + `spoolman_fetch`.

**PlateCard** props: `plate: HostPlate | PlateSnapshot; row: PlateRow | null; matches: SlotMatchView[];
include: boolean; copies: number; stale: boolean; frozen: boolean`. Emits `update:include`, `update:copies`.

```
┌──────────────────────────────────────────────────────────────┐
│ [☑] ┌──────┐  Plate 1 — Bracket    [May be out of date]  $2.90│
│     │thumb │  2h 14m · 129 g · sliced 14:32       cost × 2     │
│     │64×64 │  (●PLA Basic 88 g Spooler) (●PETG 41 g #12)  [−2+]│
│     └──────┘                                                  │
│ ─────────────────── (expanded material rows) ──────────────── │
└──────────────────────────────────────────────────────────────┘
```

- Grid `16px 64px minmax(0,1fr) auto`, gap 12, padding 12, radius surface, border, bg `--opc-raised`.
- Name: `Plate {index+1}` plus ` — {name}` when the plate has a name. lg 500, truncate.
- Cost: `row.totalMinor` `.num` 15/500 fg; under it `.muted sm` "cost" or "cost × {copies}". Never amber.
- Include checkbox `aria-label` "Include plate {n}". Excluded: whole card text muted, cost replaced by
  "Not included", chips stay visible; card border dashed.
- Copies Stepper min 1 max 999, label "Copies of plate {n}".
- Thumb: `<img alt="">` 64×64 `object-fit: cover`, radius control, bg `--opc-track`; null → `empty-plate` art
  scaled to 64×43 centered, muted.
- Meta line `.num .muted sm`: time · grams · provenance. Provenance = `plate.slicedAt` → "sliced {time}" (today:
  `Intl.DateTimeFormat(locale, {timeStyle: "short"})`; other days: `{dateStyle: "short", timeStyle: "short"}`);
  `source === "file"` → "from {fileName}"; `slicedAt === null` → omitted. Unknown time or grams → "—".
- Stale badge `warn` "May be out of date" (`plate.stale`). The host cannot tell which plate changed, so this
  badge claims possibility, never certainty, and appears on every plate at once. Its `title` is
  `plate.staleWhy`. Selected state: none (cards are not selectable).
- Hover changes nothing on the card (it is not a click target). Only chips and controls are interactive.
- Saved-quote view (`frozen`): no checkbox changes to host; edits apply to the draft; badge neutral "Saved
  {date}" replaces stale.

**FilamentChip** props: `slot: HostSlot; match: SlotMatchView`. A `<button>` pill 24px: color dot 10px
(`slot.color`, 1px `--opc-border` ring; null → hatched track), short label (preset name minus vendor prefix and
`@printer` suffix, 20ch truncate), grams `.num`, source Badge (§8 `match.source.*`; tone neutral except
`preset` warn and `none` bad). `aria-expanded` toggles the MaterialRow list for this card (one list per card,
showing all slots, chip focus maps to its row).

**MaterialRow** (one per slot, inside the card under a hairline, no box): grid `20px minmax(0,1fr) auto auto
auto`: slot number `.muted`, preset full name + Spoolman filament name (`vendor name`, muted) on two lines,
grams, price per kg (`{money}/kg` + small source text "spool #14" / "filament" / "Orca preset" / "typed"),
actions: SpoolPicker button "Change" and ResetButton "Use automatic match" (only when override or manual exists).

**SpoolPicker**: Popover anchored to "Change". Content: search input (filters by name, vendor, material, id),
then a listbox (`role="listbox"`, arrow keys, Enter picks) grouped by material: each option `#{filamentId}
{vendor} {name}`, sub-line per non-archived spool `spool #{id} · {remaining} g · {price/kg}`; picking a filament
row stores `{filamentId}`, picking a spool row stores `{filamentId, spoolId}` in `slotOverrides[preset]`.
Below a hairline: MoneyField "Or type a price per kg" → `manualPrices[preset]` (used only when no Spoolman match).
Spoolman unset/offline: the listbox is replaced by a one-line note "Connect Spoolman to pick a spool." and only
the typed price remains. Max height 320, scrolls inside.

**ImportButton**: `.btn` `[upload] Import sliced file`, hidden `<input type="file" accept=".3mf">` (macOS ignores
accept, so any file can arrive). The webview hands over name, size and bytes, never a path. Flow:

1. **Check before reading**: name must end in `.3mf` (case-insensitive) else `import.error.notThreeMf`; size >
   100 MB → `import.error.tooBig` (shows the size). Nothing is read in either case.
2. **Reading** (`FileReader.readAsDataURL`, strip the `data:…;base64,` prefix): button `aria-busy="true"`, label
   `plates.importing` ("Reading {name} · {size}…"), and a 2px progress bar under the plate list title row
   (track `--opc-track`, fill `--opc-accent`, width = `loaded / total` from `progress` events; `role="progressbar"`
   with `aria-valuenow`). Escape or the inline "Cancel" ghost button calls `reader.abort()`.
3. **Sending and parsing**: bar switches to indeterminate (full width, no animation, 50% opacity), label
   `plates.importParsing` ("Reading plates from {name}…"). Call `import_sliced {name, b64}`.
4. **Result**: host error codes map to toasts: `not_zip` → `import.error.notThreeMf`, `no_slice_info` →
   `import.error.notSliced` (a plain project `.3mf` with no slice data: tell the user how to export a sliced
   one), `too_big` → `import.error.tooBig`, anything else → `import.error.unreadable`. Zero plates in a valid file
   → `import.error.notSliced`. On error the current plates stay untouched.

The input is reset after each attempt so the same file can be picked again. On success: plates replace the list, InlineAlert info "Plates from {file}. Slice in
OrcaSlicer to replace them." Next live `plates` event while showing imported plates: InlineAlert info "New slice
from OrcaSlicer." + action "Use it".

#### Cost sections (T4.4) — `MachineSection.vue`, `LaborSection.vue`, `ExtrasSection.vue`, `ExtrasEditor.vue`, `ShippingSection.vue`, `SalesSection.vue`

All use `Section variant="box"`, stacked with gap 8 under the plate list. Summaries come from `QuoteOk.lines`
(per piece at the current quantity). Fields are the `NumberField` family with `defaultValue` bound so overrides
show; a footer text button "Save as defaults" appears only when the section has overrides (writes them to
`settings.defaults`, clears the overrides, toast "Saved as defaults · Undo").

- **Machine and energy**: Average power (W, printer-scoped), Printer price (money, printer-scoped), Lifetime
  (h, printer-scoped), Price per kWh (money/kWh), Maintenance (money/h), Fixed cost per print hour (money/h),
  Failure rate (%), Failure model (select: "Add on top of cost" = `markup`, "Reprint lost prints" =
  `expected_waste`), checkbox "Count machine wear in failures", checkbox "Count printer wear" (=
  depreciationEnabled). Printer-scoped fields show helper "Saved for {model}" and have no override dot.
  Summary: `Energy {energy} · Machine {depreciation+maintenance+fixed} · Failures {failure}` (zero parts omitted;
  all zero → "Not counted").
- **Labor**: Labor rate (money/h), Hands-on time per run (min), Setup time per order (min). Helper under setup:
  "Charged once per order, spread over the quantity." Summary `{laborMinutes} min · {labor+setup}`.
- **Extras and accessories** (`ExtrasEditor`): rows grid `minmax(0,2fr) 120px 88px 132px 24px`: Name (text,
  required), Unit cost (money), Quantity (scale 1000, 3 decimals), Applies to (select: "Each piece" / "Each
  plate copy" / "Once per order"), remove (`trash`, undo toast). Under the rows: `[+ Extra]` opens a Popover menu
  listing `extrasCatalog` items (label + unit cost + scope) and "Custom extra" (empty row, focus name). Custom
  rows show a `.btn.ghost` "Save to catalog". At M the row wraps into 2 lines (`grid-template-columns: 1fr 1fr`).
  Empty: only the `+ Extra` button and helper "Rings, magnets, boxes, inserts." Summary `{n} · {extras +
  orderExtras}` or "None".
- **Shipping** (`ShippingControl` inside): Segmented "Not included" / "Customer pays" / "I pay" + MoneyField
  Amount (hidden for Not included). Helper per mode: customer → "Added to the order total, outside your margin.";
  absorbed → "Part of your cost, spread over the quantity." Summary per mode §2.3.
- **Sales fee** (`SalesSection.vue`): the selected channel's own fees, editable in place — **Fee** (% of the
  sale price → `tiers[0].pctBp`), **Fixed fee per sale** (money → `tiers[0].fixedMinor`), **Tax** (% → `taxBp`).
  These are channel-scoped like printer fields (helper "Saved for {channel}", no override dot): editing them
  edits that channel in Settings. When the channel has more than one price tier, the three fields are replaced
  by a read-only line `channel.steps` + "Edit in settings". Below a hairline: **Price rounding** (select; options
  from the engine, §7.6) and **Minimum order** (money). The plugin is not tied to any marketplace: no names,
  presets, rate sources or "as of" dates appear anywhere. Summary `summary.sales`: "Fee {pct} + {fixed} · tax
  {tax}" (all zero → "No fees"). On first run this section starts **open**.

#### PricePanel and details (T4.5) — `PricePanel.vue`, `OrderControls.vue`, `ChannelSelect.vue`, `PriceFlags.vue`, `BreakdownBars.vue`, `ChannelComparison.vue`, `BatchTable.vue`, `DiscountTierEditor.vue`, `PriceBar.vue`

**PricePanel** = right column: bg `--opc-raised`, border, radius surface; PriceSummary (padding 16) + details
(Sections `flush`, padding 0 16 16). Region `aria-labelledby="price-title"`.

PriceSummary, top to bottom:

1. **OrderControls**: row 1 `ChannelSelect` full width (native select, options = the user's channels in
   settings order; problem channels suffixed " — no price"). **Rendered only when the user has 2+ channels**;
   with one channel the row is absent and the hero label carries no channel name. Row 2 grid `1fr 1fr`, gap 8:
   Stepper "Quantity" (min 1, max 100000) and PercentField "Target margin" (min 0, max 9500, step 100 bp).
   Margin carries override dot/reset against defaults (quantity has no default; no dot). Under the quantity
   stepper, when `result.sparePieces > 0`: sm muted `.num` line `price.spare` ("3 spare pieces") with `title`
   `price.spareWhy`: one run makes `unitsPerSet` pieces, so the order prints the extras and pays for them.
2. Hero label (`id="price-title"`, sm muted): "Suggested price · per piece" (incomplete: "Suggested price
   (incomplete) · per piece").
3. **Hero number**: `selected.price` formatted, `--opc-fs-price` 600 `--opc-price` `.num`. The only amber.
4. Sub-line sm muted `.num`: q = 1 and no customer shipping → "Rounded {mode label}"; else "{grandTotal} order
   total for {q} pieces" + (shipping > 0 ? " incl. {s} shipping" : "").
5. **Tiles** (grid 2 cols, 1px divider between, no boxes): "Profit per piece" → `selected.profit` (xl 600 fg;
   negative in `--opc-bad` with leading "−"), qualifier sm muted: q > 1 ? "{orderProfit} on the order" :
   "{profitPerPrintHour}/print hour" (null → omitted). "Margin" → `marginBp` as percent 1 decimal (xl 600),
   qualifier "Break-even {breakEven}".
6. **PriceFlags** list (only true flags render; order: bad first): see §6.12 and §8 `flag.*`.
7. **QuoteActions** (T4.7 component placed here).

PriceDetails (each a flush `Section`, open state remembered):

- **BreakdownBars** "Where the price goes" (open): rows per piece from `lines` (cost line ids, zero rows
  omitted), then "Channel fees" (`feeFor(channel, price)` pct + fixed + shipping), "Tax" (taxCents, omitted if 0),
  "Profit" (`selected.profit`, omitted if ≤ 0). Row grid `minmax(0,1fr) 88px 72px`: label, amount `.num`
  right, share of price `.num .muted` right; under each a 4px bar (track `--opc-track`, fill `--opc-bar`,
  profit fill `--opc-bar-profit`), width = amount ÷ price, `transform: scaleX()` with 180 ms transition.
  After costs, a total row "Cost per piece {unitCostAtQuantity}" with top hairline (Σ of rounded lines may differ
  by 1–2 minor units; the total row is authoritative and no reconciliation line is shown). Filament row expands
  (chevron) to per-material detail (`detail[]` keys → slot labels). `extras` / `orderExtras` likewise.
- **ChannelComparison** "Compare channels": **not rendered with fewer than 2 channels; collapsed by default**
  (secondary), open state remembered. Table, rows = `comparison` (ok channels, engine order =
  order profit desc) then problem channels. Columns at W/X: Channel, Price, Fees, Net, Profit, Margin,
  Break-even. At M (340px) and N < 600: Channel, Price, Margin, Profit only. Selected channel row: bg
  `--opc-selected`, inset 2px left border `--opc-selected-border`, `aria-selected="true"`. Rows are buttons
  (`role="row"` inside `role="grid"` is overkill — use a `<table>` with a `<button>` in the channel cell that
  selects; whole row clickable by delegation). Dead zones present → `info` icon after the name with `title`
  and sr text "Fee step: {from}–{until} earns less". Problem rows: price cell spans the rest: muted problem text.
  Prices here are fg 500, never amber. Margin < 0 in `--opc-bad`.
- **BatchTable** "Batch pricing" (open if quantity > 1 or tiers exist): rows = `batchTable`; columns: Quantity,
  Discount, Unit cost, Unit price (selected channel), Order total, Order profit, Margin. The Discount cell
  shows the **effective** discount (`effectiveDiscountBp`, what the customer gets after rounding) and, when it
  differs from the nominal tier `discountBp`, a second muted line `batch.nominal` ("tier 10%"). Discounts may go
  below break-even: allowed, never blocked. Rows where `flags.belowBreakEven` or `orderBelowBreakEven` show
  Order profit and Margin in `--opc-bad` with sr text "loss"; `belowTarget` rows show Margin with a muted
  `info` icon (`title` `flag.belowTarget`). Current quantity row bold 500 + "current" sr text + `--opc-selected` bg. Clicking a row's quantity sets Draft.quantity. Below:
  **DiscountTierEditor**: rows `From quantity` (Stepper min 2) + `Discount` (PercentField max 9900) + remove;
  `+ Discount tier` (max 6). Tiers sorted by quantity on blur; duplicate quantities → inline error. Override
  dot vs `defaults.discountTiers`, "Save as defaults" text button.

**PriceBar** (N only): 56px fixed bottom: `[price 22px amber] [margin sm] [flags count Badge bad if any bad]
[Details ↓]`. `aria-hidden` when hidden.

#### QuoteActions, QuotesList, QuoteSheet (T4.7) — `QuoteActions.vue`, `QuotesView.vue`, `QuoteSheet.vue`, `QuotePreview.vue`, `quoteExport.ts`

**QuoteActions** (in PriceSummary): Row: `[Save quote]` primary; `[print] Print quote` `.btn`; `[download] CSV`
`.btn`. Above the row, two compact inline fields (collapsed behind `+ Customer` ghost button per the optional
field rule; auto-expanded when filled): Title (defaults to project name), Customer.
- Draft never saved → primary "Save quote". Saved and unchanged → primary replaced by quiet text "Saved as
  #0042" + ghost "Save as new". Saved and changed → primary "Save changes" + ghost "Save as new".
- Blocked states replace the print/CSV buttons with a muted reason line (no disabled buttons): no price →
  "No price to export yet."; incomplete (`notCounted` contains a filament slot) → "Price every filament before
  sending a quote." Save stays available in both (internal record).
- Print and CSV on an unsaved draft save first (toast "Saved as quote #{no}").

**QuotesView**: header row: title "Quotes" xl 600, count muted, search input (240px, `search` icon prefix,
filters title/customer/number). Table: No. (`#0042`), Title, Customer, Date (updatedAt, date medium), Qty,
Channel, Total (`summary.grandTotal`, fg), Margin (muted), actions: `.btn` "Open" + `more` menu (Duplicate,
Print, CSV, Delete). Sorted updatedAt desc. Row height 36. Open → Calculator with the quote loaded (frozen
plates banner §6.10). Delete → immediate, toast "Quote #0042 deleted" + Undo (8 s). No amber anywhere.
Empty: EmptyState quote "No saved quotes" / "Save a quote from the calculator to send it or reopen it later."
+ button "Go to calculator". Search with no hits: one muted line "No quote matches “{q}”."

**QuotePreview** (Calculator sub-state): toolbar 44px: `[arrow-left] Back`, Segmented "Itemized" / "Summary"
(persisted `settings.ui.sheetMode`), `[print] Print or save PDF` primary (`window.print()`), `[download] Save
HTML` (`export_file`), then the sheet centered on `--opc-raised` page background, sheet width 720px (N: 100%),
white paper look in both themes (sheet uses its own light tokens: bg `#FFFFFF`, fg `#2B2B2B`, muted `#5C6664`,
rule `#00675B`, total `#8A5800`). Stale or imported-plates warnings show above the sheet (never printed).

**QuoteSheet** content and rules: §9.

#### Settings (T4.6) — `SettingsView.vue` + `settings/*.vue`, `FirstRunChecklist.vue`

Layout: at W/X a 200px left rail with anchor links (sticky top 12), content column max-width 760. At M/N rail
hidden; content full width. Each group: title lg 500 + optional helper sm muted + fields; groups separated by
24px and a hairline. Save status at the view title: "Saved" (muted, appears 1.5 s after each persist) /
"Couldn't save. Retry" (bad, button). No Save button anywhere.

Groups (anchor ids `settings-<id>`):

1. **spoolman** — URL field (text, `placeholder="http://192.168.1.10:7912"`), "Test connection" `.btn`, result
   line (ok: "Connected. {spools} spools, {filaments} filaments, currency {cur}." / error per §8). Spooler hint
   when `spooler.url` and URL differs: InlineAlert info "Spooler uses {url}." + action "Use it". URL validation:
   must start with `http://` or `https://`; else inline error `spoolman.error.scheme`. Saving the URL triggers a
   fetch (host shows a one-time permission prompt; status "prompt").
2. **costs** — same fields as Machine (non-printer), Labor sections; they write `defaults`.
3. **pricing** — Target margin, Pretty rounding, Minimum order, Default shipping (Segmented + amount), Default
   discount tiers (DiscountTierEditor reused from T4.5 — import it, do not copy).
4. **channels** — `ChannelEditor` (below).
5. **printers** — table: Printer model, Average power (W, editable), Suggested (`{w} W` + Estimated badge),
   Printer price, Lifetime (h), remove (`trash`, undo). Current printer row first with Badge neutral "Current".
   Helper: "Smart-plug kWh ÷ print hours × 1000 gives your printer's real average power."
6. **extras** — catalog table: Name, Unit cost, Quantity, Applies to, remove; `+ Catalog item`.
7. **sheet** — Shop name (text, max 60), Footer note (textarea 3 rows, max 280), Validity (days, 0 = no date),
   Next quote number (integer ≥ 1).
8. **language** — Language select; Currency (only editable when Spoolman is not connected: text input ISO code,
   3 letters, validated with `Intl.NumberFormat`; when connected: read-only "{cur} from Spoolman"). If
   `defaultsCurrency` ≠ current currency: InlineAlert warn "Defaults were entered in {old}. Check money values." +
   action "They're fine" (sets `defaultsCurrency = currency`).
9. **about** — plugin version, the `setup.permission` line, README address as selectable text with a Copy
   button (no link, §7.10), "Reset all settings" (`.btn
   danger`, confirm inline: button turns into "Click again to reset" for 4 s; then toast with Undo 8 s).

**ChannelEditor**: channels are **Direct plus whatever the user adds**; no marketplace presets ship.
List rows (40px): Compare checkbox (`aria-label` "Compare {name}"; shown only with 2+ channels), Default radio
(`name="default-channel"`; only with 2+), name, fee summary `.muted .num` (`channel.feeSummary`, tiers > 1 →
`channel.steps`), `pencil` edit, `trash` (any channel except the last remaining one). Editing expands the row
inline (one at a time):

- Name (text, required, max 40).
- Fee (% → `tiers[0].pctBp`), Fixed fee per sale (money → `tiers[0].fixedMinor`), Tax (% → `taxBp`).
- `+ Price tiers` ghost button (optional field rule; auto-expanded when the channel already has > 1 tier):
  helper "Use when the fee changes with the sale price." Table: From price (money; first row fixed at 0,
  read-only, mirrors the fields above), Fee (%), Fixed fee, remove; `+ Price tier` (≤ `MAX_TIERS`).

Not exposed (kept 0): `surchargeMinor` and per-tier `shippingMinor`; shipping lives in the Shipping section.
New channels: `currency: null`, `note: ""`, `sourceUrl: ""`, `asOf: ""`; none of these fields are shown.
Validation from `validateChannelDef` / `validateChannelList` maps to inline errors (§8 `channel.def.*`), tier
errors on the tier row. Invalid channels are saved (so typing isn't lost) but marked with Badge bad "Fix fees"
and excluded from pricing. `+ Channel` adds `newCustomChannel(t("channel.newName"), ids)` and opens it.

**FirstRunChecklist**: §2.4.

---

## 6. States

Price panel rule for every state: it shows a real number, or a sentence saying why there is none. It never
shows `0`, `NaN`, an empty string or a placeholder price. The dev harness must reach each state with
`?state=<name>` (T4.2 mock, names in brackets).

### 6.1 All good — wide (W, 1280px) [`ok`]

```
┌ [⌂] [Calculator|Quotes|Settings]  Desk organizer        [▣ Snapmaker U1 · 120 W] (●Spoolman · 14 spools) BRL [Auto▾] ┐
├────────────────────────────────────────────────────────────────┬──────────────────────────────────────┤
│ Desk organizer   3 plates · 7h 14m · 401 g    [↻] [⇪ Import]  │ [Direct                          ▾] │
│ ┌──────────────────────────────────────────────────────────┐  │ Quantity [− 1 +]  Target margin 30 % │
│ │☑ [img] Plate 1 — Tray                         R$ 12,40   │  │ Suggested price · per piece          │
│ │        2h 14m · 129 g                          cost      │  │ R$ 48,90            ← amber, 40px     │
│ │        (●PLA 88 g Spooler) (●PETG 41 g #12)     [− 1 +]  │  │ Rounded up to a whole amount         │
│ └──────────────────────────────────────────────────────────┘  │ Profit per piece │ Margin             │
│ ┌ Plate 2 … ┐  ┌ Plate 3 … ┐                                   │ R$ 14,52         │ 29,7 %             │
│ One run of these plates makes [− 1 +] piece                    │ R$ 3,10/print h  │ Break-even R$ 33,4 │
│ ▸ Machine and energy        Energy R$ 0,82 · Machine R$ 1,90   │ [Save quote] [Print quote] [CSV]     │
│ ▸ Labor                     10 min · R$ 4,17                   │ ──────────────────────────────────── │
│ ▸ Extras and accessories    None                               │ ▾ Where the price goes               │
│ ▸ Shipping                  Not included                       │   Filament   R$ 9,03  18 % ▇▇▇▁▁▁    │
│ ▸ Sales fee                 Fee 5% + R$ 1,00 · tax 6%          │   …                                  │
│                                                                │ ▾ Compare channels                   │
│                                                                │ ▸ Batch pricing                      │
└────────────────────────────────────────────────────────────────┴──────────────────────────────────────┘
```

### 6.2 Loading [`loading`]

Before `get_state` resolves (and at most 10 s): header renders with tabs only; left: three skeleton plate cards
(88px), sections hidden; right: skeleton blocks for controls, a 40px-high skeleton bar where the price goes, label
"Waiting for OrcaSlicer…" (sm muted, `role="status"`). After 10 s without a reply → host error (6.3).

### 6.3 Host error [`hostError`]

`get_state` rejects or times out. Whole body replaced:

```
            (alert-circle)
   Couldn't reach OrcaSlicer
   The plugin tab lost its connection to OrcaSlicer. Reopen the tab, or restart OrcaSlicer if this repeats.
   [Try again]          Details: {error text, muted, selectable}
```

Later command failures (`save_settings`, `save_quotes`, `export_file`, `import_sliced`) → error toast with the
action name and "Try again"; settings save failure also shows on the Settings title (§5.3). Data in memory is
kept; nothing is discarded.

### 6.4 No project / nothing sliced [`empty`]

`plates.length === 0`. Left: EmptyState plate, title "Slice to see a price", body "Slice the project in
OrcaSlicer. Each plate shows up here with its time, filament and cost.", actions `[⇪ Import sliced file]`.
No project open (`host.projectName === null` and no plates): title "Open a project to price it", same body/action.
Sections are still listed (user can review defaults). Price panel: OrderControls visible; hero area shows the sm
muted sentence "No plates yet. The price appears after slicing." in place of the number; tiles, flags, details,
actions hidden. No amber on screen.

### 6.5 Some plates stale [`stale`]

```
│ ⚠ Plates may be out of date. Something changed in OrcaSlicer after the last slice, and it      │
│   doesn't say which plate. Slice again to refresh.                                              │
│ ☑ [img] Plate 1 — Tray   [May be out of date]                 R$ 12,40                        │
│         2h 14m · 129 g · sliced 14:32                                                         │
```

All plates marked stale by the host together (no per-plate signal; spike §6). Wording claims possibility only.
The "sliced {time}" meta on every card lets the user judge freshness. The alert has a second muted line,
`plates.staleBlind`, shown always under the plate list title row as helper text (sm muted, one line, truncate
with `title`) once the user has sliced at least once in the session: mirror, center and unsaved setting edits
never trigger staleness, so the UI must not imply that a missing badge means fresh data. Price still computed and shown; PriceFlags
adds info flag "Based on plates that may be out of date." Each plate clears its badge when its new slice arrives.
Quote preview shows the same warning above the sheet. Export allowed.

### 6.6 Spoolman not set [`noSpoolman`]

Header status "Spoolman not set". Chips use preset prices: Badge warn "Preset price" or bad "No price".
If every slot has a preset cost: no flag beyond an info flag "Filament prices come from Orca presets." (once, not
per slot). First run shows checklist row 1 instead.

### 6.7 Spoolman offline [`offline`]

Header status bad "Spoolman offline". InlineAlert warn above plates: "Spoolman isn't responding at {url}. Filament
uses Orca preset prices until it's back." + actions "Retry", "Settings". Chips switch to preset/none sources.
Saved overrides are kept, not cleared. Price flag info "Filament prices come from Orca presets." Retry every 60 s
silently while the tab is visible (`document.visibilityState`), status "Connecting…" during retries.

### 6.8 Unmatched filament slot [`unmatched`]

A slot with `pricePerKg === null` (source `none`). Chip Badge bad "No price"; plate cost renders followed by a bad
`alert-circle` with sr text "missing filament price". Hero label → "Suggested price (incomplete) · per piece";
PriceFlags bad: "Slot {n} ({preset}) has no price, counted as 0." + action "Pick spool" (opens that slot's
SpoolPicker). QuoteActions shows the blocked reason line instead of Print/CSV.

### 6.9 Impossible margin [`impossible`]

Selected channel returns `ok:false, problem:"margin_impossible"` (fees + tax + margin ≥ 100%, or fixed fees
cannot be covered). Hero area, in place of the number (fg, xl 600, not amber): "No price works on {channel}".
Under it sm: "Fees, tax and your target margin add up to 100% or more. Lower the target margin or the channel
fees." + actions `.btn.ghost` "Lower target margin" (focuses the margin field) and "Edit channel fees". Tiles and
breakdown hidden; Compare channels stays open, so a working channel is one click away. `search_bound_exceeded` →
"This channel's fee steps are too complex to price. Simplify its fee steps." `channel_invalid` → "This channel's
fees are invalid. Fix them in Settings."

Quote-level failure (`result.ok === false`): `no_plates` → hero sentence "Include at least one plate." Every other
code maps to its field (`path` → field id; inline error, section forced open) and the hero sentence "Fix the
highlighted field to see a price." `engine_range` → "A number is too large to calculate. Check quantities and
prices." `material_price_conflict` → hero sentence + chip error "Same filament with two prices. Pick one spool."

### 6.10 Saved quote open [`savedQuote`]

Banner (InlineAlert info) above plates: "Quote #0042 · saved {date}. Plates and prices are as saved." + actions
"Use current slice" (replaces frozenPlates with live plates, keeps other fields), "Close quote" (back to a fresh
draft). Live `plates` events do not change a frozen quote; they add "New slice from OrcaSlicer." to that banner.

### 6.11 First run [`firstRun`]

```
│ Set up once                                                                   [Done]│
│ 1 Filament prices   Spooler uses Spoolman at http://10.0.0.5:7912  [Use this Spoolman]  Skip │
│ 2 Energy price      [ R$      0,95 ]/kWh   From your electricity bill.                │
│ 3 Your time         Labor rate [ R$ 30,00 ]/h   Target margin [ 30 ]%                 │
```

One bordered surface (not a card containing cards; rows separated by hairlines). Price panel works throughout,
with not-counted flags for what's missing.

### 6.12 Not-counted flags (PriceFlags, info tone unless noted)

| Condition | Flag text key | Action |
|---|---|---|
| slot without price | `flag.slotNoPrice` (bad) | Pick spool |
| `energyPerKwh === null` | `flag.notCounted` with item `notCounted.energy` | Set (focus field) |
| `laborPerHourMinor === null` | `flag.notCounted` with `notCounted.labor` | Set |
| depreciation on, printer price or lifetime empty | `flag.notCounted` with `notCounted.wear` | Set |
| channel def invalid and skipped | `flag.channelSkipped` | Edit channel fees |
| any field invalid | `flag.fieldInvalid` | — |
| plate `seconds === null` (included) | `flag.notCounted` with `notCounted.time` | — (slice again) |
| slot `grams === null` (included plate) | `flag.notCounted` with `notCounted.grams` | — (slice again) |

Several not-counted items join into one flag: "Not counted yet: energy, labor." Engine flags (`ChannelOk.flags`, committed `quotePricing.ts`), in display order:

| Flag | Tone | Key | Params |
|---|---|---|---|
| `belowBreakEven` (per-piece profit < 0) | bad | `flag.belowBreakEven` | `amount` = −profit |
| `orderBelowBreakEven` and not `belowBreakEven` (order-level costs sink the order) | bad | `flag.orderBelowBreakEven` | `amount` = −orderProfit |
| `belowTarget` and not the two above (discount or minimum pushed margin under target) | info | `flag.belowTarget` | `margin` = marginBp, `target` |
| `minimumApplied` (per-piece price raised to `ceil(minOrder ÷ q)`) | info | `flag.minimum` | `amount` = minOrder |
| `deadZoneJumped` | info | `flag.deadZone` | `price`, `from`/`until` = zone that contained the raw price (first zone with `untilCents < price`), `channel` |
| `discounted` | info | `flag.discount` | `pct` = **`effectiveDiscountBp`** (what the customer actually gets), `q` = tier minQty |

Then UI flags: stale `flag.stale`; preset prices `flag.presetPrices`.

### 6.13 Narrow (N, 760px) [`narrow`]

```
┌[⌂][▦][≡][⚙]                    [▣ 120 W] (●) BRL [Auto▾]┐
│ Desk organizer  3 plates · 7h 14m          [↻][⇪]        │
│ ┌ Plate 1 card (full width) ┐                            │
│ ┌ Plate 2 ┐ ┌ Plate 3 ┐ (stacked)                        │
│ ── price panel in flow (id=price) ──                     │
│ [Direct ▾] Quantity [−1+] Margin [30]%                   │
│ R$ 48,90  …tiles, flags, actions                         │
│ ▸ Machine and energy … (sections)                        │
│ ▸ Where the price goes / Compare / Batch                 │
├──────────────────────────────────────────────────────────┤
│ R$ 48,90  29,7 %                         [Details ↓]     │ ← PriceBar, only while #price is off-screen
└──────────────────────────────────────────────────────────┘
```

Tables in details scroll horizontally inside their own wrapper (`overflow-x: auto`); the page never scrolls
sideways (`scrollWidth − innerWidth = 0` at 760 and 900).

### 6.14 Quotes and Settings empty/edge states

Quotes empty: §5.3. Settings with Spoolman test running: button `aria-busy`, label "Testing…". Spoolman prompt
pending: status line "OrcaSlicer is asking for permission to reach {host}. Allow it in the dialog." Prompt
denied: error `spoolman.error.denied`.

---

## 7. Interaction rules

### 7.1 Live recalculation

- No Calculate button. `result` is a Vue `computed` over `quoteInput`; it recalculates synchronously on every
  committed change. A field commits on each `input` event whose text parses; invalid text never reaches the model.
- If `computeQuote` exceeds 16 ms on the 3-plate fixture with 6 channels and 4 tiers (T4.5 measures with
  `performance.now()` in dev), wrap the input in a 120 ms trailing debounce; do not debounce otherwise.
- Persistence debounce: settings 600 ms trailing after the last valid change; flush on `visibilitychange` to
  hidden and before view switch. Quotes persist immediately.
- The price number changes without animation (no count-up, no flash). Bars transition `transform` 180 ms.

### 7.2 Overrides

- Effective value = `draft.overrides[k] ?? settings.defaults[k]`. A calculator edit writes `overrides[k]`;
  editing back to the default value deletes the key (no dot).
- Overridden field: 6px dot `--opc-accent-text` before the label, ResetButton after the label. Reset deletes
  the key, toast "Reset to default" + Undo (5 s).
- Section header shows the dot when any of its fields is overridden; footer "Save as defaults" (§5.3).
- Printer-scoped and preset-scoped values are never overrides (they save to their profile).
- A reopened saved quote: its frozen values become the draft's overrides wherever they differ from current
  defaults, so the user sees which values the quote fixed.

### 7.3 Stale plates

Host pushes `plates` with `stale: true`. UI shows the stale alert, badges and flag (§6.5). It never discards or
greys out stale data, never blocks saving. A fresh `plates` event replaces plates by index; include/copies in
`draft.plates` survive by index; a plate index that disappears drops its entry.

### 7.4 Number entry

- `<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false">`; never `type="number"`.
- Accept both separators per `parseMoney` / `parseScaled` with the UI locale. Accept a leading currency symbol
  or trailing unit and strip them. Reject negatives (the parsers return null).
- Empty: `required` → error `field.error.required`; `nullable` → model `null` ("not set"), helper turns into
  "Not set — counted as 0" (muted).
- Money fields reject extra decimals instead of rounding (`parseMoney` → null). Error by `moneyError` (§12.14):
  too many decimals → `field.error.decimals` with `n = digits` (energy: `digits + 2`), or `field.error.noDecimals`
  when `digits === 0`; otherwise `field.error.number`. Example in `field.error.number` uses the locale
  (`1.234,50` / `1,234.50`). Non-money fields round half-up via `parseScaled` and never show a decimals error.
- Invalid text: model keeps the last valid value; `aria-invalid` and the inline error appear on blur or after
  800 ms idle, whichever first; error text `field.error.number`; out of range `field.error.min` / `field.error.max`.
- On blur: reformat to the locale (`1234,5` → `1.234,50` for pt-BR money, `30` → `30` for percent).
- On focus via click or Tab: select all.
- Keys: ArrowUp / ArrowDown ± step; Shift × 10; Alt × 0.1 (money and percent only); PageUp / PageDown ± 10 ×
  step; Enter commits and keeps focus; Escape restores the text of the last committed value and blurs. Values
  clamp to min/max. Mouse wheel does nothing.
- Stepper: same keys on its input; buttons `aria-label` "Decrease {label}" / "Increase {label}".

### 7.5 Destructive actions and undo

Every delete is immediate with an Undo toast (8 s): quote, channel, printer profile, catalog extra, extra row,
discount tier, reset to defaults, reset all settings. No confirmation dialogs anywhere,
except "Reset all settings" uses the two-click inline confirm plus undo. Undo restores the exact object at its
previous index and re-persists.

### 7.6 Field table

Scope: D = default (overridable per quote), P = printer profile, S = preset, Q = per quote only.

| Key | Label key | Unit | Model | Scale / parser | Step | Min | Max | Scope |
|---|---|---|---|---|---|---|---|---|
| watts | field.watts | W | number W | parseScaled ×1 (1 decimal kept → W10 ×10) | 10 | 1 | 5000 | P |
| acquisitionMinor | field.printerPrice | money | minor | parseMoney | 100 major | 0 | 10^9 major | P |
| lifetimeHours | field.lifetime | h | int | parseScaled ×1 | 100 | 0 | 200000 | P |
| energyPerKwh | field.energy | money/kWh | text canonical | `kwhE4` (digits+2) | 0.01 major | 0 | 100 major | D, nullable |
| maintenancePerHourMinor | field.maintenance | money/h | minor | parseMoney | 0.10 | 0 | — | D |
| fixedPerPrintHourMinor | field.fixedPerHour | money/h | minor | parseMoney | 0.10 | 0 | — | D |
| failureBp | field.failure | % | bp | parseScaled ×100 | 100 | 0 | 9500 | D |
| failureMode | field.failureMode | — | enum | select | — | — | — | D |
| failureIncludesMachine | field.failureMachine | — | bool | checkbox | — | — | — | D |
| depreciationEnabled | field.depreciation | — | bool | checkbox | — | — | — | D |
| laborPerHourMinor | field.laborRate | money/h | minor | parseMoney | 1 major | 0 | — | D, nullable |
| laborMinutes | field.laborMinutes | min | int | parseScaled ×1 | 5 | 0 | 6000 | D |
| setupMinutes | field.setupMinutes | min | int | parseScaled ×1 | 5 | 0 | 6000 | D |
| targetMarginBp | field.margin | % | bp | parseScaled ×100 | 100 | 0 | 9500 | D |
| pretty | field.pretty | — | PrettyMode | select, options = `PRETTY_MODES` (§12.13) | — | — | — | D |
| minOrderMinor | field.minOrder | money | minor | parseMoney | 1 major | 0 | — | D |
| shipping.mode / minor | field.shipping / field.shippingAmount | money | enum + minor | Segmented / parseMoney | 1 major | 0 | — | D |
| discountTiers[].minQty | field.tierQty | pieces | int | Stepper | 1 | 2 | 100000 | D |
| discountTiers[].discountBp | field.tierDiscount | % | bp | parseScaled ×100 | 100 | 0 | 9900 | D |
| quantity | field.quantity | pieces | int | Stepper | 1 | 1 | 100000 | Q |
| unitsPerSet | field.unitsPerSet | pieces | int | Stepper | 1 | 1 | 1000 | Q |
| plates[i].copies | field.copies | — | int | Stepper | 1 | 1 | 999 | Q |
| extras[].unitMinor | field.extraCost | money | minor | parseMoney | 0.10 | 0 | — | Q |
| extras[].qtyE3 | field.extraQty | — | E3 | parseScaled ×1000 | 1 (=1000) | 0 | 10^6 | Q |
| manualPrices[preset] | field.manualPrice | money/kg | minor | parseMoney | 1 major | 0 | — | S |
| channel taxBp, tier pctBp | field.tax / field.fee | % | bp | parseScaled ×100 | 50 | 0 | 9000 (fee + tax) | Channel (Sales fee section and Settings) |
| tier minMinor, fixedMinor | field.tierFrom / field.fixedFee | money | minor | parseMoney | 1 major | 0 | — | Channel |

"Major" step = `10^digits` minor units (JPY step 1 = ¥1).

### 7.7 Keyboard map and focus order

No global single-key or Cmd/Ctrl shortcuts: OrcaSlicer owns them and the webview may forward them. Keys:

| Key | Where | Action |
|---|---|---|
| Tab / Shift+Tab | everywhere | DOM order (below) |
| Enter / Space | buttons, section headers, chips, rows | activate |
| ArrowLeft / ArrowRight | Segmented (tabs, shipping, sheet mode) | move selection (roving tabindex) |
| ArrowUp / ArrowDown | number fields, steppers; SpoolPicker listbox; extras menu | step / move option |
| Home / End | listbox, Segmented | first / last |
| Escape | Popover, SpoolPicker, menus, number field | close and return focus to the trigger / restore value |

Focus order (Calculator, W): skip link "Skip to price" (first focusable, visible on focus) → header tabs →
printer chip → Spoolman status → currency → language → checklist (first run) → plate list title row actions →
plate cards in order (checkbox → chips → copies) → pieces per set → sections → price panel (channel → quantity →
margin → flags actions → title/customer → Save → Print → CSV) → details. At N the same DOM order holds; the price
panel follows the plates (the skip link targets `#price`). View switch moves focus to the view title (`tabindex
="-1"`).

### 7.8 Screen reader

- Landmarks: `<header>`, `<main>` (left column `aria-label` "Plates and costs"), `<aside aria-labelledby=
  "price-title">` for the price column.
- Hero price: a visually hidden live region (`aria-live="polite" aria-atomic="true"`) announces
  `a11y.priceAnnounce` ("Suggested price {price}, margin {margin}, on {channel}") 1 s after the last change,
  only when price or margin actually changed. The visual number itself is not live (avoids per-keystroke chatter).
- Blocked/incomplete states announce through the same region with the hero sentence.
- Plate card is an `<article aria-labelledby>`; cost has sr prefix "Cost". Filament chip `aria-label`:
  "{preset}, {grams}, price source {source}". Color dots `aria-hidden`.
- Tables: `<table>` with `<caption class="sr-only">`, `scope="col"` headers; selected channel row
  `aria-selected="true"` plus sr text "selected".
- Badges are text, never colour-only. Flags start with sr text "Warning:" (bad) / "Note:" (info).
- Toasts `role="status"`; error toasts `role="alert"`.
- Icons `aria-hidden`; icon buttons always have `aria-label`.

### 7.9 Motion

All motion conveys state; durations `--opc-dur-fast` 120 ms (hover, press) and `--opc-dur` 180 ms. Section
expand does not animate height (`grid-template-rows: 0fr → 1fr` needs Safari 16): it opens at once with a 120 ms opacity fade of
the body. Bars transition `transform` over 180 ms. No page-load choreography, no number animation, no shimmer.
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important;
animation: none !important; } }` (this media query is allowed; only `prefers-color-scheme` is banned). T4.8
refines within these limits.

### 7.10 Browser feature limits (WKWebView Safari 14 floor, WebView2, WebKitGTK)

**No navigation out of the page.** Clicking a link or calling `window.open` loads the URL into the plugin tab
and replaces the UI (spike §8). So: no `<a href>` to external or file URLs, no `target="_blank"`, no
`window.open`, no `location` changes. URLs (Spoolman address, channel source URLs, README) render as selectable
text with a "Copy" icon button. In-page anchors (`#settings-…`) are buttons that call `scrollIntoView`, not links.
Opening a file or browser from Python needs a `process` grant; V1 does not ask for it.

Do not use: `:has()`, `@container`, `@layer` (15.4), `dvh/svh` (15.4), `<dialog>` (15.4), `inert` (15.5),
`accent-color` (15.4), `aspect-ratio` (15), `color-mix` outside `@supports`, `@starting-style`, `Array.prototype.at`
(15.4), `structuredClone` (15.4), `Object.hasOwn` (15.4), CSS nesting. Flex `gap` needs Safari 14.1: use grid
`gap` for layouts, flex `gap` only for decorative spacing where a missing gap is harmless. Allowed: CSS custom
properties, grid, `position: sticky`, `:focus-visible` (degrades), `:is()`, IntersectionObserver,
`Intl.NumberFormat.formatToParts`, `Intl.PluralRules`, `queueMicrotask`.

---

## 8. Copy

Rules: sentence case, short, no exclamation marks, no jargon ("dead zone" is internal; users read "fee step"), no
emoji. pt-BR uses natural Brazilian usage and the imperative ("Fatie", "Escolha"). Placeholders `{name}`; plurals
via `Intl.PluralRules` with `_one` / `_other` suffixed keys. `i18n.ts` exports `t(key, params?)` reactive on
`lang`. Missing key in pt-BR falls back to en; missing in en renders the key (and logs once in dev).

### 8.1 Formatting per locale

| What | en (`en-US`) | pt-BR (`pt-BR`) | Rule |
|---|---|---|---|
| Money | `$1,234.50`, `R$1,234.50` | `R$ 1.234,50`, `US$ 1.234,50` | `formatMoney(minor, currency, locale)`; currency from Spoolman/settings, locale from UI language |
| Money in fields | `1,234.50` + prefix symbol | `1.234,50` + prefix | `Intl.NumberFormat(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits})` |
| Price per kWh | 2 extra fraction digits allowed: `$0.1450/kWh` | `R$ 0,9512/kWh` | trailing zeros trimmed down to `digits` |
| Percent | `29.7%` | `29,7%` | `Intl.NumberFormat(locale, {style:"percent", maximumFractionDigits: 1})` of bp/10000 |
| Duration | `2h 14m`, `1d 3h`, `45m`, `30s` | `2h 14min`, `1d 3h`, `45min`, `30s` | largest two units; < 1 min shows seconds |
| Mass | `41 g`, `4.6 g` (< 10 g, 1 decimal), `1.24 kg` (≥ 1000 g) | `41 g`, `4,6 g`, `1,24 kg` | |
| Power | `120 W` | `120 W` | |
| Count | `1,000 pieces` | `1.000 peças` | |
| Date | `Nov 10, 2026` | `10 de nov. de 2026` | `Intl.DateTimeFormat(locale, {dateStyle: "medium"})` |
| Quote number | `#0042` | `nº 0042` | zero-pad 4 |
| CSV | `.` decimal, no grouping, no symbol, ISO date | same | locale-independent (§9.3) |

### 8.2 Keys — app, navigation, header

| Key | en | pt-BR |
|---|---|---|
| app.name | Orca Print Calculator | Orca Print Calculator |
| nav.calc | Calculator | Calculadora |
| nav.quotes | Quotes | Orçamentos |
| nav.settings | Settings | Ajustes |
| nav.skipToPrice | Skip to price | Pular para o preço |
| header.untitled | Untitled project | Projeto sem nome |
| header.noPrinter | No printer | Sem impressora |
| header.currencyFromSpoolman | From Spoolman | Do Spoolman |
| header.currencyFromSettings | Set in settings | Definida nos ajustes |
| header.language | Language | Idioma |
| lang.auto | Auto | Automático |
| lang.en | English | English |
| lang.pt | Português (Brasil) | Português (Brasil) |
| printer.estimated | Estimated | Estimado |
| printer.power | Average power | Potência média |
| printer.powerHelp | Smart-plug kWh ÷ print hours × 1000 | kWh da tomada inteligente ÷ horas de impressão × 1000 |
| printer.suggested | Suggested: {watts} W ({how}) | Sugerido: {watts} W ({how}) |
| printer.how.exact | matched model | modelo encontrado |
| printer.how.alias | matched model | modelo encontrado |
| printer.how.tokens | closest model | modelo mais próximo |
| printer.how.default | unknown model, generic value | modelo desconhecido, valor genérico |
| printer.useSuggested | Use suggested | Usar sugerido |
| printer.moreSettings | Printer price and lifetime | Preço e vida útil da impressora |
| spoolman.unset | Spoolman not set | Spoolman não configurado |
| spoolman.connecting | Connecting… | Conectando… |
| spoolman.prompt | Allow access in OrcaSlicer | Permita o acesso no OrcaSlicer |
| spoolman.ok_one | Spoolman · {n} spool | Spoolman · {n} carretel |
| spoolman.ok_other | Spoolman · {n} spools | Spoolman · {n} carretéis |
| spoolman.offline | Spoolman offline | Spoolman fora do ar |
| spoolman.refreshed | Spoolman refreshed | Spoolman atualizado |
| spoolman.retry | Retry | Tentar de novo |

### 8.3 Keys — plates and materials

| Key | en | pt-BR |
|---|---|---|
| plates.meta | {plates} · {time} · {grams} | {plates} · {time} · {grams} |
| plates.count_one | {n} plate | {n} placa |
| plates.count_other | {n} plates | {n} placas |
| plates.refresh | Refresh | Atualizar |
| plates.import | Import sliced file | Importar arquivo fatiado |
| plates.importing | Reading {name} · {size}… | Lendo {name} · {size}… |
| plates.importParsing | Reading plates from {name}… | Lendo as placas de {name}… |
| plates.importCancel | Cancel | Cancelar |
| plates.fromFile | Plates from {file}. Slice in OrcaSlicer to replace them. | Placas de {file}. Fatie no OrcaSlicer para substituir. |
| plates.newSlice | New slice from OrcaSlicer. | Novo fatiamento no OrcaSlicer. |
| plates.useNewSlice | Use it | Usar |
| plates.staleAlert | Plates may be out of date. Something changed in OrcaSlicer after the last slice, and it doesn't say which plate. Slice again to refresh. | As placas podem estar desatualizadas. Algo mudou no OrcaSlicer depois do último fatiamento, e ele não informa qual placa. Fatie de novo para atualizar. |
| plates.staleBlind | Mirroring, centering and unsaved setting changes don't mark plates. Slice again after them. | Espelhar, centralizar e mudar ajustes sem salvar não marcam as placas. Fatie de novo depois disso. |
| plates.unitsPerSet_one | One run of these plates makes {control} piece | Uma rodada destas placas rende {control} peça |
| plates.unitsPerSet_other | One run of these plates makes {control} pieces | Uma rodada destas placas rende {control} peças |
| plate.title | Plate {n} | Placa {n} |
| plate.titleNamed | Plate {n} — {name} | Placa {n} — {name} |
| plate.include | Include plate {n} | Incluir placa {n} |
| plate.copies | Copies of plate {n} | Cópias da placa {n} |
| plate.cost | cost | custo |
| plate.costTimes | cost × {n} | custo × {n} |
| plate.excluded | Not included | Fora do orçamento |
| plate.stale | May be out of date | Pode estar desatualizada |
| plate.staleWhy | OrcaSlicer changed something after this slice. It can't say which plate, so slice again to be sure. | O projeto mudou depois deste fatiamento. O OrcaSlicer não informa qual placa, então fatie de novo para ter certeza. |
| plate.slicedAt | sliced {time} | fatiada às {time} |
| plate.fromFile | from {file} | de {file} |
| plate.saved | Saved {date} | Salva em {date} |
| plate.missingPrice | missing filament price | falta o preço do filamento |
| match.source.override | Picked | Escolhido |
| match.source.spooler | Spooler | Spooler |
| match.source.name | #{id} | #{id} |
| match.source.notes | Notes | Notas |
| match.source.preset | Preset price | Preço do perfil |
| match.source.manual | Typed | Digitado |
| match.source.none | No price | Sem preço |
| match.price.spool | spool #{id} | carretel #{id} |
| match.price.filament | filament | filamento |
| match.price.preset | Orca preset | perfil do Orca |
| match.price.manual | typed | digitado |
| match.change | Change | Trocar |
| match.useAuto | Use automatic match | Usar vínculo automático |
| picker.search | Search spools | Buscar carretéis |
| picker.spoolLine | spool #{id} · {left} left · {price}/kg | carretel #{id} · restam {left} · {price}/kg |
| picker.typePrice | Or type a price per kg | Ou digite o preço por kg |
| picker.connect | Connect Spoolman to pick a spool. | Conecte o Spoolman para escolher um carretel. |
| picker.empty | No spool matches “{q}”. | Nenhum carretel encontrado para “{q}”. |
| picker.noPresetCost | Set a filament cost in the Orca preset, or type a price here. | Defina o custo no perfil de filamento do Orca ou digite um preço aqui. |
| import.error.tooBig | That file is {size}, over the 100 MB limit. | O arquivo tem {size} e passa do limite de 100 MB. |
| import.error.notThreeMf | Pick a sliced .gcode.3mf file. | Escolha um arquivo fatiado .gcode.3mf. |
| import.error.notSliced | This file has no slice data. In OrcaSlicer use File › Export › Export all sliced file. | Este arquivo não tem dados de fatiamento. No OrcaSlicer use Arquivo › Exportar › Exportar todos os arquivos fatiados. |
| import.error.unreadable | Couldn't read this file. | Não foi possível ler o arquivo. |

### 8.4 Keys — sections and fields

| Key | en | pt-BR |
|---|---|---|
| section.machine | Machine and energy | Máquina e energia |
| section.labor | Labor | Mão de obra |
| section.extras | Extras and accessories | Extras e acessórios |
| section.shipping | Shipping | Frete |
| section.sales | Sales fee | Taxa de venda |
| section.edited | Edited | Alterado |
| section.saveDefaults | Save as defaults | Salvar como padrão |
| section.savedDefaults | Saved as defaults | Salvo como padrão |
| section.notCounted | Not counted | Não contabilizado |
| summary.machine | Energy {energy} · Machine {machine} · Failures {failure} | Energia {energy} · Máquina {machine} · Falhas {failure} |
| summary.labor | {minutes} min · {amount} | {minutes} min · {amount} |
| summary.extras_one | {n} item · {amount} | {n} item · {amount} |
| summary.extras_other | {n} items · {amount} | {n} itens · {amount} |
| summary.none | None | Nenhum |
| summary.sales | Fee {pct} + {fixed} · tax {tax} | Taxa {pct} + {fixed} · imposto {tax} |
| summary.noFees | No fees | Sem taxas |
| field.fee | Fee | Taxa |
| field.feeHelp | Percent of the sale price the platform or payment provider keeps. | Percentual do preço que a plataforma ou o meio de pagamento retém. |
| field.fixedFee | Fixed fee per sale | Taxa fixa por venda |
| field.taxHelp | Percent of the sale price paid as tax. | Percentual do preço pago como imposto. |
| field.savedForChannel | Saved for {channel} | Salvo para {channel} |
| field.watts | Average power | Potência média |
| field.printerPrice | Printer price | Preço da impressora |
| field.lifetime | Lifetime | Vida útil |
| field.savedFor | Saved for {model} | Salvo para {model} |
| field.energy | Price per kWh | Preço do kWh |
| field.energyHelp | From your electricity bill. | Da sua conta de luz. |
| field.maintenance | Maintenance | Manutenção |
| field.fixedPerHour | Fixed cost per print hour | Custo fixo por hora de impressão |
| field.fixedPerHourHelp | Rent, internet, software, split by printing hours. | Aluguel, internet e software divididos pelas horas de impressão. |
| field.failure | Failure rate | Taxa de falha |
| field.failureMode | Failure cost | Custo das falhas |
| field.failureMode.markup | Add on top of cost | Acréscimo sobre o custo |
| field.failureMode.expected_waste | Reprint lost prints | Reimpressão das peças perdidas |
| field.failureMachine | Count machine wear in failures | Incluir desgaste da máquina nas falhas |
| field.depreciation | Count printer wear | Incluir desgaste da impressora |
| field.laborRate | Labor rate | Valor da hora |
| field.laborMinutes | Hands-on time per run | Tempo de trabalho por rodada |
| field.laborMinutesHelp | Removing, cleaning and packing one run of plates. | Retirar, limpar e embalar uma rodada de placas. |
| field.setupMinutes | Setup time per order | Preparação por pedido |
| field.setupHelp | Charged once per order, spread over the quantity. | Cobrado uma vez por pedido e dividido pela quantidade. |
| field.margin | Target margin | Margem desejada |
| field.pretty | Price rounding | Arredondamento |
| pretty.none | No rounding | Sem arredondamento |
| pretty.whole | Round up to a whole amount | Arredondar para valor inteiro |
| pretty.end9 | End in 9 | Terminar em 9 |
| pretty.step5 | Steps of 5 | De 5 em 5 |
| pretty.help | Always rounds up. The step grows with the price and suits the currency. | Sempre arredonda para cima. O passo cresce com o preço e se ajusta à moeda. |
| pretty.x90 | Ends in .90 (legacy id, only if the engine still exports it) | Final ,90 |
| pretty.x99 | Ends in .99 (legacy id, only if the engine still exports it) | Final ,99 |
| pretty.rounded | Rounded: {mode} | Arredondado: {mode} |
| field.minOrder | Minimum order | Pedido mínimo |
| field.minOrderHelp | Orders below this are charged this amount. | Pedidos abaixo disso pagam este valor. |
| field.shipping | Shipping | Frete |
| shipping.none | Not included | Não incluído |
| shipping.customer | Customer pays | Cliente paga |
| shipping.absorbed | I pay | Eu pago |
| shipping.customerHelp | Added to the order total, outside your margin. | Somado ao total do pedido, fora da sua margem. |
| shipping.absorbedHelp | Part of your cost, spread over the quantity. | Entra no seu custo e é dividido pela quantidade. |
| summary.shipping.customer | Customer pays {amount} | Cliente paga {amount} |
| summary.shipping.absorbed | Included in price {amount} | Incluído no preço {amount} |
| field.shippingAmount | Amount | Valor |
| field.quantity | Quantity | Quantidade |
| field.unitsPerSet | Pieces per run | Peças por rodada |
| field.copies | Copies | Cópias |
| field.extraName | Name | Nome |
| field.extraCost | Unit cost | Custo unitário |
| field.extraQty | Quantity | Quantidade |
| field.extraPer | Applies to | Aplicar em |
| extra.per.piece | Each piece | Cada peça |
| extra.per.plate | Each plate copy | Cada cópia de placa |
| extra.per.order | Once per order | Uma vez por pedido |
| extras.add | Extra | Extra |
| extras.custom | Custom extra | Extra personalizado |
| extras.saveToCatalog | Save to catalog | Salvar no catálogo |
| extras.help | Rings, magnets, boxes, inserts. | Argolas, ímãs, caixas, insertos. |
| extras.removed | Extra removed | Extra removido |
| field.manualPrice | Price per kg | Preço por kg |
| field.editChannelFees | Edit channel fees | Editar taxas do canal |
| field.reset | Reset to default | Voltar ao padrão |
| field.notSet | Not set — counted as 0 | Não definido — conta como 0 |
| field.error.required | Enter a value. | Informe um valor. |
| field.error.number | Enter a number, like {example}. | Informe um número, como {example}. |
| field.error.min | Use {min} or more. | Use {min} ou mais. |
| field.error.max | Use {max} or less. | Use {max} ou menos. |
| field.error.decimals_one | Use at most {n} decimal. | Use no máximo {n} casa decimal. |
| field.error.decimals_other | Use at most {n} decimals. | Use no máximo {n} casas decimais. |
| field.error.noDecimals | {currency} has no decimals. Use a whole amount. | {currency} não tem centavos. Use um valor inteiro. |
| field.error.duplicateTier | Two tiers use the same quantity. | Duas faixas usam a mesma quantidade. |

### 8.5 Keys — price panel, flags, details

| Key | en | pt-BR |
|---|---|---|
| price.channel | Sales channel | Canal de venda |
| price.noPriceSuffix | — no price | — sem preço |
| price.label | Suggested price · per piece | Preço sugerido · por peça |
| price.labelIncomplete | Suggested price (incomplete) · per piece | Preço sugerido (incompleto) · por peça |
| price.orderTotal | {total} order total for {q} pieces | {total} no pedido de {q} peças |
| price.inclShipping | incl. {amount} shipping | com {amount} de frete |
| price.waiting | Waiting for OrcaSlicer… | Aguardando o OrcaSlicer… |
| price.noPlates | No plates yet. The price appears after slicing. | Nenhuma placa ainda. O preço aparece depois do fatiamento. |
| price.includeOne | Include at least one plate. | Inclua pelo menos uma placa. |
| price.fixField | Fix the highlighted field to see a price. | Corrija o campo destacado para ver o preço. |
| price.engineRange | A number is too large to calculate. Check quantities and prices. | Um número é grande demais para o cálculo. Confira quantidades e preços. |
| price.materialConflict | Same filament with two prices. Pick one spool. | O mesmo filamento com dois preços. Escolha um carretel. |
| price.impossibleTitle | No price works on {channel} | Nenhum preço funciona em {channel} |
| price.impossibleBody | Fees, tax and your target margin add up to 100% or more. Lower the target margin or the channel fees. | Taxas, imposto e margem desejada somam 100% ou mais. Reduza a margem ou as taxas do canal. |
| price.lowerMargin | Lower target margin | Reduzir a margem |
| price.searchBound | This channel's fee steps are too complex to price. Simplify its fee steps. | As faixas de taxa deste canal são complexas demais. Simplifique as faixas. |
| price.channelInvalid | This channel's fees are invalid. Fix them in settings. | As taxas deste canal são inválidas. Corrija nos ajustes. |
| tile.profit | Profit per piece | Lucro por peça |
| tile.orderProfit | {amount} on the order | {amount} no pedido |
| tile.perHour | {amount}/print hour | {amount}/hora de impressão |
| tile.margin | Margin | Margem |
| tile.breakEven | Break-even {amount} | Empate em {amount} |
| flag.belowBreakEven | Below break-even on {channel}: each piece loses {amount}. | Abaixo do empate em {channel}: cada peça perde {amount}. |
| flag.deadZone | Raised to {price}: between {from} and {until} {channel}'s next fee step leaves you less. | Subiu para {price}: entre {from} e {until} a próxima faixa de taxa de {channel} rende menos. |
| flag.orderBelowBreakEven | The order loses {amount} once setup and order costs are counted. | O pedido perde {amount} quando entram a preparação e os custos do pedido. |
| flag.belowTarget | Margin {margin} is under your {target} target after discount or minimum. | A margem de {margin} fica abaixo da meta de {target} depois do desconto ou do mínimo. |
| flag.minimum | Price per piece raised so the order reaches the {amount} minimum. | Preço por peça aumentado para o pedido chegar ao mínimo de {amount}. |
| flag.discount | {pct} volume discount from {q} pieces. | Desconto de {pct} a partir de {q} peças. |
| price.overflow | The order is too large to calculate. Lower the quantity. | O pedido é grande demais para o cálculo. Reduza a quantidade. |
| flag.stale | Based on plates that may be out of date. | Baseado em placas que podem estar desatualizadas. |
| flag.presetPrices | Filament prices come from Orca presets. | Os preços de filamento vêm dos perfis do Orca. |
| flag.slotNoPrice | Slot {n} ({preset}) has no price, counted as 0. | O slot {n} ({preset}) está sem preço e conta como 0. |
| flag.pickSpool | Pick spool | Escolher carretel |
| flag.notCounted | Not counted yet: {items}. | Ainda não contabilizado: {items}. |
| flag.set | Set | Definir |
| flag.channelSkipped | {channel} was skipped: its fees are invalid. | {channel} ficou de fora: as taxas estão inválidas. |
| flag.fieldInvalid | A field has an error; using its last valid value. | Um campo tem erro; usando o último valor válido. |
| flag.srBad | Warning: | Atenção: |
| flag.srInfo | Note: | Observação: |
| notCounted.energy | energy | energia |
| notCounted.labor | labor | mão de obra |
| notCounted.wear | printer wear | desgaste da impressora |
| notCounted.time | print time of plate {n} | tempo de impressão da placa {n} |
| notCounted.grams | filament weight of slot {slot} on plate {n} | peso do filamento do slot {slot} na placa {n} |
| breakdown.title | Where the price goes | Para onde vai o preço |
| line.filament | Filament | Filamento |
| line.energy | Energy | Energia |
| line.depreciation | Printer wear | Desgaste da impressora |
| line.maintenance | Maintenance | Manutenção |
| line.failure | Failures | Falhas |
| line.labor | Labor | Mão de obra |
| line.fixed | Fixed costs | Custos fixos |
| line.extras | Extras | Extras |
| line.setup | Setup | Preparação |
| line.orderExtras | Order extras | Extras do pedido |
| line.shipping | Shipping | Frete |
| line.fees | Channel fees | Taxas do canal |
| line.tax | Tax | Imposto |
| line.profit | Profit | Lucro |
| line.costTotal | Cost per piece | Custo por peça |
| compare.title | Compare channels | Comparar canais |
| compare.channel | Channel | Canal |
| compare.price | Price | Preço |
| compare.fees | Fees | Taxas |
| compare.net | Net | Líquido |
| compare.profit | Profit | Lucro |
| compare.margin | Margin | Margem |
| compare.breakEven | Break-even | Empate |
| compare.feeStep | Fee step: {from}–{until} earns less | Faixa de taxa: {from}–{until} rende menos |
| compare.selected | selected | selecionado |
| compare.caption | Price and profit per piece on each channel | Preço e lucro por peça em cada canal |
| batch.title | Batch pricing | Preço por lote |
| batch.quantity | Quantity | Quantidade |
| batch.discount | Discount | Desconto |
| batch.unitCost | Unit cost | Custo unitário |
| batch.unitPrice | Unit price | Preço unitário |
| batch.orderTotal | Order total | Total do pedido |
| batch.orderProfit | Order profit | Lucro do pedido |
| batch.current | current | atual |
| batch.nominal | tier {pct} | faixa de {pct} |
| batch.loss | loss | prejuízo |
| price.spare_one | {n} spare piece | {n} peça a mais |
| price.spare_other | {n} spare pieces | {n} peças a mais |
| price.spareWhy | One run makes {set} pieces, so this order prints {n} extra. They are charged to the order. | Uma rodada rende {set} peças, então este pedido imprime {n} a mais. Elas entram no custo do pedido. |
| batch.caption | Price at each discount tier on {channel} | Preço em cada faixa de desconto em {channel} |
| tier.from | From quantity | A partir de |
| tier.discount | Discount | Desconto |
| tier.add | Discount tier | Faixa de desconto |
| tier.removed | Discount tier removed | Faixa de desconto removida |
| bar.details | Details | Detalhes |

### 8.6 Keys — quotes, sheet, export

| Key | en | pt-BR |
|---|---|---|
| quote.save | Save quote | Salvar orçamento |
| quote.saveChanges | Save changes | Salvar alterações |
| quote.saveAsNew | Save as new | Salvar como novo |
| quote.savedAs | Saved as {no} | Salvo como {no} |
| quote.saved | Quote {no} saved | Orçamento {no} salvo |
| quote.print | Print quote | Imprimir orçamento |
| quote.csv | CSV | CSV |
| quote.title | Title | Título |
| quote.customer | Customer | Cliente |
| quote.addCustomer | Customer | Cliente |
| quote.note | Note for the customer | Observação para o cliente |
| quote.blockedNoPrice | No price to export yet. | Ainda não há preço para exportar. |
| quote.blockedIncomplete | Price every filament before sending a quote. | Defina o preço de todos os filamentos antes de enviar um orçamento. |
| quote.openBanner | Quote {no} · saved {date}. Plates and prices are as saved. | Orçamento {no} · salvo em {date}. Placas e preços como foram salvos. |
| quote.useCurrent | Use current slice | Usar fatiamento atual |
| quote.close | Close quote | Fechar orçamento |
| quote.deleted | Quote {no} deleted | Orçamento {no} apagado |
| quote.duplicated | Copied as {no} | Copiado como {no} |
| quotes.title | Quotes | Orçamentos |
| quotes.count_one | {n} quote | {n} orçamento |
| quotes.count_other | {n} quotes | {n} orçamentos |
| quotes.search | Search quotes | Buscar orçamentos |
| quotes.noMatch | No quote matches “{q}”. | Nenhum orçamento encontrado para “{q}”. |
| quotes.col.no | No. | Nº |
| quotes.col.title | Title | Título |
| quotes.col.customer | Customer | Cliente |
| quotes.col.date | Date | Data |
| quotes.col.qty | Qty | Qtd. |
| quotes.col.channel | Channel | Canal |
| quotes.col.total | Total | Total |
| quotes.col.margin | Margin | Margem |
| quotes.open | Open | Abrir |
| quotes.more | More actions for {no} | Mais ações para {no} |
| quotes.duplicate | Duplicate | Duplicar |
| quotes.delete | Delete | Apagar |
| sheet.back | Back | Voltar |
| sheet.itemized | Itemized | Detalhado |
| sheet.summary | Summary | Resumido |
| sheet.printPdf | Print or save PDF | Imprimir ou salvar PDF |
| sheet.saveHtml | Save HTML | Salvar HTML |
| sheet.quote | Quote {no} | Orçamento {no} |
| sheet.draft | Draft | Rascunho |
| sheet.date | Date | Data |
| sheet.validUntil | Valid until | Válido até |
| sheet.for | For | Para |
| sheet.item | Item | Item |
| sheet.qty | Qty | Qtd. |
| sheet.unitPrice | Unit price | Preço unitário |
| sheet.amount | Amount | Valor |
| sheet.subtotal | Subtotal | Subtotal |
| sheet.shipping | Shipping | Frete |
| sheet.discountNote | Includes a {pct} volume discount. | Inclui desconto de {pct} por volume. |
| sheet.total | Total | Total |
| sheet.made | Made with Orca Print Calculator | Feito com Orca Print Calculator |
| sheet.staleWarning | Plates may be out of date. Check before sending. Not printed. | As placas podem estar desatualizadas. Confira antes de enviar. Não sai na impressão. |
| export.saved | Saved to {path} | Salvo em {path} |
| export.copyPath | Copy path | Copiar caminho |
| export.copied | Path copied | Caminho copiado |
| export.failed | Couldn't save the file. | Não foi possível salvar o arquivo. |
| empty.plate.title | Slice to see a price | Fatie para ver o preço |
| empty.plate.body | Slice the project in OrcaSlicer. Each plate shows up here with its time, filament and cost. | Fatie o projeto no OrcaSlicer. Cada placa aparece aqui com tempo, filamento e custo. |
| empty.project.title | Open a project to price it | Abra um projeto para precificar |
| empty.quote.title | No saved quotes | Nenhum orçamento salvo |
| empty.quote.body | Save a quote from the calculator to send it or reopen it later. | Salve um orçamento na calculadora para enviar ou reabrir depois. |
| empty.quote.action | Go to calculator | Ir para a calculadora |
| empty.spool.title | Spoolman not connected | Spoolman não conectado |
| empty.spool.body | Connect Spoolman to price filament from your real spools. | Conecte o Spoolman para usar o preço dos seus carretéis. |

### 8.7 Keys — settings, first run, errors, a11y

| Key | en | pt-BR |
|---|---|---|
| settings.title | Settings | Ajustes |
| settings.saved | Saved | Salvo |
| settings.saveFailed | Couldn't save. | Não foi possível salvar. |
| settings.retry | Retry | Tentar de novo |
| settings.group.spoolman | Spoolman | Spoolman |
| settings.group.costs | Costs | Custos |
| settings.group.pricing | Pricing | Preço |
| settings.group.channels | Sales channels | Canais de venda |
| settings.group.printers | Printers | Impressoras |
| settings.group.sheet | Quote sheet | Folha de orçamento |
| settings.group.language | Language and currency | Idioma e moeda |
| settings.group.about | About | Sobre |
| settings.costsHelp | Every new quote starts from these values. | Todo orçamento novo começa com estes valores. |
| spoolman.url | Spoolman address | Endereço do Spoolman |
| spoolman.test | Test connection | Testar conexão |
| spoolman.testing | Testing… | Testando… |
| spoolman.connected | Connected. {spools} spools, {filaments} filaments, currency {currency}. | Conectado. {spools} carretéis, {filaments} filamentos, moeda {currency}. |
| spoolman.spoolerHint | Spooler uses {url}. | O Spooler usa {url}. |
| spoolman.useIt | Use it | Usar |
| spoolman.promptPending | OrcaSlicer is asking for permission to reach {host}. Allow it in the dialog. | O OrcaSlicer está pedindo permissão para acessar {host}. Permita na janela. |
| spoolman.offlineAlert | Spoolman isn't responding at {url}. Filament uses Orca preset prices until it's back. | O Spoolman não responde em {url}. O filamento usa o preço dos perfis do Orca até ele voltar. |
| spoolman.error.scheme | Start the address with http:// or https://. | Comece o endereço com http:// ou https://. |
| spoolman.error.bad_url | That address isn't valid. | Esse endereço não é válido. |
| spoolman.error.timeout | Spoolman took too long to answer. | O Spoolman demorou demais para responder. |
| spoolman.error.unreachable | Can't reach Spoolman at that address. | Não foi possível acessar o Spoolman nesse endereço. |
| spoolman.error.http | Spoolman answered with error {status}. | O Spoolman respondeu com erro {status}. |
| spoolman.error.bad_json | That address answered, but it isn't Spoolman. | O endereço respondeu, mas não é o Spoolman. |
| spoolman.error.denied | Access was not allowed in OrcaSlicer. Save the address again to get the prompt. | O acesso não foi permitido no OrcaSlicer. Salve o endereço de novo para ver o pedido. |
| spoolman.error.unknown | Spoolman failed: {detail} | Falha no Spoolman: {detail} |
| pricing.defaultTiers | Default discount tiers | Faixas de desconto padrão |
| channel.compare | Compare {name} | Comparar {name} |
| channel.default | Default channel | Canal padrão |
| channel.feeSummary | {pct} + {fixed} | {pct} + {fixed} |
| channel.steps | {n} fee steps | {n} faixas de taxa |
| channel.edit | Edit {name} | Editar {name} |
| channel.delete | Delete {name} | Apagar {name} |
| channel.deleted | {name} deleted | {name} apagado |
| channel.add | Channel | Canal |
| channel.newName | My channel | Meu canal |
| channel.directName | Direct | Venda direta |
| channel.addTiers | Price tiers | Faixas de preço |
| channel.tiersHelp | Use when the fee changes with the sale price. | Use quando a taxa muda conforme o preço de venda. |
| channel.addTier | Price tier | Faixa de preço |
| channel.fixFees | Fix fees | Corrigir taxas |
| channel.addStep | Fee step | Faixa de taxa |
| field.name | Name | Nome |
| field.tax | Tax | Imposto |
| field.tierFrom | From price | A partir de |
| channel.def.name_empty | Give the channel a name. | Dê um nome ao canal. |
| channel.def.no_tiers | Add at least one fee step. | Adicione pelo menos uma faixa de taxa. |
| channel.def.too_many_tiers | Use {max} fee steps or fewer. | Use no máximo {max} faixas de taxa. |
| channel.def.not_natural | Use whole, positive values. | Use valores positivos. |
| channel.def.first_tier_not_zero | The first step must start at 0. | A primeira faixa precisa começar em 0. |
| channel.def.tiers_not_ascending | Each step must start above the previous one. | Cada faixa precisa começar acima da anterior. |
| channel.def.pct_plus_tax_too_high | Fee plus tax can't pass 90%. | Taxa mais imposto não pode passar de 90%. |
| channel.def.rates_missing | Enter this channel's fees. | Informe as taxas deste canal. |
| channel.def.duplicate_id | Two channels share an id. Delete one and add it again. | Dois canais têm o mesmo id. Apague um e adicione de novo. |
| channel.def.currency_mismatch | This channel's fixed fees are in another currency. | As taxas fixas deste canal estão em outra moeda. |
| printers.model | Printer model | Modelo |
| printers.suggested | Suggested | Sugerido |
| printers.current | Current | Atual |
| printers.help | Smart-plug kWh ÷ print hours × 1000 gives your printer's real average power. | kWh da tomada inteligente ÷ horas de impressão × 1000 dá a potência média real da impressora. |
| printers.removed | {model} removed | {model} removido |
| printers.empty | Printers show up here after you slice with them. | As impressoras aparecem aqui depois do primeiro fatiamento. |
| catalog.add | Catalog item | Item do catálogo |
| catalog.removed | {name} removed | {name} removido |
| catalog.empty | Save extras you use often, like rings or boxes. | Salve os extras que você usa sempre, como argolas ou caixas. |
| sheet.shopName | Shop name | Nome da loja |
| sheet.footer | Footer note | Rodapé |
| sheet.footerHelp | Payment terms, contact, lead time. | Condições de pagamento, contato, prazo. |
| sheet.validity | Valid for | Validade |
| sheet.validityUnit | days | dias |
| sheet.validityHelp | 0 hides the date. | 0 esconde a data. |
| sheet.nextNo | Next quote number | Próximo número de orçamento |
| currency.label | Currency | Moeda |
| currency.fromSpoolman | {currency} from Spoolman | {currency} do Spoolman |
| currency.invalid | Use a 3-letter currency code, like USD or BRL. | Use o código de 3 letras da moeda, como USD ou BRL. |
| currency.mismatch | Defaults were entered in {old}. Check money values. | Os padrões foram definidos em {old}. Confira os valores. |
| currency.fine | They're fine | Estão certos |
| about.version | Version {v} | Versão {v} |
| about.resetAll | Reset all settings | Restaurar todos os ajustes |
| about.resetConfirm | Click again to reset | Clique de novo para restaurar |
| about.resetDone | Settings reset | Ajustes restaurados |
| setup.title | Set up once | Configure uma vez |
| setup.filament | Filament prices | Preço do filamento |
| setup.permission | When you enabled the plugin, OrcaSlicer granted it read access to its temporary slicing folder. That's how plate times and grams arrive. Nothing leaves your computer. | Ao ativar o plugin, o OrcaSlicer liberou a leitura da pasta temporária de fatiamento. É assim que chegam o tempo e os gramas de cada placa. Nada sai do seu computador. |
| setup.spoolerFound | Spooler uses Spoolman at {url}. | O Spooler usa o Spoolman em {url}. |
| setup.useSpoolman | Use this Spoolman | Usar este Spoolman |
| setup.connect | Connect | Conectar |
| setup.skip | Skip, use preset prices | Pular e usar o preço dos perfis |
| setup.energy | Energy price | Preço da energia |
| setup.time | Your time | Seu tempo |
| setup.done | Done | Concluir |
| setup.edit | Edit | Editar |
| host.errorTitle | Couldn't reach OrcaSlicer | Não foi possível falar com o OrcaSlicer |
| host.errorBody | The plugin tab lost its connection to OrcaSlicer. Reopen the tab, or restart OrcaSlicer if this repeats. | A aba do plugin perdeu a conexão com o OrcaSlicer. Reabra a aba ou reinicie o OrcaSlicer se isso se repetir. |
| host.tryAgain | Try again | Tentar de novo |
| host.details | Details | Detalhes |
| host.cmdFailed | {action} failed. | {action} falhou. |
| common.undo | Undo | Desfazer |
| common.close | Close | Fechar |
| common.remove | Remove | Remover |
| common.resetDone | Reset to default | Voltou ao padrão |
| a11y.resetTo | Reset {label} to default ({value}) | Voltar {label} ao padrão ({value}) |
| a11y.decrease | Decrease {label} | Diminuir {label} |
| a11y.increase | Increase {label} | Aumentar {label} |
| a11y.priceAnnounce | Suggested price {price}, margin {margin}, on {channel} | Preço sugerido {price}, margem {margin}, em {channel} |
| a11y.chip | {preset}, {grams}, price source {source} | {preset}, {grams}, origem do preço {source} |
| a11y.costPrefix | Cost | Custo |
| a11y.plates | Plates and costs | Placas e custos |
| a11y.edited | Edited | Alterado |
| a11y.colorUnknown | color unknown | cor desconhecida |
| a11y.unknown | unknown | desconhecido |

Quote-engine problem codes map to field errors (`path` prefix → field): `not_integer`, `negative` →
`field.error.number`; `quantity_min` → `field.error.min` (min 1); `units_per_set_min`, `copies_min` →
`field.error.min`; `discount_range` → `field.error.max` (99%); `digits_range` → `currency.invalid`;
`invalid_option` → `field.error.required`; `no_plates` → `price.includeOne`; `material_price_conflict` →
`price.materialConflict`; `engine_range` → `price.engineRange`; `overflow` (path `quantity`) →
`price.overflow` + `field.error.max` on Quantity. Channel problems: `margin_impossible` →
`price.impossibleTitle/Body`; `search_bound_exceeded` → `price.searchBound`; `channel_invalid` →
`price.channelInvalid`; `overflow` → `price.overflow`. Host Spoolman error codes → `spoolman.error.*` (unknown → `.unknown`).

---

## 9. Quote export

### 9.1 What the customer sees, and what they never see

Customer sheet shows: shop name (or nothing if empty; never "Orca Print Calculator" as a shop name), quote number
(or "Draft"), date, valid-until (if validity > 0), customer name (if set), title, items, subtotal, shipping
charged to the customer, volume-discount note, total, customer note, footer note,
"Made with Orca Print Calculator" (sm muted).

**Never on the customer sheet:** any cost line (filament, energy, wear, maintenance, failures, labor, fixed,
extras cost, setup), unit cost, fees, tax amount, net, profit, margin, break-even, dead zones, channel name,
spool/filament ids or prices, grams, print time, printer, absorbed shipping. T4.7 builds the sheet from an
explicit whitelist object (`SheetModel`), never by hiding fields of the internal result with CSS.

### 9.2 Layout (A4 and Letter, 720px on screen)

```
┌──────────────────────────────────────────────────────────────┐
│ Studio Layer                                  Quote nº 0042  │  shop lg 600 · number muted
│                                     Date 10 Nov 2026         │
│ For  Ana Souza                      Valid until 25 Nov 2026  │
│ ═════════════════════ (2px rule #00675B) ════════════════════│
│ Desk organizer                                               │  title lg 500
│ Item                               Qty   Unit price   Amount │  (summary mode)
│ Desk organizer                      10      R$ 48,90  R$ 489,00
│ ──────────────────────────────────────────────────────────── │
│ Subtotal                                          R$ 489,00  │
│ Shipping                                           R$ 25,00  │
│ Includes a 10% volume discount.                              │  sm muted
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Total                                         R$ 514,00  │ │  total row: 1px #2B2B2B border, 20px 600, #8A5800
│ └──────────────────────────────────────────────────────────┘ │
│ Note: …                                                      │
│ Footer note …                                                │
│ Made with Orca Print Calculator                              │
└──────────────────────────────────────────────────────────────┘
```

- **Summary mode** (default): one line: title, quantity, unit price (`selected.price`), amount (`price × q`).
- **Itemized mode**: one line per included plate (`Plate n — name` or plate name, `× copies` when > 1) with
  amount only; amounts are the goods total (`price × q`) split by `PlateRow.totalMinor` share, largest-remainder
  rounding so lines sum exactly to the goods total. Quantity is stated once under the title ("{q} pieces").
  Extras get no lines of their own; their cost is already inside the plate shares.
- Then subtotal (= `orderTotal` = `price × q`; the engine folds the minimum order into the per-piece price, so
  there is no adjustment line), shipping line if `shippingCharged > 0`, discount note if `flags.discounted`
  using `effectiveDiscountBp`, total = `grandTotal`.
- The total is the sheet's single price-coloured number (`#8A5800` on white). Sheet is always light: it is paper.
- Print CSS (`@media print`): hide everything except `.quote-sheet`; `@page { margin: 16mm }`; no backgrounds
  except the total border; black text `#000` except the total; font = host font; 11pt body.
- Save HTML: `quoteExport.ts` renders the same `SheetModel` into a standalone HTML string (inline `<style>`, no
  scripts, all text HTML-escaped — Spoolman and preset strings are untrusted) and calls `export_file {name:
  "quote-0042.html", text}`. Toast `export.saved` with the returned path + "Copy path" (Clipboard API with
  `document.execCommand("copy")` fallback). The page never opens the file (spike §8: `window.open` replaces the tab).

### 9.3 CSV (internal, `quote-0042.csv`)

UTF-8 with BOM (spreadsheets detect it), comma separator, CRLF, RFC 4180 quoting, `.` decimal, no grouping, no
currency symbol, amounts in major units with `digits` decimals, ISO 8601 dates. One header row then one row per
line:

`quote_no,date,customer,title,currency,channel,quantity,kind,item,per_piece,per_order`

| kind | item | per_piece | per_order |
|---|---|---|---|
| `plate` | plate label (one row per included plate) | unit cost of the plate | `totalMinor × runs` |
| `cost` | each `QuoteLine.id` label in the export language | `perPiece` | `perOrder` |
| `cost_total` | Cost per piece | `unitCostAtQuantity` | `orderCost` |
| `fee` | Channel fees | fee excl. tax | × q |
| `tax` | Tax | tax | × q |
| `price` | Unit price | `price` | `orderTotal` |
| `shipping` | Shipping charged | — | `shippingCharged` |
| `total` | Total | — | `grandTotal` |
| `profit` | Profit | `profit` | `orderProfit` |
| `margin` | Margin | percent with 1 decimal, no `%` | — |

Formula-injection guard: any text cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`.

---

## 10. File plan and ownership

T4.2 lands first; T4.3–T4.7 then run in parallel and edit only the files they own. Shared files have one owner;
other tasks request changes through the lead, except the reserved regions below.

| Path (`ui/src/…`) | Owner | Notes |
|---|---|---|
| `theme.css` | T4.2 | tokens §4, base classes §4.5, print hiding hook `.app-chrome` |
| `i18n.ts` | T4.2 | all keys §8; reserved regions `// region T4.3` … `// region T4.7` inside both `en` and `ptBR` objects for keys a task discovers it needs |
| `format.ts` | T4.2 | `money`, `moneyPlain` (field text), `perUnit`, `percent`, `duration`, `grams`, `watts`, `date`, `quoteNo`, `count` per §8.1 |
| `bridge.ts`, `mock/fixtures.ts`, `mock/scenarios.ts` | T4.2 | mock host with every `?state=` from §6 (`ok`, `loading`, `hostError`, `empty`, `stale`, `noSpoolman`, `offline`, `unmatched`, `impossible`, `savedQuote`, `firstRun`, `narrow` = ok data, `unknown` = one plate with `seconds: null` and one slot with
`grams: null` as from Bambu-vendor G-code, `imported` = plates with `source: "file"`; mock `import_sliced` errors
by file name: `plain.3mf` → `no_slice_info`, `x.zip` → `not_zip`) plus `?theme=dark|light` and `?lang=` |
| `state/types.ts`, `state/store.ts`, `state/derive.ts`, `state/toast.ts` | T4.2 | §5.1; store actions region `// region T4.x actions` per task for small additions |
| `App.vue`, `views/CalculatorView.vue` | T4.2 | shell, grid §3, view switch, skip link, live region, PriceBar placement, preview sub-state switch |
| `components/base/*` (`Icon.vue`, `icons.ts`, `NumberField.vue`, `MoneyField.vue`, `PercentField.vue`, `Stepper.vue`, `Section.vue`, `Segmented.vue`, `Badge.vue`, `InlineAlert.vue`, `ToastHost.vue`, `EmptyState.vue`, `Popover.vue`, `ResetButton.vue`) | T4.2 | §5.2 |
| Stub files for every component below (typed props, `<div data-stub>` body) | T4.2 | so imports resolve; owners replace the body. T4.9 fails any remaining `data-stub` |
| `components/plates/PlateList.vue`, `PlateCard.vue`, `FilamentChip.vue`, `MaterialRow.vue`, `SpoolPicker.vue`, `ImportButton.vue` | T4.3 | |
| `components/AppHeader.vue`, `PrinterChip.vue`, `SpoolmanStatus.vue` | T4.4 | |
| `components/costs/MachineSection.vue`, `LaborSection.vue`, `ExtrasSection.vue`, `ExtrasEditor.vue`, `ShippingSection.vue`, `SalesSection.vue` | T4.4 | |
| `components/price/PricePanel.vue`, `OrderControls.vue`, `ChannelSelect.vue`, `PriceFlags.vue`, `BreakdownBars.vue`, `ChannelComparison.vue`, `BatchTable.vue`, `DiscountTierEditor.vue`, `PriceBar.vue` | T4.5 | `DiscountTierEditor` is reused by T4.6 |
| `views/SettingsView.vue`, `components/settings/SpoolmanSettings.vue`, `CostDefaults.vue`, `PricingDefaults.vue`, `ChannelEditor.vue`, `ChannelTierRows.vue`, `PrinterProfiles.vue`, `ExtrasCatalog.vue`, `SheetSettings.vue`, `LanguageCurrency.vue`, `AboutSettings.vue`, `components/FirstRunChecklist.vue` | T4.6 | |
| `views/QuotesView.vue`, `components/quotes/QuoteActions.vue`, `QuotePreview.vue`, `QuoteSheet.vue`, `quoteExport.ts` (SheetModel, HTML, CSV) | T4.7 | `quoteExport.ts` gets vitest tests (CSV quoting, injection guard, largest-remainder split) |
| Motion tokens and transitions | T4.8 | edits `theme.css` motion section only, plus component `<style>` transition lines |

Component-level CSS lives in each component's `<style scoped>` using only `--opc-*` tokens; no raw hex outside
`theme.css` and `QuoteSheet` (paper palette).

---

## 11. Acceptance checklist (T4.9)

Run in the dev harness at 900, 1100, 1440, 1920 wide (and 760 for N), both `data-orca-theme` values, en and
pt-BR, keyboard only for one full pass.

**Job and hierarchy**
- [ ] `?state=ok`: from load to readable price ≤ 5 s with zero typing; the price is the largest, only amber text.
- [ ] Exactly one element uses `--opc-price` per screen (Calculator, preview sheet total; Quotes and Settings: none). At N, PriceBar and in-flow hero are never visible together.
- [ ] No card-in-card, no gradient, no emoji, no shadow except popovers/toasts, no webfont request.
- [ ] Every collapsed section header shows its cost summary; no section needs opening to audit the price.

**States** (each reachable via `?state=`)
- [ ] loading, hostError, empty (no project + nothing sliced), stale, noSpoolman, offline, unmatched, impossible, savedQuote, firstRun render as §6, including the price-panel sentence. No `0`, `NaN`, `undefined`, `null` or empty price anywhere.
- [ ] Unmatched / not-counted inputs are named in PriceFlags; export replaced by the reason line, no disabled buttons.
- [ ] Impossible margin shows the sentence and the two actions; comparison still lists working channels.

**Tokens and theme**
- [ ] Toggling `data-orca-theme` repaints without reload; nothing uses `prefers-color-scheme`.
- [ ] With host vars removed, fallbacks render; with `color-mix` unsupported (test: rename the `@supports` condition), surfaces still differ from bg.
- [ ] Measured contrast: body, muted, accent text, warn, bad, price ≥ 4.5:1 on bg and raised, both themes; primary button label ≥ 4.5:1. Host `--orca-muted` checked once in Orca (T5.1).
- [ ] Focus ring visible on every interactive element, both themes.

**Layout**
- [ ] `document.documentElement.scrollWidth - innerWidth === 0` at 760, 900, 1100, 1440, 1920 with the 3-plate fixture and the longest pt-BR strings.
- [ ] Column widths and plate grid columns match §3.1; independent scrolling at ≥ 900 with height ≥ 720; whole-column scroll below 720.
- [ ] All numbers tabular; table numbers right-aligned.

**Interaction**
- [ ] Price updates while typing; invalid text never changes the price; errors appear on blur/800 ms; reformat on blur.
- [ ] pt-BR `1.234,5` and en `1,234.5` both parse; JPY (0 digits) and KWD (3 digits) fixtures format correctly.
- [ ] Arrow/Shift/Alt/PageUp steps work; wheel does nothing.
- [ ] Override dot + reset on every overridable field; reset has undo; "Save as defaults" works.
- [ ] Every delete has an undo toast that restores the object at its index.
- [ ] Settings auto-save with "Saved" status; no Save button in Settings.
- [ ] Saved quote reopens with identical price, margin and totals after reload (mock persists to memory).

**Keyboard and screen reader**
- [ ] Skip link first; focus order §7.7; Escape closes every popover and returns focus.
- [ ] Segmented controls use arrows; listbox in SpoolPicker uses arrows/Enter/Home/End.
- [ ] Live region announces price changes once per settle (VoiceOver check), not per keystroke.
- [ ] All icon buttons have labels; badges are text; colour is never the only signal.

**Export**
- [ ] Customer sheet contains none of the §9.1 forbidden fields (inspect DOM text and saved HTML).
- [ ] Itemized amounts sum exactly to the goods total; print preview (browser print) shows only the sheet.
- [ ] CSV opens in a spreadsheet with correct columns; a customer named `=SUM(A1)` is neutralised; text escaping in HTML export verified with `<script>` in a preset name.

**Copy and code hygiene**
- [ ] Every visible string comes from `i18n.ts`; pt-BR has no English leftovers; sentence case; no exclamation marks.
- [ ] No banned features from §7.10 in source (grep `:has(`, `@container`, `structuredClone`, `.at(`, `dvh`, `<dialog`, `inert`, `aspect-ratio`, `accent-color`).
- [ ] No `data-stub`, no `TODO`, no imports of `engine/cost.ts`.
- [ ] No marketplace names, presets, rate sources or "as of" dates anywhere in the UI or bundle (grep `Mercado`, `Shopee`, `Etsy`, `unverified`). Fresh settings = one "Direct" channel; channel select and comparison absent until a 2nd channel exists; comparison collapsed by default.
- [ ] First run: Sales fee section open with Fee %, Fixed fee per sale, Tax %; edits there change the channel in Settings.
- [ ] `?state=ok` with unitsPerSet 4 and quantity 10 shows "2 spare pieces" under Quantity.
- [ ] Batch table shows effective discount, nominal tier as a second line when different; loss rows in bad colour; discount below break-even is allowed and flagged.
- [ ] Minimum order fixture shows `flag.minimum` and a per-piece price raised through fees; no adjustment line on the sheet.
- [ ] Money field with `1,234` in pt-BR at 2 digits → "Use at most 2 decimals."; JPY `12.5` → no-decimals message.
- [ ] Rounding options come from `PRETTY_MODES`; no hard-coded mode list in components.
- [ ] No `<a href>`, `target="_blank"`, `window.open` or `location` assignment in `ui/src` (grep).
- [ ] Unknown host values (`seconds`/`grams` null fixture, Bambu fixture) render "—" and a not-counted flag, never `0`.
- [ ] Import: non-.3mf, > 100 MB, plain project .3mf (no slice data) each give their own message; progress bar moves while reading; cancel works; current plates survive a failed import.
- [ ] Stale wording says "may be"; every plate card shows "sliced {time}"; first-run checklist shows the permission line.
- [ ] Bundle (single file) ≤ 250 KB.
- [ ] `impeccable detect --json ui/src` triaged.

---

## 12. Assumptions and plan deltas

1. **Import bridge** (spike §9, confirmed by lead): `import_sliced {name, b64}`. The host returns `{plates[]}` or
   an error code `not_zip` | `no_slice_info` | `too_big` | other; the UI maps them (§5.3 ImportButton). Imported
   plates carry `source: "file"`, `fileName`, `slicedAt: null`.
2. **Opening exports**: `window.open` replaces the tab (spike §8). UI saves files and shows the path; PDF goes
   through `window.print()`. No "open file" button.
3. **Stale is all-or-nothing**: the host cannot tell which plate changed (spike §6), so every plate goes stale
   together; unsaved setting edits fire nothing. Copy says "may be out of date" for that reason.
4. **HostPlate shape** (§5.1) is assumed: per-slot `grams` (nullable), `color`, `preset`, `costPerKg`, `notes`,
   `material`, plate `seconds` (nullable), `thumb` as a data URI, `stale`, `name`, `slicedAt` (ISO, set by the
   host at capture), `source`, `fileName`. T3.4/T5.1 must emit it; for Bambu presets `printerModel` must come
   from presets on the UI thread (the config block is beyond the 4 KB head, spike §4).
5. **Spoolman errors**: host returns a code (`scheme`, `bad_url`, `timeout`, `unreachable`, `http_<status>`,
   `bad_json`, `denied`) not prose, so copy can be localised.
6. **Manual price per kg** is a UI-layer rule (`manualPrices`, source `manual`) applied after `matchSlot`; `match.ts`
   has no such source. Fine as-is; flag if T2.6 wants it in the engine.
7. **Printer profile** stores price and lifetime with the watts (depreciation is per machine); the plan only named
   watts.
8. **No marketplace presets (owner decision).** The UI seeds one "Direct" channel itself and never calls
   `channelsForCurrency` / `DEFAULT_CHANNELS`. `channels.ts` still ships Mercado Livre, Shopee and Etsy presets
   with sources and "unverified" notes; T2.5 should delete them (and the `structuredClone` call, Safari 15.4) so
   nothing marketplace-named reaches the bundle. `rates_missing` / `asOf: "needs-rates"` then become dead code.
   Brand listing image 3 (`brand/listing-3.png`, captions "Etsy", "Mercado Livre", "Shopee") and README/hub copy
   must be regenerated with user-named channels (T6.3, T0.3).
12. **Spare pieces**: the UI reads `QuoteOk.sparePieces` (owner decision #4). The committed `quote.ts` exposes
    `piecesPrinted` and `runs` but not `sparePieces` yet; until it lands, derive.ts uses
    `piecesPrinted − quantity`. Remove the fallback when the field exists.
13. **Pretty modes are moving** (owner decision #5): the committed engine still has `none | x.90 | x.99 | whole |
    step5`; expected final ids are about `none | whole | end9 | step5` with scaling by currency and price size.
    The UI must not hard-code the list: options = `PRETTY_MODES` in engine order, label `pretty.<id>` with `.`
    stripped (`x.90` → `pretty.x90`), helper `pretty.help`; if the engine exports a rule-table comment or a
    `PRETTY_DEFAULT`, T4.4 labels and defaults from it. Default mode: `PRETTY_DEFAULT` if exported, else `whole`.
14. **Money decimals are rejected, not rounded** (`parseMoney` returns null for extra fraction digits). The UI
    tells the two failures apart in `format.ts`: `moneyError(text, digits, locale)` = `null` if `parseMoney`
    succeeds; `"decimals"` if `parseMoney(text, 9, locale)` succeeds (too many decimals); else `"number"`.
    Energy price uses `digits + 2` (it goes through `kwhE4`).
9. **Safari floor**: the plan says target `safari14`; flex `gap` needs 14.1. If Orca 2.5's macOS minimum is 11.3+
   (Safari 14.1), keep as is; otherwise layouts already avoid flex gap where it matters.
10. **Amber in the comparison mock** (`brand/listing-3.png`) shows the selected channel price in amber. On the
    calculator that would be a second amber number beside the hero, so the table uses fg; the listing image is a
    marketing crop where the table is the whole screen.
11. Draft is memory-only (lost on tab reload). Acceptable for V1; persist later if users lose work.
