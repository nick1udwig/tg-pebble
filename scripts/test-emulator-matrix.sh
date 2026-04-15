#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator matrix test" \
    bash scripts/test-emulator-matrix.sh "$@"
fi

env TG_PEBBLE_SESSION_GUARDED=1 TG_PEBBLE_ARTIFACT_PREFIX="basalt-success-" \
  bash scripts/test-emulator.sh basalt

env TG_PEBBLE_SESSION_GUARDED=1 TG_PEBBLE_ARTIFACT_PREFIX="aplite-read-only-" TG_PEBBLE_EMULATOR_SCENARIO=read-only \
  bash scripts/test-emulator.sh aplite

for error in connectivity disabled no-speech-detected; do
  env TG_PEBBLE_SESSION_GUARDED=1 \
    TG_PEBBLE_ARTIFACT_PREFIX="basalt-${error}-" \
    TG_PEBBLE_EMULATOR_SCENARIO=dictation-error \
    TG_PEBBLE_EMULATOR_DICTATION_ERROR="${error}" \
    bash scripts/test-emulator.sh basalt
done

echo "Emulator matrix passed."
