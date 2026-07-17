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


def read_process_stat(pid):
    text = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8", errors="replace")
    fields = text[text.rfind(")") + 2 :].split()
    return fields[0], int(fields[2])


def is_running(pid):
    try:
        state, _process_group = read_process_stat(pid)
        if state == "Z":
            return False
    except (FileNotFoundError, ProcessLookupError):
        return False
    except OSError:
        pass

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


def process_group_is_running(pgid):
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            state, process_group = read_process_stat(int(entry.name))
        except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError):
            continue
        if process_group == pgid and state != "Z":
            return True
    return False


def terminate_process_group(pgid, timeout_seconds=5.0):
    if not pgid:
        return

    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not process_group_is_running(pgid):
            return
        time.sleep(0.1)

    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        return

    deadline = time.time() + 2.0
    while time.time() < deadline:
        if not process_group_is_running(pgid):
            return
        time.sleep(0.05)


terminate(session.get("pkjs_pid"))
if session.get("qemu_pgid"):
    terminate_process_group(session["qemu_pgid"])
else:
    terminate(session.get("qemu_pid"))

state_path = Path(f"/tmp/pb-qemu-pypkjs-{session.get('qemu_port')}.json")
for path in (state_path, session_path):
    try:
        path.unlink()
    except FileNotFoundError:
        pass
PY2
