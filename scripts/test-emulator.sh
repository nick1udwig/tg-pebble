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
state_name="${TG_PEBBLE_EMULATOR_STATE_NAME:-}"
dictation_error="${TG_PEBBLE_EMULATOR_DICTATION_ERROR:-}"
dictation_text="${TG_PEBBLE_EMULATOR_DICTATION_TEXT:-Hello Pebble}"
artifact_prefix="${TG_PEBBLE_ARTIFACT_PREFIX:-}"
reset_persist="${TG_PEBBLE_EMULATOR_RESET_PERSIST:-1}"
persist_dir_override="${TG_PEBBLE_EMULATOR_PERSIST_DIR:-}"
expected_preview="${TG_PEBBLE_EXPECTED_PREVIEW:-}"
expected_message_text="${TG_PEBBLE_EXPECTED_MESSAGE_TEXT:-}"
expected_send_text="${TG_PEBBLE_EXPECTED_SEND_TEXT:-}"
target_chat_id="${TG_PEBBLE_EMULATOR_CHAT_ID:-2001}"
skip_storage_assert="${TG_PEBBLE_SKIP_STORAGE_ASSERT:-0}"
dictation_error_settle_seconds="${TG_PEBBLE_DICTATION_ERROR_SETTLE_SECONDS:-5}"
fixture_mode="1"
skip_app_install="0"

case "${target_chat_id}" in
  1001)
    fixture_preview="See you soon"
    fixture_message_text="Still on for tonight?"
    ;;
  2001)
    fixture_preview="Bob: brunch at 10?"
    fixture_message_text="Brunch at 10?"
    ;;
  *)
    fixture_preview=""
    fixture_message_text=""
    ;;
esac

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
  read-only|dictation-success|dictation-error|send-failure|zero-state)
    ;;
  *)
    echo "Unsupported emulator scenario: ${scenario}" >&2
    exit 2
    ;;
esac

if [[ "${scenario}" != "read-only" && "${scenario}" != "zero-state" && "${supports_dictation}" != "1" ]]; then
  echo "Platform ${platform} does not support dictation in the emulator harness." >&2
  exit 2
fi

if [[ "${scenario}" == "dictation-error" && -z "${dictation_error}" ]]; then
  echo "TG_PEBBLE_EMULATOR_DICTATION_ERROR is required for dictation-error scenarios." >&2
  exit 2
fi

if [[ "${scenario}" == "zero-state" && -z "${state_name}" ]]; then
  echo "TG_PEBBLE_EMULATOR_STATE_NAME is required for zero-state scenarios." >&2
  exit 2
fi

if [[ "${scenario}" == "zero-state" ]]; then
  fixture_mode="0"
  skip_app_install="1"
fi


pebble_python="${TG_PEBBLE_TOOL_PYTHON:-$(head -n 1 "$(command -v pebble)" | sed 's/^#!//')}"

session_file="build/tests/${artifact_prefix}emulator-session.json"
pkjs_log="${session_file%.json}.pkjs.log"
persist_dir="${persist_dir_override:-build/tests/${artifact_prefix}emulator-persist}"
artifact_dir="tests/emulator/artifacts"
artifact_base="${artifact_dir}/${artifact_prefix}"
chat_list_ppm="${artifact_base}chat-list.ppm"
chat_open_ppm="${artifact_base}chat-open.ppm"
dictation_listening_ppm="${artifact_base}dictation-listening.ppm"
dictation_preview_ppm="${artifact_base}dictation-preview.ppm"
dictation_sent_ppm="${artifact_base}dictation-sent.ppm"
dictation_failed_ppm="${artifact_base}dictation-failed.ppm"
send_failed_ppm="${artifact_base}send-failed.ppm"
chat_list_png="${artifact_base}chat-list.png"
chat_open_png="${artifact_base}chat-open.png"
dictation_listening_png="${artifact_base}dictation-listening.png"
dictation_preview_png="${artifact_base}dictation-preview.png"
dictation_sent_png="${artifact_base}dictation-sent.png"
dictation_failed_png="${artifact_base}dictation-failed.png"
send_failed_png="${artifact_base}send-failed.png"
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
if [[ "${reset_persist}" == "1" || "${reset_persist}" == "true" ]]; then
  rm -rf "${persist_dir}"
fi
rm -f "${transcribe_log}" \
  "${chat_list_ppm}" "${chat_open_ppm}" \
  "${dictation_listening_ppm}" "${dictation_preview_ppm}" "${dictation_sent_ppm}" "${dictation_failed_ppm}" "${send_failed_ppm}" \
  "${chat_list_png}" "${chat_open_png}" \
  "${dictation_listening_png}" "${dictation_preview_png}" "${dictation_sent_png}" "${dictation_failed_png}" "${send_failed_png}"
TG_PEBBLE_FIXTURE_MODE="${fixture_mode}" npm run build:pkjs-legacy >/dev/null
pebble build >/dev/null
env TG_PEBBLE_SKIP_APP_INSTALL="${skip_app_install}" \
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

click_emulator_button() {
  local button="$1"
  local duration_ms="${2:-200}"

  pebble emu-button --qemu "localhost:${qemu_port}" click "${button}" \
    --duration "${duration_ms}" >/dev/null
}

wait_for_chat_list_ready() {
  local screenshot_path="$1"
  local attempts="${2:-${TG_PEBBLE_CHAT_LIST_READY_ATTEMPTS:-80}}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${screenshot_path}" >/dev/null
    if "${pebble_python}" - "${screenshot_path}" "${platform}" <<'PY'
import sys
from PIL import Image

path, platform = sys.argv[1:]
target_width, target_height = (200, 228) if platform == "emery" else (144, 168)
image = Image.open(path).convert("RGB")
width, height = image.size

if width < target_width or height < target_height:
    raise SystemExit(1)

left = (width - target_width) // 2
top = (height - target_height) // 2
image = image.crop((left, top, left + target_width, top + target_height))
header_height = min(15, target_height)
dark_header_pixels = sum(
    1
    for y in range(header_height)
    for x in range(target_width)
    if max(image.getpixel((x, y))) < 64
)
light_body_pixels = sum(
    1
    for y in range(header_height, target_height)
    for x in range(target_width)
    if max(image.getpixel((x, y))) > 128
)

# A populated fixture list selects its first chat, filling most of the top
# row black, while the list body remains light. The loading and zero-state
# screens retain a gray section header; the earliest boot frames are all black.
minimum_dark_pixels = target_width * header_height // 2
minimum_light_pixels = target_width * (target_height - header_height) // 4
raise SystemExit(
    0
    if dark_header_pixels >= minimum_dark_pixels and light_body_pixels >= minimum_light_pixels
    else 1
)
PY
    then
      return 0
    fi
    sleep 0.25
  done

  echo "Timed out waiting for the fixture chat list on ${platform}." >&2
  return 1
}

wait_for_dictation_preview() {
  local screenshot_path="$1"
  local attempts="${2:-24}"
  local stable_screenshot_path="${screenshot_path%.ppm}-stable.ppm"

  rm -f "${stable_screenshot_path}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${screenshot_path}" >/dev/null
    if "${pebble_python}" - "${screenshot_path}" "${platform}" <<'PY'
import sys
from PIL import Image

path, platform = sys.argv[1:]
target_width, target_height = (200, 228) if platform == "emery" else (144, 168)
image = Image.open(path).convert("RGB")
width, height = image.size

if width < target_width or height < target_height:
    raise SystemExit(1)

left = (width - target_width) // 2
top = (height - target_height) // 2
image = image.crop((left, top, left + target_width, top + target_height))
pixels = image.load()
dark_header_pixels = sum(
    1
    for y in range(min(30, target_height))
    for x in range(min(80, target_width))
    if max(pixels[x, y]) < 64
)
raise SystemExit(0 if dark_header_pixels >= 100 else 1)
PY
    then
      # The preview window slides in from the right. Its header becomes
      # readable a frame or two before that animation finishes, which made
      # visual captures intermittently land four pixels apart. Only accept a
      # static preview after two consecutive screendumps match exactly.
      sleep 0.2
      python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${stable_screenshot_path}" >/dev/null
      if cmp -s "${screenshot_path}" "${stable_screenshot_path}"; then
        mv "${stable_screenshot_path}" "${screenshot_path}"
        return 0
      fi
      rm -f "${stable_screenshot_path}"
    elif ((attempt == 8 || attempt == 16)); then
      # A busy emulator can miss the first Stop click. Retry only while the
      # screen is still unambiguously in the listening state so a delayed
      # click cannot confirm the preview accidentally.
      click_emulator_button select
    fi
    sleep 0.25
  done

  rm -f "${stable_screenshot_path}"
  echo "Timed out waiting for the dictation preview on ${platform}." >&2
  return 1
}

wait_for_transcribe_pattern() {
  local pattern="$1"
  local attempts="${2:-20}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if [[ -f "${transcribe_log}" ]] && grep -Fq -- "${pattern}" "${transcribe_log}"; then
      return 0
    fi
    sleep 0.25
  done

  return 1
}

wait_for_open_chat_request() {
  local open_chat_pattern="data=6f70656e5f6368617400"
  local target_chat_pattern
  local attempts="${1:-20}"

  case "${target_chat_id}" in
    1001)
      target_chat_pattern="data=3130303100"
      ;;
    2001)
      target_chat_pattern="data=3230303100"
      ;;
  esac

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if [[ -f "${pkjs_log}" ]] && awk \
      -v command="${open_chat_pattern}" \
      -v chat="${target_chat_pattern}" \
      'index($0, command) && index($0, chat) { found = 1 } END { exit !found }' \
      "${pkjs_log}"; then
      return 0
    fi
    if [[ "${target_chat_id}" == "1001" ]] && ((attempt == 8 || attempt == 16)); then
      # Selecting the first row is idempotent until the chat opens. Retry if
      # a busy emulator drops the initial click.
      click_emulator_button select
    fi
    sleep 0.25
  done

  echo "Timed out waiting for the watch open-chat request: ${pkjs_log}" >&2
  if [[ -s "${pkjs_log}" ]]; then
    tail -n 40 "${pkjs_log}" >&2
  fi
  return 1
}

wait_for_transcription_server() {
  if wait_for_transcribe_pattern "Transcription server listening" 20; then
    return 0
  fi

  echo "Timed out waiting for the transcription server: ${transcribe_log}" >&2
  return 1
}

start_dictation_session() {
  local start_attempt

  for start_attempt in 1 2 3; do
    click_emulator_button select
    if wait_for_transcribe_pattern "VoiceControlCommand(command=1" 8; then
      return 0
    fi
  done

  echo "Timed out starting dictation on ${platform}: ${transcribe_log}" >&2
  return 1
}

wait_for_send_request() {
  local send_message_pattern="data=73656e645f6d65737361676500"
  local attempts="${1:-24}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if grep -Fq -- "${send_message_pattern}" "${transcribe_log}"; then
      return 0
    fi
    if ((attempt == 8 || attempt == 16)); then
      click_emulator_button select
    fi
    sleep 0.25
  done

  echo "Timed out waiting for the watch send-message request: ${transcribe_log}" >&2
  return 1
}

require_transcribe_event() {
  local pattern="$1"
  local description="$2"

  if grep -Fq -- "${pattern}" "${transcribe_log}"; then
    return 0
  fi

  echo "Missing ${description} in transcription log: ${transcribe_log}" >&2
  if [[ -s "${transcribe_log}" ]]; then
    echo "Last 40 transcription log lines:" >&2
    tail -n 40 "${transcribe_log}" >&2
  else
    echo "The transcription log is empty or missing." >&2
  fi
  return 1
}

if [[ "${scenario}" == "zero-state" ]]; then
  sleep 2
  python3 scripts/seed-emulator-app-state.py "${persist_dir}" "${app_uuid}" "${state_name}" >/dev/null
  pebble install build/tg-pebble.pbw --qemu "localhost:${qemu_port}" >/dev/null
  sleep 2
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_list_ppm}" >/dev/null
else
  wait_for_chat_list_ready "${chat_list_ppm}"
  case "${target_chat_id}" in
    1001)
      click_emulator_button select
      ;;
    2001)
      click_emulator_button down 100
      sleep 0.15
      click_emulator_button select
      ;;
    *)
      echo "Unsupported emulator fixture target chat: ${target_chat_id}" >&2
      exit 2
      ;;
  esac
  wait_for_open_chat_request
  sleep 1
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${chat_open_ppm}" >/dev/null
fi

if [[ "${scenario}" == "dictation-success" ]]; then
  pebble transcribe "${dictation_text}" --qemu "localhost:${qemu_port}" -vvvv >"${transcribe_log}" 2>&1 &
  transcribe_pid=$!
  wait_for_transcription_server
  start_dictation_session
  sleep 0.5
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_listening_ppm}" >/dev/null
  click_emulator_button select
  wait_for_dictation_preview "${dictation_preview_ppm}"
  click_emulator_button select
  wait_for_send_request
  sleep 2
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_sent_ppm}" >/dev/null
elif [[ "${scenario}" == "send-failure" ]]; then
  pebble transcribe "${dictation_text}" --qemu "localhost:${qemu_port}" -vvvv >"${transcribe_log}" 2>&1 &
  transcribe_pid=$!
  wait_for_transcription_server
  start_dictation_session
  sleep 0.5
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${dictation_listening_ppm}" >/dev/null
  click_emulator_button select
  wait_for_dictation_preview "${dictation_preview_ppm}"
  click_emulator_button select
  wait_for_send_request
  sleep 2
  python3 scripts/qemu-monitor.py --port "${qemu_monitor_port}" screendump "${send_failed_ppm}" >/dev/null
elif [[ "${scenario}" == "dictation-error" ]]; then
  pebble transcribe --error "${dictation_error}" --qemu "localhost:${qemu_port}" -vvvv >"${transcribe_log}" 2>&1 &
  transcribe_pid=$!
  wait_for_transcription_server
  start_dictation_session
  sleep "${dictation_error_settle_seconds}"
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

PLATFORM_SIZES = {
    "aplite": (144, 168),
    "basalt": (144, 168),
    "diorite": (144, 168),
    "flint": (144, 168),
    "emery": (200, 228),
}

platform = "${platform}"
target_size = PLATFORM_SIZES.get(platform)

pairs = [
    (Path("${chat_list_ppm}"), Path("${chat_list_png}")),
    (Path("${chat_open_ppm}"), Path("${chat_open_png}")),
    (Path("${dictation_listening_ppm}"), Path("${dictation_listening_png}")),
    (Path("${dictation_preview_ppm}"), Path("${dictation_preview_png}")),
    (Path("${dictation_sent_ppm}"), Path("${dictation_sent_png}")),
    (Path("${dictation_failed_ppm}"), Path("${dictation_failed_png}")),
    (Path("${send_failed_ppm}"), Path("${send_failed_png}")),
]

for source, target in pairs:
    if not source.exists():
        continue

    image = Image.open(source).convert("RGBA")
    if target_size is not None and image.size != target_size:
        target_width, target_height = target_size
        width, height = image.size
        if width < target_width or height < target_height:
            raise SystemExit(
                f"Capture for {platform} is smaller than expected: {width}x{height} < {target_width}x{target_height}"
            )
        left = (width - target_width) // 2
        top = (height - target_height) // 2
        image = image.crop((left, top, left + target_width, top + target_height))

    image.save(target)
PY

test -s "${chat_list_png}"
if [[ "${scenario}" != "zero-state" ]]; then
  test -s "${chat_open_png}"
fi

if [[ "${scenario}" == "dictation-success" ]]; then
  test -s "${dictation_listening_png}"
  test -s "${dictation_preview_png}"
  test -s "${dictation_sent_png}"
  require_transcribe_event "VoiceControlCommand(command=1" "dictation-start command"
  require_transcribe_event "Sending dictation result" "dictation-result send"
  require_transcribe_event "data=73656e645f6d65737361676500" "send-message request"
elif [[ "${scenario}" == "send-failure" ]]; then
  test -s "${dictation_listening_png}"
  test -s "${dictation_preview_png}"
  test -s "${send_failed_png}"
  require_transcribe_event "VoiceControlCommand(command=1" "dictation-start command"
  require_transcribe_event "Sending dictation result" "dictation-result send"
  require_transcribe_event "data=73656e645f6d65737361676500" "send-message request"
elif [[ "${scenario}" == "dictation-error" ]]; then
  test -s "${dictation_failed_png}"
  test -s "${transcribe_log}"
fi

if [[ "${skip_storage_assert}" != "1" && "${skip_storage_assert}" != "true" ]]; then
  if [[ "${scenario}" == "zero-state" ]]; then
    python3 scripts/assert-emulator-state.py "${persist_dir}" "${app_uuid}" --chat-id "${target_chat_id}" \
      zero-state "${state_name}" >/dev/null
  elif [[ "${scenario}" == "read-only" ]]; then
    python3 scripts/assert-emulator-state.py "${persist_dir}" "${app_uuid}" --chat-id "${target_chat_id}" read-only \
      "${expected_preview:-${fixture_preview}}" \
      "${expected_message_text:-${fixture_message_text}}" >/dev/null
  elif [[ "${scenario}" == "dictation-success" ]]; then
    if [[ -n "${expected_preview}" ]]; then
      python3 scripts/assert-emulator-state.py "${persist_dir}" "${app_uuid}" --chat-id "${target_chat_id}" send-success \
        "${expected_send_text:-${dictation_text}}" \
        "${expected_preview}" >/dev/null
    else
      python3 scripts/assert-emulator-state.py "${persist_dir}" "${app_uuid}" --chat-id "${target_chat_id}" send-success \
        "${expected_send_text:-${dictation_text}}" >/dev/null
    fi
  elif [[ "${scenario}" == "send-failure" || "${scenario}" == "dictation-error" ]]; then
    python3 scripts/assert-emulator-state.py "${persist_dir}" "${app_uuid}" --chat-id "${target_chat_id}" send-failure \
      "${expected_preview:-${fixture_preview}}" \
      "${dictation_text}" >/dev/null
  fi
fi

echo "Emulator smoke test passed."
echo "  platform: ${platform}"
echo "  scenario: ${scenario}"
echo "Artifacts:"
echo "  ${chat_list_png}"
if [[ -f "${chat_open_png}" ]]; then
  echo "  ${chat_open_png}"
fi
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
if [[ -f "${send_failed_png}" ]]; then
  echo "  ${send_failed_png}"
fi
