#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <agent-browser args...>" >&2
  exit 2
fi

timeout_seconds="${TG_PEBBLE_AGENT_BROWSER_TIMEOUT_SECONDS:-1200}"

exec bash scripts/session-guard.sh \
  agent-browser \
  "${timeout_seconds}" \
  "agent-browser" \
  agent-browser "$@"
