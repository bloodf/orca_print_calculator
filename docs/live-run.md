# Live run: verify the plugin in OrcaSlicer 2.5 on macOS

This is the one procedure for checking the real plugin in the real app. It replaces the throwaway-spike procedure
at the end of [spike.md](spike.md) (that file stays as the record of the nine spike questions, "Q1" to "Q9" below).
Nothing here is known to work yet. Each step says what to look for; record what you actually see.

Paths used below:

- Plugin folder: `~/Library/Application Support/OrcaSlicer/orca_plugins/orca_print_calculator/`
- Plugin log: `~/Library/Application Support/OrcaSlicer/orca_plugins/plugin_data/<plugin stem>/plugin.log`.
  `<plugin stem>` is unverified: either `orca_print_calculator` or `orca_print_calculator_any` (the Shape Arrange
  wheel on this machine keeps its data in `plugin_data/shape_arrange_any/`). Check which folder appears after
  step 1. Line format: `<time> <LEVEL> [<thread>] <message>`. `host.py` sets the file name (`LOG_FILE = "plugin.log"`, rotating, 512 kB, one backup) in the plugin
  storage dir, and creates it on the first event or on load.
- Orca logs: `~/Library/Application Support/OrcaSlicer/log/python_*.log` and `debug_*.log`.

## Prerequisites

- OrcaSlicer 2.5.0 (about box).
- A project with 3 plates, multi-filament, on a non-Bambu printer (the spike used a Snapmaker U1). Save a copy
  first. Plates must differ in content so they can be told apart.
- Optional: a Spoolman server reachable from this Mac, with a few spools. Optional: the Spooler plugin with some
  presets.
- Python 3.12 (`python3 --version`), `pnpm` on `PATH`. The build runs `pnpm install --frozen-lockfile`.
- Remove the old spike first. It is a separate plugin and shares nothing, but two tabs confuse the log reading:
  Plugins dialog, select **Print Calc Spike**, disable it. To remove it, quit Orca and delete
  `orca_plugins/print_calc_spike/` (and `plugin_data/print_calc_spike/` if you want its log gone). The installer
  below never touches either folder, so leaving the spike disabled also works.

## Install

```sh
# from the repository root
scripts/dev-install.sh
```

What it does (read from `scripts/dev-install.sh` and `scripts/build.py`):

1. `python3 scripts/build.py`: installs and builds the UI, inlines `ui/dist/index.html` and `ui/src/icon.svg` into
   `src/orca_print_calculator/_assets.py`, then writes `dist/orca_print_calculator_any.whl` (plus
   `dist/SHA256SUMS`).
2. Creates `.../orca_plugins/orca_print_calculator/`, deletes any `*.whl` in it, copies the new wheel in.
3. Prints `installed to <folder>`.

It writes no `.install_state.json`. A local plugin with no sidecar is discovered as **disabled**, so nothing runs
until you enable it in the Plugins dialog (spike.md, "Installed copy"). Reinstall after a code change by quitting
Orca, running the script again, and relaunching.

Before moving on: `unzip -l dist/orca_print_calculator_any.whl` lists `orca_print_calculator/{__init__,_assets,core,host}.py`
and a `.dist-info/`. Check `ls -l` on `ui/dist/index.html`: expect about 880 kB (limit 900,000 B).

## Steps

Keep `tail -f` on the plugin log in a terminal for the whole run (`tail -f "<plugin log path>"`). Use the log
patterns below as substrings. Where a pattern is not listed, copy what you saw into the notes column.

### 1. Launch and enable

Do: launch Orca 2.5 with the 3-plate project not yet open. Open Plugins, find **orca_print_calculator**, confirm it
is listed disabled, enable it with full access **off**.

See: the permission prompt lists `threading` and a read grant for `<tmp>/orcaslicer_<uid>/orcaslicer_model/*`
(on this Mac `<tmp>` is `$TMPDIR`; run `echo $TMPDIR` and compare). One combined prompt, accept it.
Check that the plugin data folder exists afterwards and note its real name.

Log: `loaded 0.2.0`.
Confirms: Q1; checklist C1 (grant shown at enable time).

### 2. Tab and icon

Do: look at the tab strip.

See: a **Print Calculator** tab with an icon (the plugin writes `orca_print_calculator.svg` into its data folder
and hands that path to Orca; if the file exists but no icon shows, note it).
Log: no `icon not written`.
Confirms: tab and icon registration (Q7 context).

### 3. Events before the tab is first opened, then page load

Do: with the tab never opened, open the 3-plate project. Then open the tab and start a stopwatch.

See: the page (about 880 kB, one file with a module script) shows state within 10 s. A blank page or the host-error
screen means `SetPage` or the bridge failed: collect per "If something fails" and stop.
Log: there is no dedicated line for events before the tab opened. Read the order: `loaded 0.2.0` is written when the
tab loads. A capture line (`export stashed ...` or `plate K captured ...`) before the first `loaded` line means events
arrive before the tab exists. If you sliced before opening the tab and there are no such lines, those plates are
missing from the tab. Also check `debug_*.log` has no `[AUDIT] block`.
Confirms: Q7 (`SetPage` accepts ~880 kB with a module script); checklist C9; C4 and C5 (project name, printer vendor
in the header).

### 4. Single slice

Do: select plate 1, press Slice plate. Answer any prompt and note it.

See: no read prompt (the grant from step 1 covers it). The tab shows plate 1 with grams per slot and time matching
Orca's slice panel.
Log: `export stashed depth=1 failed=False`, then `plate 0 captured: seconds=<n> slots=<n>`.
Plate numbering in the log is the index Orca reports; check it against the card shown in the tab.
If denied instead: `G-code read failed: denied` (`missing` or `io` for other errors) and `[AUDIT] block path=.../.<pid>.<n>.gcode` in `debug_*.log`.
Confirms: Q1, Q2; checklist C1, C2, C3.

### 5. Slice all: plate identity and order

Do: Slice all (3 plates).

See: three cards, each with its own plate number and numbers matching Orca's slice panel; no read prompts.
Log: for each plate one `export stashed depth=1 failed=False` followed by one `plate K captured`, K distinct.
A `slicing job complete with N exports stashed; pairing the last` warning means pairing failed.
Other pairing lines: `slicing job complete with no export stashed`, `slicing job <Warn|Error> (<msg>): <N> export(s) dropped`, `G-code export failed; plate not updated`, `no current plate index (<value>); plate not updated`.
Confirms: Q2; checklist C2, C3.

### 6. Re-slice one plate; already-sliced plates are skipped

Do: select plate 2, Slice plate. Then Slice all while all three are valid.

See: only plate 2 refreshes the first time. On the second run note which plates re-capture.
Log: one stash/capture pair for plate 2. For the skipped plates expect no stash lines, or
`slicing job complete with no export stashed` if Orca fires completion without an export; record which.
Cancel a slice midway once: expect `slicing job Warn (cancelled): <N> export(s) dropped` and no plate update (C7).
Confirms: Q2; checklist C2, C7.

### 7. Delete a plate

Do: delete plate 2 in Orca.

See: the card for plate 2 disappears and the old plate 3 becomes plate 2 with its numbers intact.
Log: nothing specific; if the plate index is unknown the host marks all plates stale instead.
Confirms: checklist C8 (if the card shifts wrongly or all plates go stale, the event index was -1).

### 8. Switch printer and filament presets

Do: switch the printer preset, then switch one filament preset.

See: the printer chip changes (model, suggested watts); plates go stale. Note whether changing a filament in the
**sidebar** combobox also marks plates stale.
Also check the filament cost, type and colour on the slot rows (C6) and that the header shows the printer vendor (C5).
Confirms: Q6 (`PresetSelected`); checklist C5, C6.

### 9. Stale banner and the known blind spots

Do: re-slice so plates are fresh, then (a) move an object, (b) rotate, (c) scale, (d) mirror, (e) center, (f)
edit infill % without saving.

See: (a) to (c) show the stale banner. Source reading says (d), (e) and (f) fire no event, so the banner is
**expected not to appear**. Record what you see for each.
Confirms: Q6 (stale marking and its blind spots).

### 10. Spoolman connect

Do: Settings, enter the Spoolman URL, connect.

See: one host prompt for the Spoolman address, once. Currency switches to the server's. Slots match via Spooler
presets. Then force each fallback in turn and watch the slot's source label: the `(#ID)` name rule, the filament
note, a manual pick, the preset `filament_cost`. Hand-check one slot: spool price / weight * grams.
Log: no host name appears in the log by design; failure shows `spoolman_fetch failed: <code>`.
Watch for `spoolman_fetch failed: denied` repeating after you allowed access: that means the grant from the UI-thread probe did not cover the worker's later requests.
Confirms: Q5; checklist C10.

### 11. Spoolman unreachable

Do: stop Spoolman, press connect or refresh.

See: offline state, costs fall back to preset `filament_cost` and say so.
Log: `spoolman_fetch failed: <code>`. After `denied` the host runs one short (about 5 s) `/api/v1/info` probe on the UI thread so the prompt can appear.

### 12. Watts edit persists

Do: change watts on the printer chip, confirm the energy cost changes, quit Orca, relaunch, open the project.

See: the edited value is still there.
Files: `<plugin data>/` holds the saved settings and quotes JSON.

### 13. Save quote, restart, reopen

Do: build a quote (extras, labor, shipping, a channel, quantity 10 with a discount tier), save it, quit Orca,
relaunch, open the Quotes view.

See: the quote reopens identical; price, margin and break-even match a hand calculation.

### 14. Print and PDF

Do: open the quote, Print.

See: the native macOS print dialog (with Save as PDF) opens and the PDF content is the quote only, not the whole
tab. If nothing opens, `window.print()` is not reaching the webview.
Confirms: Q8 (`window.print()`).

### 15. CSV and HTML export

Do: export CSV, export HTML.

See: the page shows the saved path under `<plugin data>/exports/`. Open the files in Finder and check content
against the quote. There is no in-page open button: opening a file from Python needs a `process` grant, which the
plugin does not request.
Log: none for a successful write.
Confirms: Q8 (export path, no extra grant for writing under the data dir).

### 16. Import an exported `.gcode.3mf`

Do: in Orca, File, Export, Export all sliced file, save a `.gcode.3mf`. Start a new project (so nothing is
captured), open the tab, import that file with the file picker.

See: the same plate numbers as the live slice. Note how long a large file takes and whether the page freezes.
Log: `imported <n> plate(s)`. A failure shows `cmd import_sliced failed: <code>` (`too_big` over 100 MB,
`not_zip`, `no_slice_info`, `bad_b64`).
Confirms: Q9; checklist C11 (`project_settings.config` JSON lists, `slice_info` filament ids start at 1).

### 17. Reopen a saved sliced project

Do: save the project after slicing, close it, reopen it, select each plate.

See: whether plates fill without re-slicing (Q3: source says the export event fires when a plate is processed,
not at file open).
Log: `export stashed` then `plate K captured` after you select a plate, or nothing.
Confirms: Q3.

Also check that plate cards show no thumbnails (C12: thumbnails are skipped, `thumb: null`) and that the plugin data folder is under `orca_plugins/plugin_data/` (C13; Spooler detection relies on it).

### 18. Dark and light toggle

Do: switch Orca between dark and light while the tab is open.

See: the tab follows without a reload. Check both themes on the quote view.

### 19. Language switch

Do: switch the plugin language en and pt-BR.

See: all visible text changes without a reload.

Do: select Automatic while Orca uses Portuguese and the browser/system uses English; reopen the plugin. Then select English explicitly.

See: Automatic follows Orca's language when `app_language()` is available. The explicit English preference wins. Hosts without that API fall back to the browser language. Currency and saved quotes stay unchanged.

### 20. Narrow window

Do: shrink the Orca window to its minimum width.

See: no horizontal clipping of price, margin and the plate cards; controls stay reachable.

### 21. Bambu-vendor printer preset

Do: switch to a Bambu Lab printer preset (for example X1 Carbon), Slice all.

See: grams and time still appear (time comes from the head for Bambu, not the tail). The printer model may be
missing if the config block is past the head read: record it.
Log: `plate K captured: seconds=<n> slots=<n>`; with `seconds=None` or `G-code read failed: <code>` the Bambu
format differs from the synthetic fixtures.
Then copy the real files into `tests/fixtures/`: the captured G-code head and tail (a `.gcode.3mf` unzipped gives
`Metadata/plate_<n>.gcode`; take the first 4 kB and last 192 kB), replacing `synthetic_bbl_head.txt` and
`synthetic_bbl_tail.txt`. Check them for IPs, hostnames and keys first. Run `python3 -m unittest discover tests`.
Confirms: Q4 (Bambu footer and time line).

### 22. Not ready to send, legacy zeros, order total

Do: (a) with a quote saved by the previous version that has a plate with no filament or a 0 g slot, open it from Quotes. (b) Press "Confirm 0" on a listed gap, then Save changes, then CSV. (c) Set quantity to 5 and, in the narrow window, scroll the price off screen.
See: (a) one line per gap with plate and slot, no Print or CSV; (b) focus lands on the next Confirm, else Save; after saving, CSV exports and no stored number changed; (c) the order total line is bold under the unit price, and the narrow bar reads "R$ X for 5".
Not covered: screen-reader announcement of the toast, and focus order inside the WebView.

### 23. Not checkable here

Linux and Windows: the temp-folder grant (`orcaslicer_<uid>` on Linux, no uid suffix on Windows, `TMPDIR`/`TEMP`
fallbacks), `window.print()` under WebView2 and WebKitGTK, and the file picker. They stay unverified until someone
runs this on those systems.

## Checklist: assumptions resting on unverified spike items

From the host author, verbatim. Fill the Result column (pass, fail, not seen) during the run.

| # | Assumption | Step | Result |
|---|---|---|---|
| C1 | The `fs_read` path `<gettempdir>/orcaslicer_<uid>/orcaslicer_model/*` stops the read prompt on macOS (spike run 2). The Linux and Windows paths are unverified and marked so in the code. | 1, 4, 5 | |
| C2 | Each plate's export event comes before its slice-complete event, with exactly one export waiting each time. If several are waiting, I pair the last and log a warning. | 4, 5, 6 | |
| C3 | `orca.host.model().current_plate_index()` exists and still points at the plate just sliced, including during Slice all. The spike's form was `orca.host.model()`, not the `plater().model()` named in the plan. | 4, 5 | |
| C4 | `orca.host.plater().project_path()` exists. Project name is the file name without `.3mf`, or null. | 3 | |
| C5 | Printer presets have a `printer_vendor` key. If not, vendor is always null. | 3, 8 | |
| C6 | A filament preset's `config_value("filament_cost"/"filament_notes"/"filament_type")` and `full_config_value("filament_colour")` (assumed `;`-separated) return the shapes I assumed. | 8 | |
| C7 | A slice-complete with code `Warn` always means cancelled. Any code other than `Ok` drops the plate update. | 6 | |
| C8 | Plate-deleted events carry the deleted plate's index. If the index is -1, I mark every plate stale instead of shifting. | 7 | |
| C9 | The page gets lifecycle events before its tab is first opened (spike step 2). If not, slices made before opening the tab are lost. | 3 | |
| C10 | A network request denied on a background thread arrives as `PermissionError` (mapped to the `denied` code), and a prompt answered on the UI thread then covers the whole host. | 10, 11 | |
| C11 | In a real `.gcode.3mf`, `project_settings.config` is JSON lists, and the `<filament id>` values in `slice_info` start at 1. | 16 | |
| C12 | Thumbnails are skipped (`thumb: null`) because the spike never confirmed `plate_N.png` sits next to the G-code. | 17 | |
| C13 | A plugin's storage folder sits under `<datadir>/orca_plugins/...`. Spooler detection relies on that to find the Orca data folder. | 17 | |
| C14 | Orca keeps one temp G-code path per plate for the plate's lifetime (spike §2), so a path seen before is paired with its own plate even when another plate is selected when the job completes. Known limit: the first slice of a plate still uses `current_plate_index()` at completion, so switching plates during that first slice lands the data on the wrong plate (log: `plate <a>'s G-code finished while plate <b> is selected`). Neither event carries a plate index (spike §2: `index` is -1). The path map is cleared on `PlateCreated` (a plate inserted before others may renumber them without `PlateDeleted`), so the next slice of each plate falls back to `current_plate_index()`. | 4, 5 | |
| C15 | A user "Export G-code" fires `GCodeExportFinished` with a path outside the temp tree. It is never read (log: `export outside Orca's temp tree (user export?); not read`), and exports older than 120 s or beyond the last 8 are dropped before pairing. | 8 | |
| C16 | Orca has no plate move/reorder event. `PlateCreated` marks every plate stale; reordering plates by drag is not detected until the next slice. `PlateDeleted` pushes `plates` with `deleted: <index>`. | 7 | |

## If something fails

Collect, in one folder:

- The plugin log (path at the top), whole file.
- `~/Library/Application Support/OrcaSlicer/log/python_*.log` from the run.
- Lines containing `[AUDIT] block` from `~/Library/Application Support/OrcaSlicer/log/debug_*.log`. An audit block
  names the path or action that a missing grant denied.
- A screenshot of the tab (and of any Orca prompt).
- The step number, what you did, and what you saw instead.

Do not edit the plugin to work around a failure; the gate is the plain install.

## Uninstall

Quit Orca, then:

```sh
rm -rf "$HOME/Library/Application Support/OrcaSlicer/orca_plugins/orca_print_calculator"
rm -rf "$HOME/Library/Application Support/OrcaSlicer/orca_plugins/plugin_data/orca_print_calculator_any"
```

The second path is the data folder (settings, saved quotes, log, exports); delete it only if you do not need the
saved quotes. Use the real folder name you noted in step 1.


## Added by the corrections round (not yet run in Orca)

Record the exact version (`pyproject.toml`) and the SHA-256 of the wheel you installed. For each item, note what you saw:

1. A slice whose G-code has a time but no filament use (rare; a post-processor can strip the weight lines): the plate shows "filament use of plate N" as not counted and Print/CSV stay unavailable.
2. Save a draft with an unknown plate time, reopen it, duplicate it, restart Orca: it is still blocked in the calculator, in the quote list (CSV, Print) and in the preview.
3. Remove the Spoolman address: prices and currency come from the preset or your manual values again.
4. Switch language with a money field on screen: same value, new punctuation.
5. Open Quotes with the keyboard: focus lands on the title (confirm the screen reader announces it).

## Added by the UX fixes round (not yet run in Orca)

1. Edit the customer of an open quote, press Close quote: an Undo toast appears; Undo brings the customer back and Save changes updates the same quote (no copy). Type something after closing, then Undo: it must refuse and keep what you typed.
2. Open a second Orca project while a quote has unsaved fields: the fields can be recovered with Undo (the old project's plates are not).
3. pt-BR at 1100 and 1280 px, then Orca zoom 200%: all four tabs are whole, the current tab keeps its name, the Help button is visible.
4. Slice with an unknown time: the price is neutral with "Incomplete", "See what's missing" moves focus to the list (confirm a screen reader announces it); the breakdown shows Energy and Printer wear as a dash.
5. Stop Spoolman: the price names the profile prices, and Extras and stock offers Retry. Windows high contrast: focus rings and the current tab are visible.
6. A quote saved before the flags with a 0 g slot beside a positive one: it asks for "Confirm 0" for that slot (it is no longer read as a stated zero).

## Added by the Vue + PrimeVue migration (not yet run in Orca)

Mock screenshots and the production artifact under its CSP were checked in headless Chrome; none of this was run inside Orca's WebView.
Record the wheel's SHA-256, then check:

1. The plugin opens, every control is styled (buttons, fields, selects, tabs). Switch Orca light/dark: the whole UI, including open menus and dialogs, follows.
2. Help (`?`): the dialog opens modal, Esc and the close button close it, focus returns to `?`.
3. Header tabs: arrows move between tabs, Enter/Space switches; Settings groups wrap at narrow widths.
4. Channel select, "+ Extra" menu, a quote's "…" menu, the printer chip power field and the spool picker open, take keyboard input and close with Esc.
5. Orca zoom 200% and pt-BR: header whole, nothing cut off; Windows high contrast shows focus rings and the current tab.
6. Save a quote, open it, print: the printed sheet looks as before (the paper sheet keeps its own colours).
7. The bundle is larger (about 877 kB): note the first-open time compared with the previous release.
