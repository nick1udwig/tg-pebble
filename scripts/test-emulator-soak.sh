#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator soak test" \
    bash scripts/test-emulator-soak.sh "$@"
fi

iterations="${1:-2}"
platform="${2:-basalt}"

case "${iterations}" in
  ''|*[!0-9]*)
    echo "Iterations must be a positive integer." >&2
    exit 2
    ;;
esac

if [[ "${iterations}" == "0" ]]; then
  echo "Iterations must be greater than zero." >&2
  exit 2
fi

for iteration in $(seq 1 "${iterations}"); do
  echo "Soak iteration ${iteration}/${iterations} (${platform})"
  env TG_PEBBLE_SESSION_GUARDED=1 TG_PEBBLE_ARTIFACT_PREFIX="soak-${platform}-${iteration}-" \
    bash scripts/test-emulator.sh "${platform}"
done

echo "Emulator soak passed (${iterations} iterations on ${platform})."
