#!/usr/bin/env bash
# Build the wheel and install it into OrcaSlicer's plugin folder for this plugin only.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$(uname -s)" != "Darwin" ]; then
  # Only the macOS plugin folder has been checked against a real OrcaSlicer install (docs/spike.md).
  echo "dev-install.sh supports macOS only. On Linux/Windows copy dist/orca_print_calculator_any.whl into" >&2
  echo "<OrcaSlicer data dir>/orca_plugins/orca_print_calculator/ by hand." >&2
  exit 1
fi
dest="$HOME/Library/Application Support/OrcaSlicer/orca_plugins/orca_print_calculator"
python3 "$root/scripts/build.py"
mkdir -p "$dest"
rm -f "$dest"/*.whl
cp "$root/dist/orca_print_calculator_any.whl" "$dest/"
echo "installed to $dest"
