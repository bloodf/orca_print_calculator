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
  bundle size (900,000 B), Python tests.
- `dist/SHA256SUMS` matches the wheel, and the wheel's metadata and `VERSION` equal the version.
- `CHANGELOG.md` has a non-empty `## [X.Y.Z] - date` section. It becomes the GitHub release notes (when empty)
  and the Orca Cloud changelog. Orca Cloud keeps at most 4000 characters, so `scripts/release_notes.py` cuts the
  copy it sends at a line boundary and adds a link to the release page.
- The OIDC token is masked in the log. No secret is stored in the repository.

## Prerequisites (outside the repository)

1. On Orca Cloud: the plugin is connected to this repository under Edit plugin > GitHub publishing (one repository
   publishes to exactly one plugin; the plugin page is listed in `brand/hub-listing.md`). A 401 from the publish
   step means this is missing.
2. The version is higher than the one the hub lists (0.1.1 when last checked, 2026-11-11).
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
  this), and the toolchain is pinned in the workflow (Node 24.22.2, pnpm 12.18.0, Python 3.12, `--frozen-lockfile`),
  but a build on another OS is not guaranteed to match byte for byte: compare it, and treat a difference as
  something to explain, not as a failed release.
- The hub page lists the new version and changelog. Subscribing and enabling the plugin inside OrcaSlicer is
  the live check in [live-run.md](live-run.md).

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
