# Contributing

Bug reports and pull requests are welcome at <https://github.com/bloodf/orca_print_calculator>.

## Reporting a problem

Say which OrcaSlicer version, operating system and printer you use, what you did and what you saw. If plates or prices are wrong, attach the lines from `plugin.log` (in the plugin data folder) around the time it happened. The log never contains your Spoolman address.

## Changing the code

Setup, commands and how the UI and the Python host are kept in step are in [docs/development.md](docs/development.md). Before you open a pull request, run what CI runs:

```bash
pnpm -C ui install --frozen-lockfile
pnpm -C ui lint && pnpm -C ui typecheck && pnpm -C ui test:coverage
python3 scripts/gen_contract.py --check
python3 scripts/build.py
python3 -m unittest discover tests
```

A few rules the checks enforce or assume:

- The shared Orca UI foundation is the `@orca-plugins/ui-foundation` dependency, pinned to a tag of [bloodf/orca-ui-foundation](https://github.com/bloodf/orca-ui-foundation); change it there, and Renovate brings the new tag here.
- No colour literals in `ui/src`; use the `--oui-*` tokens ([brand/BRAND.md](brand/BRAND.md)).
- Every string in the page exists in English and Brazilian Portuguese.
- The built page stays under 1,010,000 bytes and runs under its Content-Security-Policy with no network access.
- Tests are mock-only. Do not add a test that needs OrcaSlicer, a printer or a real Spoolman server.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). User-visible changes get a line in [CHANGELOG.md](CHANGELOG.md) under "Unreleased". Releases are described in [docs/release.md](docs/release.md).

## License

By contributing you agree that your work is released under the [MIT license](LICENSE).

## Privacy

Keep the owner's private setup out of source, tests, fixtures, docs, commits,
branch names, issues, pull requests and comments. Do not include machine names,
home or worktree paths, private network details, service ports or hostnames,
thread and task IDs, personal email or provider accounts, quota or credit data,
device identifiers, Wi-Fi names, or secrets.

Use RFC 5737 addresses such as `192.0.2.10`, example domains, `printer-1`,
`<serial>`, and `$HOME/...`. Keep hardware findings and redact the identifying
details. Run `sh scripts/check-privacy.sh` before submitting changes.
