#!/usr/bin/env bash
set -euo pipefail

session_file="${1:-build/tests/emulator-session.json}"

if [[ ! -f "${session_file}" ]]; then
  echo "No session file found at ${session_file}." >&2
  exit 0
fi

python3 - <<PY2
import json
import os
import signal
import time
from pathlib import Path

session_path = Path("${session_file}")
session = json.loads(session_path.read_text(encoding="utf-8"))


def is_running(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def terminate(pid, timeout_seconds=5.0):
    if not pid:
        return

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not is_running(pid):
            return
        time.sleep(0.1)

    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return

    deadline = time.time() + 2.0
    while time.time() < deadline:
        if not is_running(pid):
            return
        time.sleep(0.05)


terminate(session.get("pkjs_pid"))
terminate(session.get("qemu_pid"))

state_path = Path(f"/tmp/pb-qemu-pypkjs-{session.get('qemu_port')}.json")
for path in (state_path, session_path):
    try:
        path.unlink()
    except FileNotFoundError:
        pass
PY2
