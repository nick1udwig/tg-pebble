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

platform="${1:-basalt}"
scenario="${TG_PEBBLE_EMULATOR_SCENARIO:-}"
dictation_error="${TG_PEBBLE_EMULATOR_DICTATION_ERROR:-}"
dictation_text="${TG_PEBBLE_EMULATOR_DICTATION_TEXT:-Hello Pebble}"
artifact_prefix="${TG_PEBBLE_ARTIFACT_PREFIX:-}"

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed. Install the RePebble SDK toolchain before running emulator tests." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for emulator smoke tests." >&2
  exit 2
fi

supports_dictation=1
if [[ "${platform}" == "aplite" ]]; then
  supports_dictation=0
fi

if [[ -z "${scenario}" ]]; then
  if [[ -n "${dictation_error}" ]]; then
    scenario="dictation-error"
  elif [[ "${supports_dictation}" == "1" ]]; then
    scenario="dictation-success"
  else
    scenario="read-only"
  fi
fi

case "${scenario}" in
  read-only|dictation-success|dictation-error)
    ;;
  *)
    echo "Unsupported emulator scenario: ${scenario}" >&2
    exit 2
    ;;
esac

if [[ "${scenario}" != "read-only" && "${supports_dictation}" != "1" ]]; then
  echo "Platform ${platform} does not support dictation in the emulator harness." >&2
  exit 2
fi

if [[ "${scenario}" == "dictation-error" && -z "${dictation_error}" ]]; then
  echo "TG_PEBBLE_EMULATOR_DICTATION_ERROR is required for dictation-error scenarios." >&2
  exit 2
fi

pebble_python="${TG_PEBBLE_TOOL_PYTHON:-$(head -n 1 "$(command -v pebble)" | sed 's/^#!//')}"

session_file="build/tests/${artifact_prefix}emulator-session.json"
persist_dir="build/tests/${artifact_prefix}emulator-persist"
artifact_dir="tests/emulator/artifacts"
artifact_base="${artifact_dir}/${artifact_prefix}"
chat_list_ppm="${artifact_base}chat-list.ppm"
chat_open_ppm="${artifact_base}chat-open.ppm"
dictation_listening_ppm="${artifact_base}dictation-listening.ppm"
dictation_preview_ppm="${artifact_base}dictation-preview.ppm"
dictation_sent_ppm="${artifact_base}dictation-sent.ppm"
dictation_failed_ppm="${artifact_base}dictation-failed.ppm"
chat_list_png="${artifact_base}chat-list.png"
chat_open_png="${artifact_base}chat-open.png"
dictation_listening_png="${artifact_base}dictation-listening.png"
dictation_preview_png="${artifact_base}dictation-preview.png"
dictation_sent_png="${artifact_base}dictation-sent.png"
dictation_failed_png="${artifact_base}dictation-failed.png"
transcribe_log="build/tests/${artifact_prefix}transcribe.log"
transcribe_pid=""

cleanup() {
  if [[ -n "${transcribe_pid}" ]]; then
    kill "${transcribe_pid}" >/dev/null 2>&1 || true
  fi
  bash scripts/stop-qemu-pkjs-session.sh "${session_file}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

mkdir -p "${artifact_dir}" build/tests
rm -rf "${persist_dir}"
rm -f "${transcribe_log}" \
  "${chat_list_ppm}" "${chat_open_ppm}" \
  "${dictation_listening_ppm}" "${dictation_preview_ppm}" "${dictation_sent_ppm}" "${dictation_failed_ppm}" \
  "${chat_list_png}" "${chat_open_png}" \
  "${dictation_listening_png}" "${dictation_preview_png}" "${dictation_sent_png}" "${dictation_failed_png}"
./scripts/build-telegram-runtime.sh >/dev/null
TG_PEBBLE_FIXTURE_MODE=1 npm run build:pkjs-legacy >/dev/null
pebble build >/dev/null
bash scripts/start-qemu-pkjs-session.sh "${platform}" build/tg-pebble.pbw "${session_file}" "${persist_dir}" >/dev/null

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

app_uuid="$(python3 - <<PY
import json
from pathlib import Path
app_info = json.loads(Path("appinfo.json").read_text(encoding="utf-8"))
print(app_info["uuid"])
PY
)"

sleep 2
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_list_ppm}" >/dev/null
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey x s >/dev/null
sleep 1
python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_open_ppm}" >/dev/null

if [[ "${scenario}" == "dictation-success" ]]; then
  pebble transcribe "${dictation_text}" --qemu "localhost:${qemu_port}" -vvvv >"${transcribe_log}" 2>&1 &
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
elif [[ "${scenario}" == "dictation-error" ]]; then
  pebble transcribe --error "${dictation_error}" --qemu "localhost:${qemu_port}" -vvvv >"${transcribe_log}" 2>&1 &
  transcribe_pid=$!
  sleep 1
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" sendkey s >/dev/null
  sleep 3
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_failed_ppm}" >/dev/null
fi

if [[ -n "${transcribe_pid}" ]]; then
  kill "${transcribe_pid}" >/dev/null 2>&1 || true
  wait "${transcribe_pid}" >/dev/null 2>&1 || true
  transcribe_pid=""
fi

"${pebble_python}" - <<PY
from pathlib import Path
from PIL import Image

pairs = [
    (Path("${chat_list_ppm}"), Path("${chat_list_png}")),
    (Path("${chat_open_ppm}"), Path("${chat_open_png}")),
    (Path("${dictation_listening_ppm}"), Path("${dictation_listening_png}")),
    (Path("${dictation_preview_ppm}"), Path("${dictation_preview_png}")),
    (Path("${dictation_sent_ppm}"), Path("${dictation_sent_png}")),
    (Path("${dictation_failed_ppm}"), Path("${dictation_failed_png}")),
]

for source, target in pairs:
    if source.exists():
        Image.open(source).convert("RGBA").save(target)
PY

test -s "${chat_list_png}"
test -s "${chat_open_png}"

if [[ "${scenario}" == "dictation-success" ]]; then
  test -s "${dictation_listening_png}"
  test -s "${dictation_preview_png}"
  test -s "${dictation_sent_png}"
  grep -q "VoiceControlCommand(command=1" "${transcribe_log}"
  grep -q "Sending dictation result" "${transcribe_log}"
  grep -q "AppMessage(command=1, transaction_id=" "${transcribe_log}"
elif [[ "${scenario}" == "dictation-error" ]]; then
  test -s "${dictation_failed_png}"
  test -s "${transcribe_log}"
fi

python3 - <<PY
import dbm.dumb
import json
import re
from pathlib import Path

scenario = "${scenario}"
dictation_text = "${dictation_text}"
dictation_error = "${dictation_error}"
store = dbm.dumb.open(str(Path("${persist_dir}") / "localstorage" / "${app_uuid}"), "r")
try:
    decoder = json.JSONDecoder()
    chat_text = store[b"tg_pebble:chat_list"].decode("utf-8")
    chats, _ = decoder.raw_decode(chat_text)
    message_pages_text = store[b"tg_pebble:message_pages"].decode("utf-8")
finally:
    store.close()

chat = next((entry for entry in chats if entry.get("id") == 2001), None)
if not chat:
    raise SystemExit("Missing fixture chat 2001 after emulator smoke test.")

message_match = re.search(
    r'"2001":\[(?P<messages>.*?)\],"3001":\[',
    message_pages_text,
    re.DOTALL,
)
if not message_match:
    raise SystemExit("Could not isolate fixture message page 2001 from emulator storage.")

messages_blob = message_match.group("messages")

if scenario == "read-only":
    if chat.get("preview") != "Bob: brunch at 10?":
        raise SystemExit(f"Expected unchanged preview for read-only run, got {chat.get('preview')!r}")
    if '"text":"Brunch at 10?"' not in messages_blob:
        raise SystemExit("Missing expected fixture message in read-only chat page.")
elif scenario == "dictation-success":
    if chat.get("preview") != dictation_text:
        raise SystemExit(f"Expected updated preview {dictation_text!r}, got {chat.get('preview')!r}")
    if f'"text":"{dictation_text}"' not in messages_blob or '"outgoing":true' not in messages_blob:
        raise SystemExit("Expected outgoing dictation message in fixture message page 2001 after send.")
elif scenario == "dictation-error":
    if chat.get("preview") != "Bob: brunch at 10?":
        raise SystemExit(f"Expected preview to remain unchanged after {dictation_error}, got {chat.get('preview')!r}")
    if f'"text":"{dictation_text}"' in messages_blob:
        raise SystemExit(f"Dictation failure {dictation_error} unexpectedly appended {dictation_text!r} to chat history.")
else:
    raise SystemExit(f"Unhandled scenario {scenario!r}")
PY

echo "Emulator smoke test passed."
echo "  platform: ${platform}"
echo "  scenario: ${scenario}"
echo "Artifacts:"
echo "  ${chat_list_png}"
echo "  ${chat_open_png}"
if [[ -f "${dictation_listening_png}" ]]; then
  echo "  ${dictation_listening_png}"
fi
if [[ -f "${dictation_preview_png}" ]]; then
  echo "  ${dictation_preview_png}"
fi
if [[ -f "${dictation_sent_png}" ]]; then
  echo "  ${dictation_sent_png}"
fi
if [[ -f "${dictation_failed_png}" ]]; then
  echo "  ${dictation_failed_png}"
fi
