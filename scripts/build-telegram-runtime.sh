#!/usr/bin/env bash
set -euo pipefail

builder_dir="${TG_PEBBLE_TELEGRAM_BUILDER_DIR:-../tg-pebble-telegram-builder}"
output_path="${TG_PEBBLE_RUNTIME_OUT:-src/pkjs/lib/telegram/runtime_bundle.js}"

if [[ ! -d "${builder_dir}" ]]; then
  if [[ -f "${output_path}" ]]; then
    echo "Telegram builder project not found at ${builder_dir}; using existing runtime bundle." >&2
    exit 0
  fi

  echo "Telegram builder project not found at ${builder_dir}." >&2
  echo "Create the sibling builder project or set TG_PEBBLE_TELEGRAM_BUILDER_DIR." >&2
  exit 2
fi

if [[ ! -f "${builder_dir}/package.json" ]]; then
  echo "Telegram builder project at ${builder_dir} is missing package.json." >&2
  exit 2
fi

if [[ ! -d "${builder_dir}/node_modules" ]]; then
  echo "Telegram builder project dependencies are not installed at ${builder_dir}." >&2
  echo "Run 'npm install' inside that builder project first." >&2
  exit 2
fi

TG_PEBBLE_RUNTIME_OUT="$(pwd)/${output_path}" npm run build --prefix "${builder_dir}"
