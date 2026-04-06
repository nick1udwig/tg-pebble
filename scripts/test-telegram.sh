#!/usr/bin/env bash
set -euo pipefail

if [[ "${TG_TEST_ENABLE:-0}" == "1" && "${TG_TEST_SERVERS:-1}" != "1" && -z "${TG_SESSION_STRING:-}" && "${TG_TEST_ALLOW_SEND_CODE:-0}" != "1" ]]; then
  echo "Refusing to run production Telegram tests without TG_SESSION_STRING." >&2
  echo "Set TG_TEST_ALLOW_SEND_CODE=1 only if you intentionally want fresh auth-code login." >&2
  exit 1
fi

if [[ "${TG_TEST_ENABLE:-0}" == "1" && "${TG_TEST_SERVERS:-1}" != "1" && "${TG_TEST_ALLOW_LOGOUT:-0}" == "1" ]]; then
  echo "Warning: TG_TEST_ALLOW_LOGOUT=1 will perform a real Telegram logout on the live account." >&2
fi

npx vitest run tests/js/integration "$@"
