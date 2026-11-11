# T1.1 Capture spike — findings

Spike plugin: `spike/print_calc_spike.py` (single file, PEP 723, name "Print Calc Spike").
Smoke test against a fake `orca` module and a real G-code fixture: `python3 -I spike/smoke_test.py`, which prints `SMOKE OK`.

Installed copy: `~/Library/Application Support/OrcaSlicer/orca_plugins/print_calc_spike/print_calc_spike.py`.
I did not write a `.install_state.json` sidecar. A concrete format exists (cloud plugins on this machine,
`write_install_state` upstream), but writing one would pre-grant permissions and skip the approval the spike is
meant to observe. Without a sidecar a local plugin is discovered with `enabled = false`
(`PluginDescriptor.hpp:78`), so you enable it in the Plugins dialog. The dialog writes the sidecar and shows the
permission prompt.

Log and fixtures land in the plugin storage dir. For a local plugin that is
`<data_dir>/orca_plugins/plugin_data/<stem of .py>/` (`PluginManager.cpp:573-586`):

- `~/Library/Application Support/OrcaSlicer/orca_plugins/plugin_data/print_calc_spike/spike.log`
- `.../plugin_data/print_calc_spike/fixtures/plate<idx>_<n>.head.txt|.tail.txt` and `fixtures/slice_info.config.xml`
- `.../plugin_data/print_calc_spike/exports/spike-test.html`

Source references are OrcaSlicer tag `v2.5.0`, which matches the installed app (`CFBundleShortVersionString` 2.5.0).
wx paths are `OrcaSlicer/Orca-deps-wxWidgets@b44c39c` (pinned in `deps/wxWidgets/wxWidgets.cmake`).

Fixtures already copied to `tests/fixtures/`. I checked them for IPs, hostnames, API keys and tokens and found none
(`print_host`/`printhost_apikey` are not emitted):

| File | Source |
|---|---|
| `snapmaker_u1_temp_plate1.head.txt` / `.tail.txt` | real temp G-code `.../orcaslicer_model/.../Metadata/.9918.0.gcode`, Snapmaker U1, 4 slots, `10m 7s` |
| `snapmaker_u1_export_5h.head.txt` / `.tail.txt` | user-exported G-code from Desktop, Snapmaker U1, `5h 5m 15s` |

No `.gcode.3mf` was found on disk (`~/Desktop`, `~/Downloads`, `~/Documents`, `~/Developer`). One is produced in the
live run (step 8).

---

## 1. Does reading the temp G-code need a declared `fs_read` tree?

**Answer from source: yes. Live run still needs to confirm.**

- The temp path is `<tmp>/orcaslicer_<uid>/orcaslicer_model/<Ddd_Mmm_DD>/<HH_MM_SS>#<pid>#<model id>/Metadata/.<pid>.<n>.gcode`.
  Built in `PartPlate.cpp:5484-5493` (`get_tmp_gcode_path`), `Model.cpp:1105-1119` (`get_backup_path`),
  `OrcaSlicer.cpp:1335-1342` (`per_user_temp_dir(wxFileName::GetTempDir(), per_user_temp_id())`) and
  `utils.cpp` (`per_user_temp_id` returns `""` on WIN32, `getuid()` elsewhere). Observed on this machine:
  `$TMPDIR/orcaslicer_501/orcaslicer_model/Tue_Nov_10/14_32_13#9918#116/Metadata/.9918.0.gcode`.
- The path is outside both implicit roots: `data_dir()` is read-write, `resources_dir()` is read-only
  (`docs/HLSD/plugin-permissions.md`, "Implicit access"). No component hits the deny-list.
- `SlicingJobComplete` runs on the UI thread, so an ungranted read **shows an inline modal prompt**. It is not
  denied silently. A Yes stores the **exact file path** ("Runtime approvals store the target observed by the audit
  hook"). The file name changes per plate and per session (`.<pid>.<n>.gcode`, where `n` is a global counter), so
  without a declared tree the user would be prompted again and again. **The gate ("no prompt beyond install") can
  only pass with a declared tree grant.** That grant is shown once, in the combined prompt at enable time,
  together with `threading`.
- Root expression. Tree grants must be absolute and are matched on canonical paths on both sides, so macOS
  `/var` → `/private/var` is fine:
  - macOS: `os.path.join(tempfile.gettempdir(), f"orcaslicer_{os.getuid()}", "orcaslicer_model", "*")`
  - Linux: same expression (`TMPDIR` or `/tmp`)
  - Windows: `os.path.join(tempfile.gettempdir(), "orcaslicer_model", "*")` (no uid suffix)
  - Caveat: wx `GetTempDir()` and Python `tempfile.gettempdir()` both prefer `TMPDIR`/`TEMP`/`TMP`, but their
    fallbacks differ. Linux and Windows are **unverified**. Compute the root at import time: no audit scope is
    open then, so `gettempdir()`'s probe file is not attributed.
- Alternative without a grant: a SlicingPipeline capability at `Step.psGCodePostProcess` gets the G-code folder as
  a scoped allowed root (`SlicingPipelinePluginCapabilityTrampoline.hpp:16-24`). It is **not a replacement**,
  for two reasons. For BBL printers it fires on every slice (`BackgroundSlicingProcess.cpp:291-296`); for every
  other printer it fires only on Export/Upload. And it runs only when the process preset lists the capability.
  The spike includes it (`Print Calc Spike: G-code hook`) so you can observe it, optionally.

Live evidence to read:

- Run 1 (`DECLARE_TEMP_READ = False`): `CAPTURE plate_index=… path=…`, then a modal prompt. Answer **No**, and
  `CAPTURE READ FAILED PermissionError: …` follows. `log/debug_*.log` shows `[AUDIT] block path=…/.<pid>.<n>.gcode`.
- Run 2 (`True`): the enable or load prompt lists `…/orcaslicer_model/*`, and then `CAPTURE READ OK head=4096
  tail=…` appears with **no** modal.

## 2. Is stash-and-pair plate identity reliable?

**Answer from source: the ordering holds. Behaviour per scenario needs the live run.**

- `GCodeExportFinished` is fired on the slicing worker from `GCode.cpp:2935/2961/3093/3114` and
  `Print.cpp:5757/5773`. `ctx.msg` = path; **on error `msg` = `path + "\n" + error` and `code = Error`**.
  `ctx.index` is never set (−1).
- `SlicingJobComplete` is fired in `Plater::priv::on_process_completed` (`Plater.cpp:13424-13440`) on the UI
  thread. `code` is Ok, Error, or Warn (with `msg="cancelled"`). `index` is −1.
- Dispatch is synchronous on the firing thread (`PluginManager.cpp:2597-2620`). The export runs inside the
  background process before `EVT_PROCESS_COMPLETED`, so Finished always comes before Complete for a run.
- Extra identity: each plate keeps one temp path for its lifetime (`m_tmp_gcode_path` is cached). A path maps
  to the same plate until that plate is deleted.

Live evidence to read:

- Slice all: for each plate, one `STASH path=… depth=1` then `PAIR stash_depth=1 code=Ok plate_index=K`, with
  distinct K and distinct paths. **`stash_depth>1` or a repeated K means pairing failed.**
- Re-slice one plate: one STASH/PAIR, same path as before for that K.
- Slice all with some plates already valid: check whether skipped plates produce any EVENT lines (expected: none).

## 3. Does opening an already-sliced project fire `GCodeExportFinished`?

**Answer from source: yes, when that plate is processed.** It does not fire at file-open time itself.

When the print is already `finished()`, the background process calls `Print::export_gcode_from_previous_file`
(`BackgroundSlicingProcess.cpp:229-247`), which fires `GCodeExportStarted`/`Finished` with `msg` = the preloaded
temp G-code (`Print.cpp:5715-5773`). `SlicingJobComplete` follows through the normal completion path.

Live evidence to read: after reopening the saved sliced project, `EVENT ProjectOpened`, then (possibly only after
selecting a plate or pressing Slice) `EVENT GCodeExportFinished` → `PAIR … plate_index=K` → `CAPTURE PARSED`.

## 4. Footer and time-line format for a Bambu-vendor preset

**Answer from source. Confirm against a live fixture.** "BBL" means `preset_bundle.is_bbl_vendor()`
(`BackgroundSlicingProcess.cpp:227`).

| | non-BBL (fixture) | BBL (source) |
|---|---|---|
| Time | tail: `; estimated printing time (normal mode) = 10m 7s` (+ `silent` if enabled) | **head**, inside `HEADER_BLOCK`: `; model printing time: <dhms>; total estimated time: <dhms>` (`GCodeProcessor.cpp:1304-1311`, placeholder at `GCode.cpp:4243`) |
| First layer | `; estimated first layer printing time (normal mode) = 18s` | same line, same place as the time line |
| Config block | before the footer, at the end (`GCode.cpp:4912`) | **at the start**, right after `HEADER_BLOCK_END` (`GCode.cpp:4310`) |
| `; filament used [mm]/[cm3]/[g]` | end of file | end of file (written outside the BBL branch, `GCode.cpp:4930`) |
| `; total filament used [g]`, cost, change, layers | yes | **no** (`GCode.cpp:4942`, `!is_bbl_printers`) |

Consequences: the plan's head read of 4 KB + tail read of 192 KB gets grams and time for both flavours. For BBL,
though, `printer_model` and `filament_settings_id` sit in a config block of about 150–250 KB at the **head**,
beyond 4 KB. Either read the head up to `; CONFIG_BLOCK_END` or take them from presets on the UI thread. With
`gcode_skip_config_block` on (`GCode.cpp:3426`) there is no config block at all. Time strings use `get_time_dhms`
(`1d 2h 3m 4s`).

Live evidence to read: with a Bambu preset, `fixtures/plate<K>_<n>.head.txt` contains `; model printing time:`;
`CAPTURE PARSED` has `used_g` but `keys_present` lacks `printer_model`.

## 5. Is `filament_notes` in the G-code config block?

**Yes.** Fixture `tests/fixtures/snapmaker_u1_temp_plate1.tail.txt` contains `; filament_notes = ;;;`: four empty
slots, separated by `;`. The key is not in `banned_keys` (`GCode.cpp:8306`), so for BBL it is in the head config
block. Values containing separators are quoted like `filament_settings_id` (`"a";"b"`).

Live evidence to read (optional): put `Spoolman filament 7` in one slot's notes and check `CAPTURE PARSED …
"filament_notes": …` for quoting and newline escaping.

## 6. Do `ObjectChanged` / `ObjectTransformed` / `PresetSelected` fire reliably enough for stale marking?

**Partly, from source. Gaps found:**

- `ObjectTransformed`: move, rotate and scale fire it (`GLCanvas3D.cpp:5787/5916/6014`, `msg` =
  moved|rotated|scaled), as do Arrange, Orient and FillBed jobs. **Mirror (`do_mirror`) and center
  (`do_center`, `do_center_plate`) do not.** No plate index.
- `ObjectChanged`: `Plater::changed_object(s)` (`Plater.cpp:22325/22376`), `source="geometry"`, suppressed during
  project load. Has an object index, not a plate index.
- `PresetSelected`: `Tab::select_preset` (`Tab.cpp:7767`), `msg` = print|filament|printer, `name` = preset.
  **No slot index.**
- **Editing a setting without switching preset (for example infill %) fires nothing** until `PresetSaved`.
- So stale marking has to be "all plates" on any of these events, and unsaved edits are a blind spot until the
  next slice replaces the data.

Live evidence to read: `EVENT ObjectTransformed {"msg":"moved",…}` per move. Look for an EVENT line after mirror,
after changing a filament in the **sidebar** combobox (does it go through `Tab::select_preset`?), and after an
infill edit (expected: none).

## 7. Does `SetPage` accept ~250 KB inlined HTML with a module script?

**Needs live run.** The page is loaded with `SetPage(html, file://<resources>/web/)` (`WebPanel.cpp:79`,
`WebHosting.cpp:55`). Pages shipped so far are about 47 KB and use no module scripts.
`get_ui()` is called again on a WebKit reload (`WebPanel.cpp:60-62`), so it must be cheap and stateless.

Live evidence to read: `get_ui() -> 25xxxx chars`, `PAGE ready html_length=…`, `PAGE module script ran,
pad=250000`, and the header showing "module script: module script ran (250000 bytes padding)".

## 8. Does `window.print()` work; does opening an exported file need an extra grant?

- `window.print()`, macOS from source: WKWebView calls `_webView:printFrame:` → `wxWebViewWebKit::Print()`
  (`webview_webkit.mm:1306-1309`), which runs `NSPrintOperation` on the whole webview, so the native print
  dialog (with Save as PDF) is expected. Windows (WebView2) and Linux are unverified. Live line: `PAGE
  window.print() returned undefined after N ms` after the dialog closes.
- Writing to `storage()/exports/` needs no grant (it is under `data_dir()`).
- Opening the file: the page can't. `window.open` or `target=_blank` goes to `PluginPage::on_new_window`, which
  **loads the URL into the plugin tab itself** (`PluginPages.cpp`, `on_new_window`) and replaces the UI, so do
  not use it. From Python, `webbrowser.open` on macOS spawns `osascript` through `os.popen` → `subprocess.Popen`
  → **`ProcessCreate`, which needs a `process` grant** (inline prompt on the UI thread, stored verbatim). Spooler
  does the same (`open_url`). Live lines: `EXPORT wrote …`, a prompt, `EXPORT webbrowser.open -> True|False`.
  Cheaper V1: show the saved path, and use `window.print()` for the PDF.

## 9. How does a page let the user pick a `.gcode.3mf`?

- macOS, from source: `<input type=file>` → `runOpenPanelWithParameters` (`webview_webkit.mm:1276-1299`) → native
  `wxFileDialog` with the **default wildcard** (`accept` is ignored, so all files show). The page gets a `File`
  with name, size and bytes, but **no path**.
- So the import path is: bytes in JS → base64 over `postMessage` → Python `zipfile` on `BytesIO` → `Metadata/slice_info.config`.
  **No filesystem grant needed.** The alternative, a pasted path read by Python, prompts on the UI thread and
  grants that exact path only, which is worse UX. Bridge change: `import_sliced {path}` becomes `{name, b64}`.
  Another option is to parse the zip in TS and send only `slice_info.config`.
- Size risk: a `.gcode.3mf` embeds the full G-code (often tens of MB). Measure the bridge cost.

Live evidence to read: `PAGE file input: name=… size=… path=(none)`, `PAGE file input: posted base64 (N chars)
in T ms`, `IMPORT received … bytes=…`, `IMPORT slice_info.config … saved …/fixtures/slice_info.config.xml`.
For the path variant: `PATH read attempt …`, a prompt, then `PATH read OK` or `FAILED PermissionError`.

---

## Gate status

**Not yet passed. Expected to pass only with `DECLARE_TEMP_READ = True`.** That means the product must declare
the temp-tree `fs_read` grant at load. Run 2 of the procedure decides the gate: all three plates show
`CAPTURE READ OK` and `used_g`, and the time line appears, after Slice all, with no prompt other than the one at
enable time. If run 2 still prompts or fails, stop and report. Do not swap in another capture path.

## Live run procedure

1. Launch OrcaSlicer 2.5. Open Plugins, enable **Print Calc Spike** (local) with full access **off**. Accept the
   prompt (`threading`). Note whether a "Print Calc Spike" tab appears.
2. **Before opening the tab**, open a 3-plate, multi-filament project with a non-Bambu printer (Snapmaker U1).
   Then open the tab. Replayed `EVENT ProjectOpened` lines show whether the Pages capability gets events before
   its tab exists.
3. Click **Dump state**.
4. **Slice all.** At each read prompt, click **No** (run 1 evidence).
5. Select plate 2 and click **Slice plate** (re-slice).
6. **Slice all** again with all plates valid (skipped-plate behaviour).
7. Move, rotate, scale, mirror and center an object. Change one filament slot in the sidebar. Switch the process
   preset. Edit infill % without saving.
8. **File > Export > Export all sliced file** (`.gcode.3mf`). Save the project, close it, reopen it, and
   select each plate (Q3).
9. Click **window.print()** (cancel the dialog), then **Export test file** (answer No, then repeat and answer Yes).
   Pick the exported `.gcode.3mf` in the file input. Paste its path and click **Read path** (answer No).
10. Quit Orca. In `~/Library/Application Support/OrcaSlicer/orca_plugins/print_calc_spike/print_calc_spike.py`,
    set `DECLARE_TEMP_READ = True`. Relaunch and accept the load prompt, which should now list
    `…/orcaslicer_model/*`. Repeat steps 4 and 5: expect `CAPTURE READ OK` with no modal.
11. Switch to a **Bambu Lab** printer preset (for example X1 Carbon). Slice all, then repeat step 5.
12. Hand back `.../orca_plugins/plugin_data/print_calc_spike/spike.log` and `fixtures/`. Copy one BBL and one
    non-BBL head/tail pair and `slice_info.config.xml` into `tests/fixtures/`, plus the exported `.gcode.3mf`
    after checking it for host/IP strings.
