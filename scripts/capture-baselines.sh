#!/usr/bin/env bash
set -euo pipefail

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed. Cannot capture emulator baselines." >&2
  exit 2
fi

echo "Baseline capture scaffold is present. Hook this script up to emulator scenarios and pebble screenshot."

