# Changelog

All notable changes to this project are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-13

### Changed
- The interface runs on PrimeVue 5.0.5 (shared Orca UI foundation 3.0.2). No visible change is intended. PrimeVue 5 needs a newer web view: macOS with WebKit 17.5 or later, WebView2 on Windows, WebKitGTK 2.44 or later on Linux.
- The page is about 56 kB larger (935 kB, 245 kB gzipped); the size gate is now 960 kB.

## [0.2.2] - 2026-11-13

### Changed
- README links the other plugins of the family (Organizer, Spooler, U1 Control) on GitHub and Orca Cloud, with refreshed previews. No change to pricing, quotes or the interface.

## [0.2.1] - 2026-11-12

### Changed
- Build tools only: shared Orca UI foundation 2.0.3 (Vite 8.3.8, @vitejs/plugin-vue 6.0.11). No change to pricing, quotes or the interface.

## [0.2.0] - 2026-11-12

Not yet run inside OrcaSlicer (see `docs/live-run.md`); everything below was checked with the mock host, fixtures and a fake `orca` module. Pricing results of a saved quote do not change unless you choose "Reprice with the current calculation".

### Added

- "Not ready to send" list: when a quote cannot leave the app, every gap is named per field (plate, slot, what is missing) instead of one generic sentence.
- Quotes saved before the completeness flags are read from their own provenance: a price of 0 stays unknown (nothing produces a free filament), and so does a slot weight of 0 even beside a slot with a positive weight (the host never proved that rule: `core._slots` drops all-zero slots and a missing `used_g` is null). A zero the record cannot explain can be confirmed on purpose, one slot or plate at a time ("Confirm 0"), which edits the open quote and changes nothing until it is saved. Plate time 0 is never confirmable. This does not release legacy quotes in bulk or change stored values.
- Order total is a result line when quantity is above 1 or shipping is charged, and also on the narrow price bar. Quote actions link to the Quotes list after saving.
- Mock scenario `?state=legacyQuote` (dev harness only) and mock screenshots in `docs/screenshots/mock-*.png`.

### Changed

- The interface now uses Vue 3.5.45 with PrimeVue 4.5.5 and the shared Orca theme (foundation 2.0.2: palette, type scale, focus, light/dark, pt-BR/en) for every control: buttons, fields, selects, checkboxes, tabs, dialogs, menus, popovers, alerts and toasts. Calculations, saved quotes, profiles and the host protocol are untouched.
- Dialogs, menus and popovers return keyboard focus to the control that opened them. Settings groups wrap instead of scrolling at narrow widths or zoom. Quote list columns for channel and margin give way to the Open button in narrow windows.
- The single-file UI is larger (387,010 B to about 877 kB; the CI limit moves from 400,000 B to 900,000 B) because it now bundles Vue's options API and PrimeVue. The wheel carries the Vue, PrimeVue and PrimeUIX licenses.
- The build verifies the shared UI snapshot (`ui/shared`) before bundling. CI and the publish workflow run the same check first.
- "Fixed fee per sale" now reads "Fixed fee per piece" (and "Taxa fixa por peça"): the fee has always been worked out per piece and multiplied by the quantity. The markup help says fees and tax come on top. Pricing behavior is unchanged.
- README and spec describe the current flow: imported plates stay until you choose the new slice; the screenshots are marked as older than parts of the interface.
- The host sends a per-plate `consumption` field (`known`, `zero` or `missing`) in the plate shape; contract fixtures are regenerated.
- The publish workflow now runs when a GitHub release is published (the event Orca Cloud accepts), takes the changelog from this file, and attaches the wheel and `SHA256SUMS` to the release.

### Fixed

- A slice that reports no filament use (time with no weights, or a total with no per-slot split) is no longer priced as free material. It is flagged as "filament use unknown" and blocks export, print and the quote sheet; a file that states 0 g is a confirmed zero.
- Saving, reopening, duplicating and reloading a quote keeps what was unknown (time, weight, filament price) unknown. Such a draft can be saved, but the Print, CSV and HTML paths (calculator, quote list, preview) all refuse it with the reason and a way to fix it. Quotes saved before this read a zero as unknown, conservatively.
- Order cost is no longer rounded per piece before being multiplied back: 14.9 g at 100/kg for 100 pieces costs 149 centavos, not 100. Each cost line is rounded once on the whole order, spare pieces and per-piece, per-plate and per-order extras included. This is calculation version 2; quotes saved earlier have no version and keep their numbers. The quote's note offers "Reprice with the current calculation", an explicit action.
- Per-piece breakdown details of current quotes: filament and extras no longer multiply order totals a second time. Legacy quotes retain their original calculation rules. With a quantity of 2, filament of R$ 31.77 + R$ 10.29 is R$ 42.06 per piece; extras of one ring at R$ 0.50 plus two magnets at R$ 0.40 each come to R$ 1.30 per produced piece. The price of one unit of an accessory is multiplied by the quantity used per piece (no pack pricing), and saving a quote deducts no stock.
- Removing or changing the Spoolman address now clears the prices, filaments and currency that came from it. A late reply from the old address is ignored. Saved quotes keep their own currency and prices.
- Quote numbers are chosen inside the serialized write that stores the quote, so concurrent duplicates, retries and queued saves never share a number or an export file name.
- The stock warning for extras now counts per-plate extras (copies of included plates x runs), spare pieces, and every row of the same catalog item together. Rows remember their catalog item, so renaming does not unlink them. Nothing is deducted.
- Changing the language reformats money and number fields in place, keeping the value; an invalid edit is left as typed.
- Opening Quotes moves keyboard focus to its title, like the other views.
- Closing a quote, opening another, using the current slice, or the host switching project no longer drops unsaved customer, notes, edited values or confirmed zeros silently: a toast offers Undo with the whole previous draft and quote id; Undo never overwrites newer edits. The toast stays while hovered or keyboard-focused, and focus returns after it is dismissed. The text beside the spare pieces explains that they carry per-piece extras too.
- Header: the tabs never shrink and keep their names at 1100 and 1280 in pt-BR; the printer and Spoolman chips truncate (full text stays as accessible name and tooltip); narrow or zoomed, the current tab keeps its name; below 480 px the navigation takes its own row. The language select is only in Settings.
- Narrow layouts fit (section grids, summary, tool rows), the colour input has an accessible name, error text keeps its contrast in the dark theme, and table rows no longer carry an invalid `aria-selected`.
- An incomplete price is marked beside the numbers (neutral hero, "Incomplete: N items missing", "See what's missing", Profit and Margin "partial"); unknown costs stay in the breakdown as a dash with the reason; an offline Spoolman says which prices stand in, on the price and in Extras and stock.
- "Pieces ordered" and "Copies per run" are labelled apart; a line shows ordered = runs x pieces per run from the engine's own numbers.
- Technical details of a host error sit in a collapsed disclosure; checkboxes follow the plugin accent; icon and label spacing; forced-colors focus and current-tab styles; the primary button uses our own white-on-#00675B pair in both themes.
- Removing an extra moves focus to the neighbouring row (or "+ Extra"); saving an extra to the catalog keeps focus on the row.
- Breakdown amounts and tile values wrap instead of overflowing with large amounts.
- Tests close their HTTP servers (stop, close the socket, join the thread), and the browser evidence scripts close their Chrome in `finally`.

## [0.1.1] - 2026-11-11

### Added

- A "?" button in the header opens a step-by-step guide, from sliced plates to the saved quote. Each cost section has its own "?" that opens the guide at that step.
- An "Extras and stock" tab, between Quotes and Settings. It holds the extras catalog, with an optional count on hand per item and an "Out of stock" badge at zero, and a read-only filament summary from Spoolman: spools and grams left per filament.
- In the calculator, an extra that matches a catalog item with a stock count shows it, and warns when the quote needs more than you have (per piece and per order). Nothing is deducted automatically.
- Quote sheet branding: logo (PNG, JPEG or WebP, re-encoded and resized), tax ID, phone, email, website, address, payment terms and an accent color. Settings › Quote sheet shows a live sample beside the form. The quote preview has an "Edit logo and details" button.

### Changed

- Settings shows one group at a time behind tabs (a side rail on wide windows, a row of tabs on narrow ones) instead of one long page. The extras catalog moved out of Settings to the "Extras and stock" tab.
- A saved quote keeps the company details it was saved with. The logo always comes from the current settings.
- The profit field is now markup over cost instead of margin on price. 100% markup sells for twice the cost. A saved margin above 90.91% (1000% markup) is reset to the default, 100% markup.
- In BRL, USD and EUR every cost starts from a typical value: price per kWh, labor rate, printer price and lifetime. An energy or labor rate saved as "not set" takes that value. Other currencies start empty.

### Fixed

- Number and money fields no longer rewrite what you type. The text stays as typed while typing, on Enter and when leaving the field; only its punctuation is checked.

## [0.1.0] - 2026-11-11

First version. Not yet run inside OrcaSlicer; see `docs/live-run.md`.

### Added

- A Print Calculator tab for OrcaSlicer 2.5 that prices each build plate of the open project.
- Plate capture from the G-code OrcaSlicer writes after slicing, with an include toggle and a copies stepper per plate, and a "may be out of date" warning for project changes made after a slice.
- Import of sliced `.gcode.3mf` files (up to 100 MB).
- Filament prices from Spoolman, matched by manual pick, Spooler mapping, `(#ID)` in the preset name, or `filament_notes`, with fallback to the preset price or a typed price.
- Printer power suggestions with an "Estimated" badge and a generic 120 W for models without an entry.
- Cost sections for machine and energy, labor, extras (with a catalog), shipping and sales fee.
- User-defined sales channels with percent fee, fixed fee, tax and optional price tiers, and a side-by-side channel comparison. No marketplace integration.
- Target margin, minimum order, and four rounding modes: Exact, Round (3 digits), Ends in 9, Ends in 0 or 5.
- Quantity, discount tiers, batch pricing and spare pieces.
- Saved quotes that keep their own inputs and currency.
- Quote sheet with print or save as PDF through the print dialog, plus CSV and HTML export to the plugin data folder.
- English and Brazilian Portuguese interface, any currency, and dark and light themes.
- Local build and install script for macOS (`scripts/dev-install.sh`).

### Known limitations

- Not yet verified inside OrcaSlicer.
- Bambu Lab G-code parsing rests on synthetic fixtures.
- Linux and Windows paths, printing and the file picker are unverified.
- Plate thumbnails are not shown.
- Out-of-date detection does not see mirroring, centering, unsaved setting changes or plates reordered by drag.
- The first slice of a plate relies on the selected plate when slicing ends.
- Published on the OrcaCloud hub as 0.1.0, not yet verified inside OrcaSlicer.
