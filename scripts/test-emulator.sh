#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_PEBBLE_SESSION_GUARDED:-0}" != "1" ]]; then
  timeout_seconds="${TG_PEBBLE_EMULATOR_TIMEOUT_SECONDS:-1800}"
  exec env TG_PEBBLE_SESSION_GUARDED=1 bash scripts/session-guard.sh \
    pebble-emulator \
    "${timeout_seconds}" \
    "Pebble emulator smoke test" \
    bash scripts/test-emulator.sh "$@"
fi

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed. Install the RePebble SDK toolchain before running emulator tests." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for emulator smoke tests." >&2
  exit 2
fi

session_file="build/tests/emulator-session.json"
persist_dir="build/tests/emulator-persist"
chat_list_ppm="tests/emulator/artifacts/chat-list.ppm"
chat_open_ppm="tests/emulator/artifacts/chat-open.ppm"
dictation_listening_ppm="tests/emulator/artifacts/dictation-listening.ppm"
dictation_preview_ppm="tests/emulator/artifacts/dictation-preview.ppm"
dictation_sent_ppm="tests/emulator/artifacts/dictation-sent.ppm"
chat_list_png="tests/emulator/artifacts/chat-list.png"
chat_open_png="tests/emulator/artifacts/chat-open.png"
dictation_listening_png="tests/emulator/artifacts/dictation-listening.png"
dictation_preview_png="tests/emulator/artifacts/dictation-preview.png"
dictation_sent_png="tests/emulator/artifacts/dictation-sent.png"
transcribe_log="build/tests/transcribe.log"
transcribe_pid=""

cleanup() {
  if [[ -n "${transcribe_pid}" ]]; then
    kill "${transcribe_pid}" >/dev/null 2>&1 || true
  fi
  bash scripts/stop-qemu-pkjs-session.sh "${session_file}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

mkdir -p tests/emulator/artifacts build/tests
rm -rf "${persist_dir}"
rm -f "${transcribe_log}" "${chat_list_ppm}" "${chat_open_ppm}" "${dictation_listening_ppm}" \
  "${dictation_preview_ppm}" "${dictation_sent_ppm}" "${chat_list_png}" "${chat_open_png}" \
  "${dictation_listening_png}" "${dictation_preview_png}" "${dictation_sent_png}"
pebble build >/dev/null
bash scripts/start-qemu-pkjs-session.sh basalt build/tg-pebble.pbw "${session_file}" "${persist_dir}" >/dev/null

qemu_monitor_port="$(python3 - <<PY
import json
from pathlib import Path
session = json.loads(Path("${session_file}").read_text(encoding="utf-8"))
print(session["qemu_monitor_port"])
PY
)"

qemu_port="$(python3 - <<PY
import json
from pathlib import Path
session = json.loads(Path("${session_file}").read_text(encoding="utf-8"))
print(session["qemu_port"])
PY
)"

sleep 2
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_list_ppm}" >/dev/null
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey x s >/dev/null
sleep 1
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_open_ppm}" >/dev/null

pebble transcribe "Hello Pebble" --qemu "localhost:${qemu_port}" -vvvv >"${transcribe_log}" 2>&1 &
transcribe_pid=$!
sleep 1
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey s >/dev/null
sleep 2
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_listening_ppm}" >/dev/null
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey s >/dev/null
sleep 3
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_preview_ppm}" >/dev/null
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey s >/dev/null
sleep 2
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_sent_ppm}" >/dev/null

kill "${transcribe_pid}" >/dev/null 2>&1 || true
transcribe_pid=""

/root/.local/share/uv/tools/pebble-tool/bin/python - <<PY
from PIL import Image
Image.open("${chat_list_ppm}").convert("RGBA").save("${chat_list_png}")
Image.open("${chat_open_ppm}").convert("RGBA").save("${chat_open_png}")
Image.open("${dictation_listening_ppm}").convert("RGBA").save("${dictation_listening_png}")
Image.open("${dictation_preview_ppm}").convert("RGBA").save("${dictation_preview_png}")
Image.open("${dictation_sent_ppm}").convert("RGBA").save("${dictation_sent_png}")
PY

test -s "${chat_list_png}"
test -s "${chat_open_png}"
test -s "${dictation_listening_png}"
test -s "${dictation_preview_png}"
test -s "${dictation_sent_png}"
grep -q "VoiceControlCommand(command=1" "${transcribe_log}"
grep -q "Sending dictation result" "${transcribe_log}"
grep -q "AppMessage(command=1, transaction_id=" "${transcribe_log}"

echo "Emulator smoke test passed."
echo "Artifacts:"
echo "  ${chat_list_png}"
echo "  ${chat_open_png}"
echo "  ${dictation_listening_png}"
echo "  ${dictation_preview_png}"
echo "  ${dictation_sent_png}"
