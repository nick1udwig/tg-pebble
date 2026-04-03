#!/usr/bin/env bash
set -euo pipefail

session_file="${1:-build/tests/emulator-session.json}"

if [[ ! -f "${session_file}" ]]; then
  echo "No session file found at ${session_file}." >&2
  exit 0
fi

python3 - <<PY
import json
import os
import signal
from pathlib import Path

session_path = Path("${session_file}")
session = json.loads(session_path.read_text(encoding="utf-8"))

for key in ("pkjs_pid", "qemu_pid"):
    pid = session.get(key)
    if not pid:
        continue
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass

state_path = Path(f"/tmp/pb-qemu-pypkjs-{session.get('qemu_port')}.json")
for path in (state_path, session_path):
    try:
        path.unlink()
    except FileNotFoundError:
        pass
PY
