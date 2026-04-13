#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/run-emulator-safe.sh "$@"
fi

platform="${1:-basalt}"
fixture_mode="${TG_PEBBLE_FIXTURE_MODE:-1}"

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed or not on PATH." >&2
  exit 2
fi

if ! command -v ss >/dev/null 2>&1; then
  echo "The 'ss' command is required to inspect local listening ports." >&2
  exit 2
fi

if ! command -v xauth >/dev/null 2>&1; then
  echo "xauth is not installed. Install xauth if you need xvfb-run support." >&2
fi

headless_flags=()
if [[ -z "${DISPLAY:-}" ]]; then
  if command -v xvfb-run >/dev/null 2>&1; then
    echo "No DISPLAY detected. Starting the emulator under xvfb-run with VNC enabled."
    headless_flags=(xvfb-run -a)
  else
    echo "No DISPLAY detected and xvfb-run is unavailable." >&2
    echo "Install xvfb or run this script from a desktop session." >&2
    exit 2
  fi
fi

echo "Launching emulator for platform: ${platform}"
if [[ "${fixture_mode}" == "1" || "${fixture_mode}" == "true" ]]; then
  echo "PKJS mode: fixture"
else
  echo "PKJS mode: live"
fi
echo "Keep this process running while you use the emulator."
echo "Use 'pebble kill' from another shell to stop it if needed."
echo

./scripts/build-telegram-runtime.sh >/dev/null
TG_PEBBLE_FIXTURE_MODE="${fixture_mode}" npm run build:pkjs-legacy >/dev/null
pebble build >/dev/null

exec "${headless_flags[@]}" pebble install --emulator "${platform}" --vnc --logs --qemu_logs
