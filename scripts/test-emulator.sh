#!/usr/bin/env bash
set -euo pipefail

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed. Install the RePebble SDK toolchain before running emulator tests." >&2
  exit 2
fi

echo "Emulator harness scaffold is present. Add scenario automation before enabling this in CI."

