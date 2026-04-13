#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/run-emulator-safe.sh "$@"
fi

platform="${1:-basalt}"
fixture_mode="${TG_PEBBLE_FIXTURE_MODE:-1}"
vnc_mode="${TG_PEBBLE_EMULATOR_VNC:-1}"
reset_app_storage="${TG_PEBBLE_EMULATOR_RESET_APP_STORAGE:-}"

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed or not on PATH." >&2
  exit 2
fi

if ! command -v ss >/dev/null 2>&1; then
  echo "The 'ss' command is required to inspect local listening ports." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for emulator storage helpers." >&2
  exit 2
fi

if ! command -v xauth >/dev/null 2>&1; then
  echo "xauth is not installed. Install xauth if you need xvfb-run support." >&2
fi

headless_flags=()
if [[ -z "${DISPLAY:-}" ]]; then
  if [[ "${vnc_mode}" == "1" || "${vnc_mode}" == "true" ]]; then
    if command -v xvfb-run >/dev/null 2>&1; then
      echo "No DISPLAY detected. Starting the emulator under xvfb-run with VNC enabled."
      headless_flags=(xvfb-run -a)
    else
      echo "No DISPLAY detected and xvfb-run is unavailable." >&2
      echo "Install xvfb or run this script from a desktop session." >&2
      exit 2
    fi
  else
    echo "Window mode requires a desktop DISPLAY." >&2
    echo "Use VNC mode instead, or run this script from a desktop session." >&2
    exit 2
  fi
fi

echo "Launching emulator for platform: ${platform}"
if [[ "${fixture_mode}" == "1" || "${fixture_mode}" == "true" ]]; then
  echo "PKJS mode: fixture"
else
  echo "PKJS mode: live"
fi
if [[ "${vnc_mode}" == "1" || "${vnc_mode}" == "true" ]]; then
  echo "Display mode: VNC"
else
  echo "Display mode: window"
fi
echo "Keep this process running while you use the emulator."
echo "Use 'pebble kill' from another shell to stop it if needed."
echo

if [[ -z "${reset_app_storage}" ]]; then
  if [[ "${fixture_mode}" == "1" || "${fixture_mode}" == "true" ]]; then
    reset_app_storage=0
  else
    reset_app_storage=1
  fi
fi

if [[ "${reset_app_storage}" == "1" || "${reset_app_storage}" == "true" ]]; then
  ./scripts/reset-emulator-app-storage.sh "${platform}" >/dev/null
fi

if [[ "${fixture_mode}" != "1" && "${fixture_mode}" != "true" ]]; then
  python3 ./scripts/seed-emulator-telegram-config.py "${platform}"
fi

./scripts/build-telegram-runtime.sh >/dev/null
TG_PEBBLE_FIXTURE_MODE="${fixture_mode}" npm run build:pkjs-legacy >/dev/null
pebble build >/dev/null

emulator_args=(
  pebble install --emulator "${platform}" --logs --qemu_logs
)

if [[ "${vnc_mode}" == "1" || "${vnc_mode}" == "true" ]]; then
  emulator_args+=(--vnc)
fi

exec "${headless_flags[@]}" "${emulator_args[@]}"
