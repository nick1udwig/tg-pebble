#!/usr/bin/env bash
set -Eeuo pipefail

soak_iterations="${TG_PEBBLE_SOAK_ITERATIONS:-2}"
soak_platform="${TG_PEBBLE_SOAK_PLATFORM:-basalt}"
state_platform="${TG_PEBBLE_STATE_PLATFORM:-basalt}"
relaunch_platform="${TG_PEBBLE_RELAUNCH_PLATFORM:-basalt}"

current_step=""

report_failure() {
  local exit_code="$1"
  local failed_command="$2"
  local failed_line="$3"
  if [[ -n "${current_step}" ]]; then
    echo "ERROR: pre-release gate failed during: ${current_step}" >&2
  fi
  echo "ERROR: command failed at line ${failed_line}: ${failed_command}" >&2
  exit "${exit_code}"
}

trap 'report_failure $? "$BASH_COMMAND" "$LINENO"' ERR

run_step() {
  current_step="$1"
  shift
  printf '\n==> %s\n' "${current_step}"
  "$@"
}

run_step "JS tests" npm run test:js
run_step "Telegram schema metadata" npm run check:tl-schema
run_step "C tests" npm run test:c
run_step "Config-page tests" npm run test:config
run_step "Emulator matrix" env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-matrix.sh
run_step "Emulator zero-state coverage" env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-states.sh "${state_platform}"
run_step "Emulator relaunch coverage" env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-relaunch.sh "${relaunch_platform}"
run_step "Visual diff review" bash scripts/review-visual-diffs.sh
run_step "Emulator soak" env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/test-emulator-soak.sh "${soak_iterations}" "${soak_platform}"

if [[ "${TG_PEBBLE_RUN_LIVE_RELEASE_CHECKS:-0}" == "1" ]]; then
  run_step "Live Telegram checks" npm run test:telegram
fi

echo "Pre-release local test pass completed."
