# Releasing

A release is a GitHub release for the tag `vX.Y.Z`. Publishing the release runs
`.github/workflows/publish-orcacloud.yml`, which repeats the CI checks on the tagged commit, builds the wheel,
attaches `orca_print_calculator_any.whl` and `SHA256SUMS` to the GitHub release, and publishes the same wheel
to Orca Cloud.

Why a release and not `workflow_dispatch` or a tag push: Orca Cloud only accepts the GitHub OIDC token of a run
triggered by a published release (the official guide, <https://cloud.orcaslicer.com/wiki/>, "Publishing a plugin
from GitHub": `on: release: types: [published]`, `id-token: write`, audience `orcacloud`, HTTP 201 is success).
The other plugins of this family publish the same way.

## What the workflow enforces

- The tag is `vX.Y.Z` (numeric) and equals `version` in `pyproject.toml`; `scripts/build.py --release-tag` checks it again.
- The same gates as CI: shared UI snapshot, lint, typecheck, coverage thresholds, contract fixtures, build,
  bundle size (1,010,000 B), Python tests.
- `dist/SHA256SUMS` matches the wheel, and the wheel's metadata and `VERSION` equal the version.
- `CHANGELOG.md` has a non-empty `## [X.Y.Z] - date` section. It becomes the GitHub release notes (when empty)
  and the Orca Cloud changelog. Orca Cloud keeps at most 4000 characters, so `scripts/release_notes.py` cuts the
  copy it sends at a line boundary and adds a link to the release page.
- The OIDC token is masked in the log. No secret is stored in the repository.

## Prerequisites (outside the repository)

1. On Orca Cloud: the plugin is connected to this repository under Edit plugin > GitHub publishing (one repository
   publishes to exactly one plugin; the plugin page is listed in [orca-cloud-description.md](orca-cloud-description.md)). A 401 from the publish
   step means this is missing.
2. The version is higher than the one the hub lists.
3. GitHub Actions is enabled for the repository and the release is not a draft.

## Steps

1. On `main`, the commit to release has `pyproject.toml` at the new version and a dated changelog section.
   Run the gates locally (below) and note the commit hash.
2. Tag exactly that commit and push the tag: `git tag vX.Y.Z <commit> && git push origin vX.Y.Z`.
3. Publish the release, which starts the workflow:
   `python3 scripts/release_notes.py X.Y.Z --limit 0 | gh release create vX.Y.Z --verify-tag --title "Orca Print Calculator X.Y.Z" --notes-file -`
4. Wait for the "Publish to Orca Cloud" run to finish (a queued run is not a publication). Re-running a run that
   already published is safe; fix the cause and re-run if a step failed.

## Verify afterwards

- The run is green and its last step printed HTTP 201 (`response.json`) and "Published vX.Y.Z to Orca Cloud".
- The release lists `orca_print_calculator_any.whl` and `SHA256SUMS`; the attached `SHA256SUMS` is the authority
  for what was published. Rebuilds on one machine are byte-identical (the release report checks
  this), and the toolchain is pinned in the workflow (Node 26.13.1, pnpm 12.18.0, Python 3.15, `--frozen-lockfile`),
  but a build on another OS is not guaranteed to match byte for byte: compare it, and treat a difference as
  something to explain, not as a failed release.
- The hub page lists the new version and changelog. Subscribing and enabling the plugin inside OrcaSlicer is
  the live check in [live-run.md](live-run.md).

## Orca Cloud listing

The page is <https://cloud.orcaslicer.com/p/521c07cf6de2>. Its text is in [orca-cloud-description.md](orca-cloud-description.md), in English and Portuguese. The images are uploaded by hand on the plugin's edit page; publishing a release does not change them. All are PNG and under 2 MB. Bytes are English / Portuguese.

| Slot | File | Size | Bytes |
|---|---|---|---|
| Plugin icon (store tile) | `assets/orca-cloud/orca_print_calculator-tile.png` | 512×512 | 187,169 |
| Main image | `assets/orca-cloud/orca_print_calculator-main-en.png`<br>`assets/orca-cloud/orca_print_calculator-main-pt-BR.png` | 1600×900 | 1,277,846 / 1,243,915 |
| Main image, square | `assets/orca-cloud/orca_print_calculator-main-square-en.png`<br>`assets/orca-cloud/orca_print_calculator-main-square-pt-BR.png` | 900×900 | 834,185 / 819,831 |
| Gallery 1: filament cost | `assets/orca-cloud/orca_print_calculator-feature-01-filament-en.png`<br>`assets/orca-cloud/orca_print_calculator-feature-01-filament-pt-BR.png` | 1600×900 | 1,251,519 / 1,276,625 |
| Gallery 2: machine, energy and labour | `assets/orca-cloud/orca_print_calculator-feature-02-costs-en.png`<br>`assets/orca-cloud/orca_print_calculator-feature-02-costs-pt-BR.png` | 1600×900 | 1,293,843 / 1,280,418 |
| Gallery 3: price with margin | `assets/orca-cloud/orca_print_calculator-feature-03-price-en.png`<br>`assets/orca-cloud/orca_print_calculator-feature-03-price-pt-BR.png` | 1600×900 | 1,226,476 / 1,189,040 |
| Gallery 4: saved quotes | `assets/orca-cloud/orca_print_calculator-feature-04-quotes-en.png`<br>`assets/orca-cloud/orca_print_calculator-feature-04-quotes-pt-BR.png` | 1600×900 | 1,226,757 / 1,213,850 |
| GitHub social preview | `assets/social/orca_print_calculator-social-preview-en.png`<br>`assets/social/orca_print_calculator-social-preview-pt-BR.png` | 1280×640 | 785,028 / 797,180 |
| README hero, dark | `assets/readme/orca_print_calculator-hero-dark-en.png`<br>`assets/readme/orca_print_calculator-hero-dark-pt-BR.png` | 1600×900 | 1,243,180 / 1,263,469 |
| README hero, light | `assets/readme/orca_print_calculator-hero-light-en.png`<br>`assets/readme/orca_print_calculator-hero-light-pt-BR.png` | 1600×900 | 1,295,848 / 1,257,203 |

The GitHub social preview is set in the repository settings, not on Orca Cloud. The README heroes are listed for completeness.

Each image is a generated photograph whose empty square holds a real screenshot of the plugin's page (sample data, mock host, not captured inside OrcaSlicer). The native images are in `assets/marketing/source/`, and `assets/marketing/asset-manifest.json` records the source, screenshot, operation, size, bytes and date of every export. To redo them after an interface change, see [development.md](development.md#store-and-readme-images). The tab icon inside OrcaSlicer is the store tile at 40x40, `brand/plugin-icon.png`; after a new tile, export it again (Pillow, Lanczos, white surround made transparent).

## Local gates

```bash
pnpm -C ui install --frozen-lockfile
node ui/shared/scripts/check.mjs
pnpm -C ui lint && pnpm -C ui typecheck && pnpm -C ui test:coverage
python3 scripts/gen_contract.py --check
python3 scripts/build.py --release-tag vX.Y.Z      # dist/orca_print_calculator_any.whl, dist/SHA256SUMS
python3 -m unittest discover tests
```

## What the tests cover, and what they do not

Every automated test here is mock-only: the pricing engine and Vue UI run in jsdom or headless Chrome with a mock
host, the Python host runs against a fake `orca` module, and Spoolman is a local fake HTTP server. Nothing starts
OrcaSlicer, a printer, a camera or a real Spoolman, and no test writes to one. The live checks are the manual
procedure in [live-run.md](live-run.md); until someone runs it, behaviour inside OrcaSlicer 2.5 is unverified.

OrcaSlicer's plugin API has no call to hide or merge tabs, so this plugin's tab (like Spooler's and U1 Control's)
stays a separate tab.
