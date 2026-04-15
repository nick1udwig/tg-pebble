#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator baseline capture" \
    bash scripts/capture-baselines.sh "$@"
fi

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed. Cannot capture emulator baselines." >&2
  exit 2
fi

platform="${1:-basalt}"
baseline_dir="tests/emulator/baselines"
diff_dir="tests/emulator/artifacts/diffs"

mkdir -p "${baseline_dir}" "${diff_dir}"
rm -f "${baseline_dir}"/*.png
rm -f "${diff_dir}"/*.png

env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-matrix.sh
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-states.sh "${platform}"
env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-relaunch.sh "${platform}"

baseline_files=(
  "aplite-read-only-chat-list.png"
  "basalt-long-text-dictation-preview.png"
  "basalt-long-text-dictation-sent.png"
  "basalt-send-failure-dictation-preview.png"
  "basalt-send-failure-send-failed.png"
  "basalt-success-chat-list.png"
  "basalt-success-chat-open.png"
  "basalt-success-dictation-preview.png"
  "basalt-success-dictation-sent.png"
  "diorite-read-only-chat-list.png"
  "emery-read-only-chat-list.png"
  "flint-read-only-chat-list.png"
  "relaunch-basalt-cold-dictation-sent.png"
  "relaunch-basalt-warm-chat-open.png"
  "state-no-chats-yet-chat-list.png"
  "state-sign-in-failed-chat-list.png"
  "state-sign-in-required-chat-list.png"
)

for filename in "${baseline_files[@]}"; do
  if [[ ! -f "tests/emulator/artifacts/${filename}" ]]; then
    echo "Missing expected artifact for baseline capture: ${filename}" >&2
    exit 2
  fi
  cp "tests/emulator/artifacts/${filename}" "${baseline_dir}/${filename}"
done

echo "Captured ${#baseline_files[@]} emulator baseline image(s) into ${baseline_dir}."
