#!/usr/bin/env bash
set -euo pipefail

platform="${1:-basalt}"
timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"

exec bash scripts/session-guard.sh \
  pebble-emulator \
  "${timeout_seconds}" \
  "Pebble emulator (${platform})" \
  env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/run-emulator.sh "${platform}"
