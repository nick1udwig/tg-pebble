#!/usr/bin/env bash
set -euo pipefail

platform="${1:-basalt}"
pbw_path="${2:-build/tg-pebble.pbw}"
session_file="${3:-build/tests/emulator-session.json}"
persist_dir_override="${4:-}"

if ! command -v pebble >/dev/null 2>&1; then
  echo "pebble-tool is not installed or not on PATH." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for the emulator harness." >&2
  exit 2
fi

sdk_root="/root/.pebble-sdk/SDKs/current"
sdk_version="$(basename "$(readlink -f "${sdk_root}")")"
sdk_core_dir="${sdk_root}/sdk-core"
toolchain_dir="${sdk_root}/toolchain"
persist_dir="${persist_dir_override:-/root/.pebble-sdk/${sdk_version}/${platform}}"
spi_flash="${persist_dir}/qemu_spi_flash.bin"
micro_flash="${sdk_core_dir}/pebble/${platform}/qemu/qemu_micro_flash.bin"
spi_flash_bz2="${sdk_core_dir}/pebble/${platform}/qemu/qemu_spi_flash.bin.bz2"
layout_file="${sdk_core_dir}/pebble/${platform}/qemu/layouts.json"
qemu_bin="${toolchain_dir}/bin/qemu-pebble"
pc_bios_dir="${toolchain_dir}/lib/pc-bios"
pkjs_python="/root/.local/share/uv/tools/pebble-tool/bin/python"
qemu_log="${session_file%.json}.qemu.log"
pkjs_log="${session_file%.json}.pkjs.log"

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

qemu_platform_args() {
  case "${platform}" in
    aplite)
      echo "-machine pebble-bb2 -cpu cortex-m3 -mtdblock ${spi_flash}"
      ;;
    basalt)
      echo "-machine pebble-snowy-bb -cpu cortex-m4 -pflash ${spi_flash}"
      ;;
    diorite)
      echo "-machine pebble-silk-bb -cpu cortex-m4 -mtdblock ${spi_flash}"
      ;;
    emery)
      echo "-machine pebble-snowy-emery-bb -cpu cortex-m4 -pflash ${spi_flash}"
      ;;
    flint)
      echo "-machine pebble-silk-bb -cpu cortex-m4 -mtdblock ${spi_flash}"
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
    if b"<SDK Home>" in received or b"<Launcher>" in received or b"Ready for communication" in received:
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

read -r -a platform_args <<<"$(qemu_platform_args)"

"${headless_prefix[@]}" "${qemu_bin}" \
  -rtc base=localtime \
  -serial null \
  -serial "tcp::${qemu_port},server,nowait" \
  -serial "tcp::${qemu_serial_port},server,nowait" \
  -pflash "${micro_flash}" \
  -gdb "tcp::${qemu_gdb_port},server,nowait" \
  -monitor "tcp::${qemu_monitor_port},server,nowait" \
  -L "${pc_bios_dir}" \
  -vnc :1 \
  "${platform_args[@]}" \
  >"${qemu_log}" 2>&1 &
qemu_pid=$!

wait_for_port "${qemu_port}" 80
wait_for_port "${qemu_monitor_port}" 80
wait_for_qemu_boot "${qemu_serial_port}"

"${pkjs_python}" -m pypkjs \
  --qemu "localhost:${qemu_port}" \
  --port "${pkjs_port}" \
  --persist "${persist_dir}" \
  --layout "${layout_file}" \
  --debug \
  >"${pkjs_log}" 2>&1 &
pkjs_pid=$!

wait_for_port "${pkjs_port}" 80

python3 - <<PY
import json
from pathlib import Path

session = {
    "platform": "${platform}",
    "sdk_version": "${sdk_version}",
    "persist_dir": "${persist_dir}",
    "qemu_pid": int("${qemu_pid}"),
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

pebble install "${pbw_path}" --qemu "localhost:${qemu_port}" >/dev/null
