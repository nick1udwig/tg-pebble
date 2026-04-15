#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator visual regression test" \
    bash scripts/test-emulator-visual.sh "$@"
fi

platform="${1:-basalt}"

env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-matrix.sh
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-states.sh "${platform}"
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-relaunch.sh "${platform}"
bash scripts/review-visual-diffs.sh

echo "Emulator visual regression pass completed."
