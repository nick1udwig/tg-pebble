#!/usr/bin/env bash
set -euo pipefail

lock_dir="${TG_PEBBLE_LOCK_DIR:-/tmp/tg-pebble-locks}"

if [[ -d "${lock_dir}" ]]; then
  while IFS= read -r pgid_file; do
    pgid="$(cat "${pgid_file}" 2>/dev/null || true)"
    if [[ -n "${pgid}" ]]; then
      kill -- -"${pgid}" >/dev/null 2>&1 || true
      sleep 1
      kill -KILL -- -"${pgid}" >/dev/null 2>&1 || true
    fi
  done < <(find "${lock_dir}" -maxdepth 1 -name '*.pgid' -type f | sort)

  rm -f "${lock_dir}"/*.meta "${lock_dir}"/*.pgid "${lock_dir}"/*.lock
fi

pkill -f 'qemu-pebble|pypkjs|pebble install --emulator|pebble transcribe|agent-browser' >/dev/null 2>&1 || true

echo "Cleaned TG Pebble dev sessions."
