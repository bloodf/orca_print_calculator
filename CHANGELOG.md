# Changelog

All notable changes to this project are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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

## [0.1.0] - Unreleased

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
