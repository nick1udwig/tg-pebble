#!/usr/bin/env bash
set -euo pipefail

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed. Install the RePebble SDK toolchain before running emulator tests." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for emulator smoke tests." >&2
  exit 2
fi

session_file="build/tests/emulator-session.json"
chat_list_ppm="tests/emulator/artifacts/chat-list.ppm"
chat_open_ppm="tests/emulator/artifacts/chat-open.ppm"
chat_list_png="tests/emulator/artifacts/chat-list.png"
chat_open_png="tests/emulator/artifacts/chat-open.png"

cleanup() {
  bash scripts/stop-qemu-pkjs-session.sh "${session_file}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

mkdir -p tests/emulator/artifacts build/tests
pebble build >/dev/null
bash scripts/start-qemu-pkjs-session.sh basalt build/tg-pebble.pbw "${session_file}" >/dev/null

qemu_monitor_port="$(python3 - <<PY
import json
from pathlib import Path
session = json.loads(Path("${session_file}").read_text(encoding="utf-8"))
print(session["qemu_monitor_port"])
PY
)"

sleep 2
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_list_ppm}" >/dev/null
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey x s >/dev/null
sleep 1
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_open_ppm}" >/dev/null

/root/.local/share/uv/tools/pebble-tool/bin/python - <<PY
from PIL import Image
Image.open("${chat_list_ppm}").convert("RGBA").save("${chat_list_png}")
Image.open("${chat_open_ppm}").convert("RGBA").save("${chat_open_png}")
PY

test -s "${chat_list_png}"
test -s "${chat_open_png}"

echo "Emulator smoke test passed."
echo "Artifacts:"
echo "  ${chat_list_png}"
echo "  ${chat_open_png}"
