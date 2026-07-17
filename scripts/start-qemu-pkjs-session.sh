#!/usr/bin/env bash
set -euo pipefail

platform="${1:-basalt}"
pbw_path="${2:-build/tg-pebble.pbw}"
session_file="${3:-build/tests/emulator-session.json}"
persist_dir_override="${4:-}"
skip_app_install="${TG_PEBBLE_SKIP_APP_INSTALL:-0}"

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed or not on PATH." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for the emulator harness." >&2
  exit 2
fi

pebble_bin="$(command -v pebble)"
sdk_root="${TG_PEBBLE_SDK_ROOT:-${HOME}/.pebble-sdk/SDKs/current}"
sdk_version="$(basename "$(readlink -f "${sdk_root}")")"
sdk_core_dir="${sdk_root}/sdk-core"
toolchain_dir="${sdk_root}/toolchain"
persist_dir="${persist_dir_override:-${HOME}/.pebble-sdk/${sdk_version}/${platform}}"
spi_flash="${persist_dir}/qemu_spi_flash.bin"
micro_flash="${sdk_core_dir}/pebble/${platform}/qemu/qemu_micro_flash.bin"
spi_flash_bz2="${sdk_core_dir}/pebble/${platform}/qemu/qemu_spi_flash.bin.bz2"
layout_file="${sdk_core_dir}/pebble/${platform}/qemu/layouts.json"
qemu_bin="${toolchain_dir}/bin/qemu-pebble"
pc_bios_dir="${toolchain_dir}/lib/pc-bios"
pkjs_python="${TG_PEBBLE_TOOL_PYTHON:-$(head -n 1 "${pebble_bin}" | sed 's/^#!//')}"
qemu_log="${session_file%.json}.qemu.log"
pkjs_log="${session_file%.json}.pkjs.log"
qemu_pid=""
qemu_pgid=""
pkjs_pid=""
startup_complete=0

cleanup_failed_start() {
  local exit_code="$?"
  trap - EXIT

  if [[ "${startup_complete}" != "1" ]]; then
    if [[ -n "${pkjs_pid}" ]]; then
      kill "${pkjs_pid}" >/dev/null 2>&1 || true
      wait "${pkjs_pid}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${qemu_pgid}" ]]; then
      kill -- "-${qemu_pgid}" >/dev/null 2>&1 || true
    elif [[ -n "${qemu_pid}" ]]; then
      kill "${qemu_pid}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${qemu_pid}" ]]; then
      wait "${qemu_pid}" >/dev/null 2>&1 || true
    fi
    rm -f "${session_file}"
    echo "Failed to start the ${platform} emulator session." >&2
    echo "QEMU log: ${qemu_log}" >&2
    echo "PKJS log: ${pkjs_log}" >&2
  fi

  exit "${exit_code}"
}

trap cleanup_failed_start EXIT
rm -f "${session_file}" "${qemu_log}" "${pkjs_log}"

qemu_major="$("${qemu_bin}" --version | sed -nE 's/^QEMU emulator version ([0-9]+).*/\1/p' | head -n 1)"
new_qemu=0
if [[ "${qemu_major}" =~ ^[0-9]+$ ]] && ((qemu_major >= 7)); then
  new_qemu=1
fi

use_new_boards=1
if [[ "${sdk_version}" =~ ^[0-9]+([.][0-9]+)*$ ]]; then
  oldest_version="$(printf '%s\n' "${sdk_version}" "4.9.148" | sort -V | head -n 1)"
  if [[ "${oldest_version}" == "${sdk_version}" ]]; then
    use_new_boards=0
  fi
fi

choose_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("", 0))
print(s.getsockname()[1])
s.close()
PY
}

ensure_spi_flash() {
  if [[ -f "${spi_flash}" ]]; then
    return
  fi

  mkdir -p "${persist_dir}"
  python3 - <<PY
import bz2
from pathlib import Path

src = Path("${spi_flash_bz2}")
dst = Path("${spi_flash}")
if not src.exists():
    raise SystemExit(f"Missing emulator SPI flash template: {src}")

with bz2.BZ2File(src, "rb") as from_file, dst.open("wb") as to_file:
    while True:
        chunk = from_file.read(8192)
        if not chunk:
            break
        to_file.write(chunk)
PY
}

set_qemu_platform_args() {
  local spi_pflash_args=()
  local new_mtd_flash_args=(-drive "if=mtd,format=raw,file=${spi_flash}")
  local new_board_audio_args=(-audio "driver=none,id=audio0")

  if [[ "${new_qemu}" == "1" ]]; then
    spi_pflash_args=(-drive "if=none,id=spi-flash,file=${spi_flash},format=raw")
  else
    spi_pflash_args=(-pflash "${spi_flash}")
  fi

  case "${platform}" in
    aplite)
      platform_args=(-machine pebble-bb2 -cpu cortex-m3 -mtdblock "${spi_flash}")
      ;;
    basalt)
      platform_args=(-machine pebble-snowy-bb -cpu cortex-m4 "${spi_pflash_args[@]}")
      ;;
    diorite)
      platform_args=(-machine pebble-silk-bb -cpu cortex-m4 -mtdblock "${spi_flash}")
      ;;
    emery)
      if [[ "${use_new_boards}" == "1" ]]; then
        platform_args=(-machine pebble-emery -cpu cortex-m33 "${new_mtd_flash_args[@]}" "${new_board_audio_args[@]}")
      else
        platform_args=(-machine pebble-snowy-emery-bb -cpu cortex-m4 "${spi_pflash_args[@]}")
      fi
      ;;
    flint)
      if [[ "${use_new_boards}" == "1" ]]; then
        platform_args=(-machine pebble-flint -cpu cortex-m4 "${new_mtd_flash_args[@]}" "${new_board_audio_args[@]}")
      else
        platform_args=(-machine pebble-silk-bb -cpu cortex-m4 -mtdblock "${spi_flash}")
      fi
      ;;
    *)
      echo "Unsupported platform for manual harness: ${platform}" >&2
      exit 2
      ;;
  esac
}

wait_for_port() {
  local port="$1"
  local attempts="${2:-50}"
  python3 - <<PY
import socket
import time

port = int("${port}")
attempts = int("${attempts}")

for _ in range(attempts):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            raise SystemExit(0)
    except OSError:
        time.sleep(0.2)

raise SystemExit(1)
PY
}

wait_for_qemu_boot() {
  local serial_port="$1"
  python3 - <<PY
import socket
import time

port = int("${serial_port}")
sock = None

for _ in range(60):
    try:
        sock = socket.create_connection(("127.0.0.1", port), timeout=0.5)
        break
    except OSError:
        time.sleep(0.2)

if sock is None:
    raise SystemExit(1)

received = b""
sock.settimeout(1)
deadline = time.time() + 20
while time.time() < deadline:
    try:
        chunk = sock.recv(256)
    except OSError:
        continue
    if not chunk:
        continue
    received += chunk
    if b"Ready for communication" in received:
        sock.close()
        raise SystemExit(0)

sock.close()
raise SystemExit(1)
PY
}

ensure_spi_flash
mkdir -p "$(dirname "${session_file}")"

qemu_port="$(choose_port)"
qemu_serial_port="$(choose_port)"
qemu_gdb_port="$(choose_port)"
qemu_monitor_port="$(choose_port)"
pkjs_port="$(choose_port)"

headless_prefix=()
if [[ -z "${DISPLAY:-}" ]]; then
  if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "xvfb-run is required when DISPLAY is not set." >&2
    exit 2
  fi
  headless_prefix=(xvfb-run -a)
fi

tcp_opts="server,nowait"
firmware_args=(-pflash "${micro_flash}")
if [[ "${new_qemu}" == "1" ]]; then
  tcp_opts="server=on,wait=off"
  firmware_args=(-kernel "${micro_flash}")
fi

platform_args=()
set_qemu_platform_args

# Keep xvfb-run, Xvfb, and QEMU in one dedicated process group. On headless
# runners, terminating only xvfb-run leaves its QEMU child consuming CPU for
# every later matrix scenario.
setsid "${headless_prefix[@]}" "${qemu_bin}" \
  -rtc base=localtime \
  -serial null \
  -serial "tcp::${qemu_port},${tcp_opts}" \
  -serial "tcp::${qemu_serial_port},${tcp_opts}" \
  "${firmware_args[@]}" \
  -gdb "tcp::${qemu_gdb_port},${tcp_opts}" \
  -monitor "tcp::${qemu_monitor_port},${tcp_opts}" \
  -L "${pc_bios_dir}" \
  -display none \
  "${platform_args[@]}" \
  >"${qemu_log}" 2>&1 &
qemu_pid=$!
qemu_pgid="${qemu_pid}"

wait_for_port "${qemu_port}" 80
wait_for_port "${qemu_monitor_port}" 80
wait_for_qemu_boot "${qemu_serial_port}"

pkjs_ready=0
for attempt in 1 2 3; do
  printf 'PKJS startup attempt %s\n' "${attempt}" >>"${pkjs_log}"
  "${pkjs_python}" -m pypkjs \
    --qemu "localhost:${qemu_port}" \
    --port "${pkjs_port}" \
    --persist "${persist_dir}" \
    --layout "${layout_file}" \
    --debug \
    >>"${pkjs_log}" 2>&1 &
  pkjs_pid=$!

  if wait_for_port "${pkjs_port}" 80; then
    pkjs_ready=1
    break
  fi

  kill "${pkjs_pid}" >/dev/null 2>&1 || true
  wait "${pkjs_pid}" >/dev/null 2>&1 || true
  pkjs_pid=""
  sleep 1
done

if [[ "${pkjs_ready}" != "1" ]]; then
  exit 1
fi

python3 - <<PY
import json
from pathlib import Path

session = {
    "platform": "${platform}",
    "sdk_version": "${sdk_version}",
    "persist_dir": "${persist_dir}",
    "qemu_pid": int("${qemu_pid}"),
    "qemu_pgid": int("${qemu_pgid}"),
    "pkjs_pid": int("${pkjs_pid}"),
    "qemu_port": int("${qemu_port}"),
    "qemu_serial_port": int("${qemu_serial_port}"),
    "qemu_gdb_port": int("${qemu_gdb_port}"),
    "qemu_monitor_port": int("${qemu_monitor_port}"),
    "pkjs_port": int("${pkjs_port}"),
    "qemu_log": "${qemu_log}",
    "pkjs_log": "${pkjs_log}",
    "pbw_path": "${pbw_path}"
}

Path("${session_file}").write_text(json.dumps(session, indent=2) + "\n", encoding="utf-8")
Path("/tmp/pb-qemu-pypkjs-${qemu_port}.json").write_text(
    json.dumps(
        {
            "pypkjs_pid": int("${pkjs_pid}"),
            "pypkjs_port": int("${pkjs_port}"),
            "qemu_host": "localhost",
            "qemu_port": int("${qemu_port}")
        },
        indent=2
    ) + "\n",
    encoding="utf-8"
)
print(json.dumps(session, indent=2))
PY

if [[ "${skip_app_install}" != "1" && "${skip_app_install}" != "true" ]]; then
  pebble install "${pbw_path}" --qemu "localhost:${qemu_port}" >/dev/null
fi

startup_complete=1
trap - EXIT
