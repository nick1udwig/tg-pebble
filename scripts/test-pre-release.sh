#!/usr/bin/env bash
set -euo pipefail

soak_iterations="${TG_PEBBLE_SOAK_ITERATIONS:-2}"
soak_platform="${TG_PEBBLE_SOAK_PLATFORM:-basalt}"
state_platform="${TG_PEBBLE_STATE_PLATFORM:-basalt}"
relaunch_platform="${TG_PEBBLE_RELAUNCH_PLATFORM:-basalt}"

npm run test:js
npm run test:c
npm run test:config
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-matrix.sh
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-states.sh "${state_platform}"
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-relaunch.sh "${relaunch_platform}"
bash scripts/review-visual-diffs.sh
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-soak.sh "${soak_iterations}" "${soak_platform}"

if [[ "${TG_PEBBLE_RUN_LIVE_RELEASE_CHECKS:-0}" == "1" ]]; then
  npm run test:telegram
fi

echo "Pre-release local test pass completed."
