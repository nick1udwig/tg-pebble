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

if [[ "${TG_TEST_ENABLE:-0}" == "1" && "${TG_TEST_SERVERS:-1}" != "1" && "${TG_TEST_ALLOW_SEND:-0}" == "1" ]]; then
  if [[ -z "${TG_TEST_TARGET_PEER:-}" || "${TG_TEST_TARGET_PEER:-}" == "me" ]]; then
    echo "Refusing to run production Telegram send tests without TG_TEST_TARGET_PEER set to a real dialog." >&2
    echo "Saved Messages ('me') is not supported by this MTProto send path." >&2
    exit 1
  fi

  echo "Warning: TG_TEST_ALLOW_SEND=1 will send a real message to ${TG_TEST_TARGET_PEER}." >&2
fi

npx vitest run tests/js/integration "$@"
