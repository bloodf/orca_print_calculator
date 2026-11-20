# Development

The UI is Vue 3 and PrimeVue 5 (shared Orca UI foundation 5.0.8 in `ui/shared`: theme, components, icons and the Manrope font) with TypeScript and Vite, built into one offline HTML file. The host is Python 3.12 with no dependencies.

```bash
pnpm -C ui install
pnpm -C ui dev                       # UI with a mock host; pick a scenario with ?state=<name>
pnpm -C ui test                      # engine and UI tests
pnpm -C ui test:coverage             # same, with coverage thresholds
pnpm -C ui typecheck
pnpm -C ui lint
python3 -m unittest discover tests   # host tests (run scripts/build.py once first)
python3 scripts/gen_contract.py --check
python3 scripts/build.py             # build the wheel into dist/
scripts/dev-install.sh               # build and copy into OrcaSlicer (macOS)
```

`scripts/gen_contract.py` runs the real Python host against a fake `orca` module and writes the messages it exchanges to `tests/contract/*.json`. The UI tests replay those files through the real bridge and store, so the two sides cannot drift apart; `--check` fails when the committed files are stale. `scripts/dev_host.py` runs the same host behind a JSON-lines pipe, for browser smoke tests without OrcaSlicer.

## A local build in OrcaSlicer (macOS)

1. Install Python 3.12 and pnpm.
2. Run `scripts/dev-install.sh`. It builds the wheel (`dist/orca_print_calculator_any.whl`) and copies it to `~/Library/Application Support/OrcaSlicer/orca_plugins/orca_print_calculator/`.
3. Restart OrcaSlicer, open the Plugins dialog and enable **orca_print_calculator**. OrcaSlicer shows a permission prompt. Leave full access off.

The script supports macOS only. Linux and Windows plugin paths are not verified. The full check inside OrcaSlicer is [live-run.md](live-run.md).

## What the tests are

Tests are mock-only (mock host, fixtures, a fake `orca` module, headless Chrome). Nothing has run against a real OrcaSlicer, Spoolman server, printer or camera. See [release.md](release.md#what-the-tests-cover-and-what-they-do-not).

## Store and README images

The listing, social and README images are generated photographs with an empty square, which is filled with a real screenshot of the plugin's page. The native images are in `assets/marketing/source/` and are never edited.

```bash
NODE_ENV=development pnpm -C ui exec vite build --mode development --outDir /tmp/opc-harness   # the page with the mock host
node ui/e2e/brand-shots.mjs /tmp/opc-harness/index.html /tmp/opc-shots                       # headless Chrome, sample data
python3 scripts/brand_assets.py /tmp/opc-shots                                               # needs Pillow
```

`ui/e2e/brand-shots.mjs` captures the screens (dark and light, English and Portuguese). `scripts/brand_assets.py` finds the empty square in each source from its pixels, scales the screenshot to cover it, clips it to the rounded corners, exports the listing sizes and records every export in `assets/marketing/asset-manifest.json`. Neither runs in CI, and neither touches the plugin build. `brand/src/build.mjs` regenerates the vector mark only.

## Other documents

- [ux.md](ux.md): the interface specification.
- [release.md](release.md): how a release is published and verified, and the Orca Cloud listing files.
- [orca-cloud-description.md](orca-cloud-description.md): the text of the Orca Cloud page.
- [live-run.md](live-run.md): the manual check inside OrcaSlicer 2.5.
- [spike.md](spike.md): the record of the plugin API spike.
- [../brand/BRAND.md](../brand/BRAND.md): name, palette, mark and image rules.
