# Changelog

All notable changes to this project are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Costs** now adds up. The total was filament plus machine plus labor, but filament had no row and the sales fee was a row the total left out. Filament is the first row now (press it to go to the plates) and the rows add up to "Cost per piece" to the cent. Channel fees and tax moved under the total, in a block named **Selling**: they come out of the price and are not a cost of the piece. No price changes.
- With more than one piece, each cost line is its exact share of the cost per piece. Each line used to be rounded on its own, so the breakdown, the Costs panel and the CSV could be a cent or two off the total.
- Between about 760 and 1100 px wide the tabs at the top were cut: at 900 px **Settings** was not visible at all. The tabs now take a line of their own when they do not fit, and a tab name is never cut.
- On a saved quote with a missing weight the **Confirm 0** button was squeezed and its label cut. It keeps its size and says **Confirm 0 g**.
- The banner over an open quote that is no longer in the list was titled "Title".

### Changed
- Smaller, second pass: the green **Spoolman** chip opens the same small popover as the red one (state, **Refresh**, **Settings**) instead of refreshing silently; each plate's cost says "Cost" under the figure; **Round to 3 significant digits** replaces "Round (3 digits)".
- The interface moved to the shared UI kit 5.14.0: the Settings list, the Connections list with its single **Check again**, the data tables and the back arrow come from the kit; the tab-wrapping rules of this plugin are gone (the kit's bar already keeps a tab name whole from 560 to 1500 px, in every language).
- **Settings › Requirements** is gone. Spoolman and Spooler head **Settings › Connections** (it was "Spoolman"), with one **Check again** for both. Without Spooler the page no longer prints internal file names and a folder path, and the links are named for where they lead (pressing one copies the address). Both are optional: one that is absent reads "Not connected" in grey, not as an amber warning.
- **Settings** has seven pages, not nine: **Language and currency** and **About** are now **General**.
- **Settings › Connections**: the address is not repeated under its field, the permission note shows only while you change the address, and the refresh interval is explained in one line.
- **Settings › Sales channels**: column headings (**Compare**, **Default**, **Channel**) replace the sentence that explained the checkbox and the round button.
- "Incomplete" is said once: the amber price block and the list of what is missing under it. The header chip, the extra line and (beside the plates) the page banner are gone.
- "Preset price" is quiet text, not an amber warning, when you work without Spoolman. It stays amber when Spoolman is set up and not answering.
- "Plates may be out of date" is one sentence with a **Refresh** button; the fine print moved to the guide.
- The price panel puts title, customer and note last, next to **Save quote**, and fades its last lines when there is more to scroll.
- Wording: **Printer and energy** (was "Machine and energy"); "filament 1" where the list of what is missing said "slot 1".
- Smaller: **Import sliced file** and **Refresh** look alike, the Spoolman dot keeps the word "Spoolman" on a wide window, the stock column is "Material and vendor", a quote also opens from its title, and an empty project no longer offers a channel and markup with nothing to price.

## [0.10.4] - 2026-11-28

### Changed
- Shared UI 5.13.2.

## [0.10.3] - 2026-11-28

### Changed
- Shared UI 5.13.0, Vite 8.4.0 and Vitest 5.1.2.

## [0.10.2] - 2026-11-26

### Changed
- Shared UI 5.12.0.

## [0.10.1] - 2026-11-25

### Changed
- Shared UI 5.10.1.
- The Orca Cloud listing, store images and README screenshots were refreshed; the listing is English only now.

## [0.10.0] - 2026-11-22

### Added
- **Settings › Quote sheet** has a new option to hide the "Made with Orca Print Calculator" line at the bottom of quotes. It is on by default; switch it off to leave only your own footer note. Thanks @tanishqmanuja for asking (#58).

### Changed
- Shared UI 5.10.0.

## [0.9.3] - 2026-11-22

### Changed
- The page now runs on Vue 3.5.46, the version Shared UI 5.6.2 expects.

## [0.9.2] - 2026-11-21

### Fixed
- Spooler is now found as soon as it is installed. Before, the calculator only saw it once Spooler had a Spoolman address or had made presets, so Spooler with no Spoolman yet, with a Bambu Lab spool source, or with an address that has a user name and password showed as "Not installed".
- Spooler is also found while OrcaSlicer hasn't yet given an Orca Cloud plugin its storage folder (for example right after starting offline).
- When Spooler isn't found, **Settings › Requirements** now says which folder was searched and for which files.
- The install steps (README, Orca Cloud page and Settings › Requirements) now say where **Plugins** is: in the **File** menu of the menu bar on macOS, and under the small arrow next to **File** at the top left of the window on Windows and Linux.

## [0.9.1] - 2026-11-21

### Changed
- Shared UI 5.6.2.

### Fixed
- A filament whose OrcaSlicer preset has a density of 0 now shows its weight as unknown and flags the quote as incomplete, instead of counting 0 g and pricing it as free.
- Plates sliced before and after you changed a filament preset's price no longer block the quote with "Same filament with two prices". Each plate is priced at the cost it was sliced with, shown as two lines.
- Undo after removing a volume discount tier puts that tier back without throwing away edits you made to the other tiers in the meantime.
- A filament preset named like a built-in JavaScript name (for example "constructor") no longer shows a reset button for a choice you never made.
- Opening the Quotes list checks each saved quote once instead of twice.

## [0.9.0] - 2026-11-21

### Changed
- Shared UI 5.6.1. The page stays on Vue 3.5.45 for now.

### Fixed
- A quote save that OrcaSlicer took too long to confirm (for example while it asked for permission to write the file) no longer disappears from the list. Before, the next save could erase a quote that had in fact been written; now it stays, and **Try again** writes the list as shown.
- An energy price or labor rate you cleared in Settings stays "not counted" after reopening OrcaSlicer, instead of coming back as the typical value for your currency.
- The note about a skipped fee step now names the step just below the price, not the first one, when a channel has more than one.
- A 100% volume discount in a hand-edited settings file is reset with the other invalid settings instead of making every quote fail.

## [0.8.2] - 2026-11-20

### Fixed
- Activating the plugin no longer makes OrcaSlicer ask for the Python audit event "open" with no file named. The page is read with `pkgutil` instead of `importlib.resources`, whose first use loaded more modules and so wrote to OrcaSlicer's Python cache without a path, and files are saved without opening them through a file descriptor. OrcaSlicer can only show either as a permission prompt with no target.

## [0.8.1] - 2026-11-20

### Changed
- The page ships in the plugin as a plain `app.html` file next to the code instead of inside a Python file. Nothing changes in OrcaSlicer.

## [0.8.0] - 2026-11-19

### Changed
- New look on the shared Orca UI foundation 5.0.2: every page uses OrcaSlicer's own greys, with its teal for the main action, focus and the selected row. Print Calculator's lime is now only on its mark and under the open tab. The price sits in a plain grey block at its large size (amber while it is incomplete, red for a loss), and the Price and Quotes panels carry a lime icon.
- The note under a field is now behind an (i) beside its label, in the calculator and in Settings. An error, or "Not set", still shows under the field. The note about saved extras and the one in the first-run checklist moved behind the panel's (i).
- In a wide window the tabs are no longer cut when the project name is long: the project and the printer give way instead.
- **Reset everything** in Settings is an outlined red button.
- The stock and the spool picker follow Spoolman by themselves: while the calculator is visible it re-reads Spoolman every 30 s (Settings › Spoolman › **Refresh Spoolman every**: 10 to 300 s, or off), so a spool changed in Spooler, U1 Control, Kobra Control or Spoolman shows without pressing Refresh. It pauses while hidden, waits longer after failed reads (up to 5 minutes) and never refreshes while a picker or dialog is open.
- The README and Orca Cloud pictures show the new look, in English and Brazilian Portuguese.

## [0.7.0] - 2026-11-18

### Changed
- Settings is split into pages. In a narrow window the list of pages opens one page at a time, with a Back button. A link into Settings opens the right page, opening Settings on its own brings back the page you used last, and a page with a value to fix is marked in the list.
- A spool whose weight Spoolman does not know now shows as a full reel in its colour with a small "?" badge, instead of a bare reel that looked like an empty spool.

## [0.6.2] - 2026-11-17

### Added
- Polish (pl) translation. Thanks to @xtronets for asking (u1control#20). Every tab, message, the quote sheet and the CSV exports are in Polish, with Polish plural forms (1 płyta, 2 płyty, 5 płyt) and the terms OrcaSlicer's own Polish uses. With Language set to Auto, OrcaSlicer in Polish (pl_PL) opens the plugin in Polish; Settings > Language lists it as Polski.
- In Polish, money, numbers, dates and print times follow Polish rules (12 345,50 zł, 16 lis 2026, 2 h 14 min), quotes are numbered "nr 0042", and on first run the currency is the złoty (PLN). A currency already saved is never changed.
- The page is about 37 kB larger (1,145 kB) because it carries Polish; the size gate is now 1,200,000 bytes, which also covers the per-slot spool picker.
- Pick the Spoolman spool loaded in each filament slot (#18; thanks to @Cweatherington for reporting it). **Change** on a slot lists your spools, the ones with the slot's material and nearest colour first, plus **Auto**. The pick is kept per printer preset and slot number, so slots that share one filament preset can each have their own spool, and it survives restarts. The picked spool's price per kg (spool price, else filament price) prices the slot, and the stock note checks the slot against what is left on that spool.
- Auto also uses, before the Orca preset price: Spooler's per-spool preset links, the Spoolman extra field `orca_filament_preset` on a spool or filament, and the only filament with the slot's material and colour.
- Each slot says what priced it (Spoolman spool #id, Spoolman filament, Orca preset or typed), with a hint and a Pick spool shortcut when the Orca preset price is in use.

## [0.6.1] - 2026-11-17

### Added
- Settings > Requirements lists what the plugin can use but does not need: a Spoolman server (configured, detected from Spooler, or not set) and the Spooler plugin (detected or not installed). Each row says what it is for and how to install it, and Check again looks for them again without restarting.
- Test connection in Settings > Spoolman says why it is off when no Spoolman address is set or detected.

### Changed
- Notifications appear bottom-left and each one can be closed; warnings and notices on the page can be dismissed. A closed notice comes back only when what it is about changes (another Spoolman address, other plates, another file), or when the problem clears and later happens again.
- Notifications wait while OrcaSlicer is in another tab or app; errors stay until closed, and one with Undo stays 8 seconds.
- The Spoolman Test connection result is a notification instead of a line that stayed on the page.
- The page fills the whole tab at every height, also after the window is resized: no more grey under a short page.
- Settings are tabs: one section at a time, and the save bar stays on screen at any window height.
- The plugin icon is the new brand tile.

### Fixed
- When an Orca Cloud install was started offline, Print Calculator logged an error while loading ("Cloud plugin storage is unavailable before networking is initialized"). It no longer asks for its storage folder while loading. Until OrcaSlicer can give it one, it shows its built-in defaults and its own icon, and it never saves those defaults over your saved settings and quotes. Before saving, and when you open the tab again, it reads your files again, so a change you make once networking is up keeps your saved settings and quotes. While they haven't loaded yet, a notice says so (instead of the file-permissions error), and when your saved settings replace the ones on screen, a message says so too. New quote numbers continue after the saved quotes that arrive.

## [0.6.0] - 2026-11-16

### Added
- Spanish, German and Simplified Chinese. The whole plugin speaks them: every tab, button, field, tooltip, message, confirmation, empty state, screen-reader label, the printed or PDF quote and the CSV exports. Your own data (customer names, titles, notes, channel and extra names) is never translated. Wording follows the terms OrcaSlicer already uses in each language.
- With Language set to Auto, the plugin follows OrcaSlicer's own language: Spanish, German, Simplified Chinese (Traditional Chinese also shows Simplified Chinese), Brazilian Portuguese, or English for any other. Settings > Language still lets you pick one by hand: English, Português (Brasil), Español, Deutsch, 简体中文.
- Prices, numbers, percentages, dates and print times are written the way each language writes them (for example 1.234,56 € and 2 h 14 min in German, 2小时14分钟 in Chinese). The currency stays the one you chose, and saved values and calculations do not change.
- On first run the currency follows the language: euro for German, yuan for Chinese, real for Brazilian Portuguese, US dollar otherwise. A currency already saved is never changed.

### Changed
- Brand: new store, social and README images (workshop photographs with a real screenshot of the plugin's page in each), a new README in English and Portuguese, and one file with the Orca Cloud description. The old vector hero, social, listing and tile images are removed. The plugin itself is unchanged.
- The page is about 100 kB larger (1,092 kB, 313 kB gzipped) because it carries the three new languages; the size gate is now 1,115,000 bytes.

### Fixed
- Settings > Spoolman: an invalid address now shows its error in the styled error line; it rendered as plain unstyled text.
- Copies, pieces ordered, pieces per run and discount quantities read "2.5" as 25. A count with a decimal is now refused and the field goes back to the last count; "1.000" and "1,000" still read as a thousand. Decimal fields (prices, energy, rates, percentages, weights) already took "2.5" and "2,5" as two and a half in every language.

## [0.5.0] - 2026-11-15

### Changed
- New interface, shared with the other plugins of the family (Orca UI foundation 4.0.1). The plugin's colour is now lime, with a deep green bar across the top that carries the plugin name, the project and its printer, the four tabs (Calculator, Quotes, Extras and stock, Settings), Import sliced file and Refresh. Every tab, control, confirmation and message from 0.4.0 is still there.
- Calculator: Plates and Costs are panels with coloured headers and icons, one row per plate (filament colour dots, copies, cost) and one row per cost section with its amount; a section still opens to its fields. The Price panel leads with the suggested price, large, in a lime block, with profit, margin and break-even under it, then the channel, pieces ordered, markup, title and customer, and "Where the price goes": one bar split by cost line, channel fees, tax and profit, with each share and amount. Save, Print and CSV sit at the bottom of the panel.
- A cost section whose amount leaves something out now says "partial" beside the amount, not only in amber.
- A price that is missing information leaves the lime block for an amber one marked Incomplete, says how many items are missing, and lists them right under the price; a banner at the top of the page says it once. Print and CSV stay visible but are disabled and point at that list (before, they were hidden). A loss shows the price block in red.
- Notices (an open saved quote, Spoolman not answering, plates that may be out of date, plates from an imported file, settings that were reset, files that could not be read) are one banner each at the top of the calculator.
- Settings is one page with all its groups and an index beside it that jumps to each, instead of one group per tab.
- The empty calculator shows the calculator illustration with Import sliced file. Toasts, banners and empty states use the shared look; icons come from one shared set.
- The printed and exported quote keeps white paper, your logo and your colour, with clearer type: bolder shop name and quote number, small capital column headings, aligned figures, and the total on a light band under a rule in your colour. The total is in black ink instead of amber, so it stays readable with any colour you pick and when printed. A new quote sheet's rule colour defaults to the brand's deep green; a colour already saved in your settings (including the old teal default once settings were saved) stays as it is, and saved quotes keep theirs.
- The interface uses the Manrope font, embedded in the page; the page policy now allows that embedded font (`font-src data:`) and nothing else new.
- The page is about 50 kB larger (989 kB, 282 kB gzipped); the size gate is now 1,010,000 bytes.
- Brand: the logo, icon, hero, social and listing images move from teal and an amber price to deep green and lime, with the price in lime. Amber is kept for warnings.

### Fixed
- At 1280x720 the list of missing items could be cut off at the bottom of the price panel. The panel now fits the window from where it starts and scrolls inside, so the list and the quote actions stay reachable.

## [0.4.0] - 2026-11-14

### Added
- Filament stock note under the price: when a quote prints more of a Spoolman filament than its spools that are not archived have left, counting every plate copy and run, the price panel says how much is left and how much the quote needs. Filament with no remaining weight in Spoolman is not checked, and nothing is deducted.
- "Export list" in the Quotes tab writes the quotes shown (search applied) to one CSV for bookkeeping: number, date, customer, title, currency, channel, quantity, unit price, total, margin and whether each quote is complete, from the numbers saved with each quote.

### Changed
- Prices of new quotes on a channel with fees or tax are lower than before. Markup now means what its help says: profit after the channel's fees and tax is the markup times the cost (calculation version 3). Before, the markup was turned into a margin on the gross price, so fees were charged on top of the profit as well: a 10.00 cost at 100% markup on a 20% fee channel was priced 33.32 (16.66 profit) and is now 25.00 (10.00 profit). With no fees and no tax nothing changes. Quotes saved earlier keep their numbers; "Reprice with the current calculation" moves one to version 3. The "under target" note now compares markups, and "No price works" can only happen to quotes saved before this version.

### Fixed
- A filament matched in Spoolman whose spools and filament have no price can now take a typed price per kg. The "Or type a price per kg" field was shown for it but the typed value was ignored, so the slot stayed unpriced and the quote could not be exported.
- Two filament presets matched to the same Spoolman filament, when Spoolman has no price for it and each preset has its own cost, no longer stop the quote with "Same filament with two prices".
- A saved quote whose date in `quotes.json` cannot be read (or whose validity is out of range) no longer breaks the quote sheet, print and HTML export; the date and "valid until" lines are left empty.
- A saved quote with a currency code that is not three letters is set aside as an unreadable row (kept in `quotes.json` and counted) instead of breaking the Quotes list.
- A negative filament weight in G-code or in an imported `.gcode.3mf` reads as unknown instead of reaching the price engine, which refused the whole quote. An imported plate numbered 0 or below takes its position in the file instead of becoming "Plate 0".
- An imported `.gcode.3mf` that numbers two plates the same now lists its plates in file order, so each plate keeps its own include box and copies count instead of sharing them.

## [0.3.1] - 2026-11-14

### Changed
- Build tools: TypeScript 7.0.2, jsdom 31.0.1 and the shared Orca UI foundation 3.1.0. vue-tsc type-checks the interface on the TypeScript 6 compiler from `@typescript/typescript6`, because TypeScript 7 has no JS API yet. The plugin and its page are unchanged.

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
