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

long_text="This is a deliberately long dictation sample for the Pebble emulator harness so we can verify watch safe truncation without breaking chat rendering."
export TG_PEBBLE_EMULATOR_CHAT_ID="${TG_PEBBLE_EMULATOR_CHAT_ID:-1001}"

expected_long_send_text="$(TG_PEBBLE_LONG_TEXT="${long_text}" node - <<'NODE'
const { truncateUtf8 } = require('./src/pkjs/lib/protocol.js');
process.stdout.write(truncateUtf8(process.env.TG_PEBBLE_LONG_TEXT || "", 95));
NODE
)"
env TG_PEBBLE_SESSION_GUARDED=1 TG_PEBBLE_ARTIFACT_PREFIX="basalt-success-" \
  bash scripts/test-emulator.sh basalt

env TG_PEBBLE_SESSION_GUARDED=1 \
  TG_PEBBLE_ARTIFACT_PREFIX="basalt-send-failure-" \
  TG_PEBBLE_EMULATOR_SCENARIO=send-failure \
  TG_PEBBLE_EMULATOR_DICTATION_TEXT="please fail this send" \
  bash scripts/test-emulator.sh basalt

env TG_PEBBLE_SESSION_GUARDED=1 \
  TG_PEBBLE_ARTIFACT_PREFIX="basalt-long-text-" \
  TG_PEBBLE_EMULATOR_DICTATION_TEXT="${long_text}" \
  TG_PEBBLE_SKIP_STORAGE_ASSERT=1 \
  TG_PEBBLE_EXPECTED_SEND_TEXT="${expected_long_send_text}" \
  bash scripts/test-emulator.sh basalt

for platform in aplite diorite emery flint; do
  env TG_PEBBLE_SESSION_GUARDED=1 \
    TG_PEBBLE_ARTIFACT_PREFIX="${platform}-read-only-" \
    TG_PEBBLE_EMULATOR_SCENARIO=read-only \
    bash scripts/test-emulator.sh "${platform}"
done

for error in connectivity disabled no-speech-detected; do
  env TG_PEBBLE_SESSION_GUARDED=1 \
    TG_PEBBLE_ARTIFACT_PREFIX="basalt-${error}-" \
    TG_PEBBLE_EMULATOR_SCENARIO=dictation-error \
    TG_PEBBLE_EMULATOR_DICTATION_ERROR="${error}" \
    bash scripts/test-emulator.sh basalt
done

echo "Emulator matrix passed."
