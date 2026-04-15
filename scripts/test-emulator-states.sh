#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator zero-state test" \
    bash scripts/test-emulator-states.sh "$@"
fi

platform="${1:-basalt}"

for state_name in sign-in-required sign-in-failed no-chats-yet; do
  env TG_PEBBLE_SESSION_GUARDED=1 \
    TG_PEBBLE_ARTIFACT_PREFIX="state-${state_name}-" \
    TG_PEBBLE_EMULATOR_SCENARIO=zero-state \
    TG_PEBBLE_EMULATOR_STATE_NAME="${state_name}" \
    bash scripts/test-emulator.sh "${platform}"
done

echo "Emulator zero-state matrix passed (${platform})."
