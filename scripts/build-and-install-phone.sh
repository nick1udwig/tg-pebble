#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${TG_PEBBLE_ENV_FILE:-.env.telegram.test}"
ENV_PATH="$ROOT_DIR/$ENV_FILE"
DEFAULT_CONFIG_URL="https://nick1udwig.github.io/tg-pebble/config/"

read_env_value() {
  local key="$1"
  local file="$2"
  local line
  local value

  line="$(
    awk -v key="$key" '
      $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "=" { found = $0 }
      END { if (found != "") print found }
    ' "$file"
  )"

  if [[ -z "$line" ]]; then
    return 1
  fi

  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [[ "${value:0:1}" == "\"" && "${value: -1}" == "\"" ]] || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

require_value() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    echo "Missing $name in $ENV_FILE." >&2
    exit 1
  fi
}

cd "$ROOT_DIR"

if [[ ! -f "$ENV_PATH" ]]; then
  echo "Missing $ENV_FILE. Create it from .env.telegram.test.example and set TG_API_ID/TG_API_HASH." >&2
  exit 1
fi

TG_API_ID_VALUE="$(read_env_value TG_API_ID "$ENV_PATH" || true)"
TG_API_HASH_VALUE="$(read_env_value TG_API_HASH "$ENV_PATH" || true)"
TG_CONFIG_URL_VALUE="$(read_env_value TG_CONFIG_URL "$ENV_PATH" || true)"
TG_TEST_SERVERS_VALUE="$(read_env_value TG_TEST_SERVERS "$ENV_PATH" || true)"

require_value "TG_API_ID" "$TG_API_ID_VALUE"
require_value "TG_API_HASH" "$TG_API_HASH_VALUE"

if [[ "$TG_API_HASH_VALUE" == "replace-with-api-hash" ]]; then
  echo "TG_API_HASH in $ENV_FILE still has the example placeholder value." >&2
  exit 1
fi

export TG_PEBBLE_APP_API_ID="$TG_API_ID_VALUE"
export TG_PEBBLE_APP_API_HASH="$TG_API_HASH_VALUE"
export TG_PEBBLE_APP_CONFIG_URL="${TG_PEBBLE_APP_CONFIG_URL:-${TG_CONFIG_URL_VALUE:-$DEFAULT_CONFIG_URL}}"
export TG_PEBBLE_APP_FORCE_WSS="${TG_PEBBLE_APP_FORCE_WSS:-0}"
export TG_PEBBLE_APP_TEST_SERVERS="${TG_PEBBLE_APP_TEST_SERVERS:-${TG_TEST_SERVERS_VALUE:-0}}"

echo "Building PBW with config URL: $TG_PEBBLE_APP_CONFIG_URL"
echo "Telegram transport WSS enabled: $TG_PEBBLE_APP_FORCE_WSS"
echo "Telegram test servers enabled: $TG_PEBBLE_APP_TEST_SERVERS"

if [[ "${TG_PEBBLE_DRY_RUN:-0}" == "1" ]]; then
  echo "Dry run enabled; skipping build and install."
  exit 0
fi

npm run build:watch

echo "Installing build/tg-pebble.pbw to the paired phone..."
pebble install build/tg-pebble.pbw --phone
