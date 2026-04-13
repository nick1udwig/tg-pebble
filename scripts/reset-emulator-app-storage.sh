#!/usr/bin/env bash
set -euo pipefail

platform="${1:-basalt}"
app_uuid="2f9865aa-e12b-47f2-b6fb-47f27a8ee101"
sdk_root="${TG_PEBBLE_SDK_ROOT:-${HOME}/.pebble-sdk/SDKs/current}"
sdk_version="$(basename "$(readlink -f "${sdk_root}")")"
persist_dir="${HOME}/.pebble-sdk/${sdk_version}/${platform}"

rm -f \
  "${persist_dir}/app_cache/${app_uuid}.pbw" \
  "${persist_dir}/localstorage/${app_uuid}.bak" \
  "${persist_dir}/localstorage/${app_uuid}.dat" \
  "${persist_dir}/localstorage/${app_uuid}.dir"

echo "Cleared emulator app storage for ${platform} at ${persist_dir}"
