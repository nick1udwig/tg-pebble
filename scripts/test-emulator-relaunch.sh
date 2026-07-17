#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator relaunch test" \
    bash scripts/test-emulator-relaunch.sh "$@"
fi

platform="${1:-basalt}"
persist_dir="build/tests/relaunch-${platform}-persist"
message_text="Warm relaunch"

env TG_PEBBLE_SESSION_GUARDED=1 \
  TG_PEBBLE_ARTIFACT_PREFIX="relaunch-${platform}-cold-" \
  TG_PEBBLE_EMULATOR_CHAT_ID=1001 \
  TG_PEBBLE_EMULATOR_PERSIST_DIR="${persist_dir}" \
  TG_PEBBLE_EMULATOR_RESET_PERSIST=1 \
  TG_PEBBLE_EMULATOR_DICTATION_TEXT="${message_text}" \
  bash scripts/test-emulator.sh "${platform}"

env TG_PEBBLE_SESSION_GUARDED=1 \
  TG_PEBBLE_ARTIFACT_PREFIX="relaunch-${platform}-warm-" \
  TG_PEBBLE_EMULATOR_CHAT_ID=1001 \
  TG_PEBBLE_EMULATOR_PERSIST_DIR="${persist_dir}" \
  TG_PEBBLE_EMULATOR_RESET_PERSIST=0 \
  TG_PEBBLE_EMULATOR_SCENARIO=read-only \
  TG_PEBBLE_EXPECTED_PREVIEW="${message_text}" \
  TG_PEBBLE_EXPECTED_MESSAGE_TEXT="${message_text}" \
  bash scripts/test-emulator.sh "${platform}"

echo "Emulator relaunch test passed (${platform})."
