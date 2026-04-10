#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <lock-name> <timeout-seconds> <session-name> <command> [args...]" >&2
  exit 2
fi

lock_name="$1"
timeout_seconds="$2"
session_name="$3"
shift 3

lock_dir="${TG_PEBBLE_LOCK_DIR:-/tmp/tg-pebble-locks}"
mkdir -p "${lock_dir}"

lock_path="${lock_dir}/${lock_name}.lock"
meta_path="${lock_dir}/${lock_name}.meta"
pgid_path="${lock_dir}/${lock_name}.pgid"

cleanup() {
  local exit_code="${1:-0}"

  if [[ -f "${pgid_path}" ]]; then
    local pgid
    pgid="$(cat "${pgid_path}" 2>/dev/null || true)"
    if [[ -n "${pgid}" ]]; then
      kill -- -"${pgid}" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "${meta_path}" "${pgid_path}"
  exit "${exit_code}"
}

exec 9>"${lock_path}"
if ! flock -n 9; then
  echo "Refusing to start ${session_name}: another session already holds ${lock_name}." >&2
  if [[ -f "${meta_path}" ]]; then
    echo "Active lock owner:" >&2
    cat "${meta_path}" >&2 || true
  fi
  exit 1
fi

{
  echo "session=${session_name}"
  echo "pid=$$"
  echo "host=$(hostname 2>/dev/null || echo unknown)"
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "cwd=$(pwd)"
  printf "command="
  printf '%q ' "$@"
  printf '\n'
} > "${meta_path}"

(
  trap 'exit 0' TERM INT
  sleep "${timeout_seconds}"
  echo "Timed out ${session_name} after ${timeout_seconds}s. Killing its process group." >&2
  if [[ -f "${pgid_path}" ]]; then
    pgid="$(cat "${pgid_path}" 2>/dev/null || true)"
    if [[ -n "${pgid}" ]]; then
      kill -- -"${pgid}" >/dev/null 2>&1 || true
      sleep 2
      kill -KILL -- -"${pgid}" >/dev/null 2>&1 || true
    fi
  fi
) &
watchdog_pid=$!

trap 'kill "${watchdog_pid}" >/dev/null 2>&1 || true; cleanup 130' INT TERM

set +e
setsid "$@" &
child_pid=$!
pgid="$(ps -o pgid= -p "${child_pid}" | tr -d ' ')"
echo "${pgid}" > "${pgid_path}"
wait "${child_pid}"
exit_code=$?
set -e

kill "${watchdog_pid}" >/dev/null 2>&1 || true
cleanup "${exit_code}"
