#!/usr/bin/env bash
set -euo pipefail

mkdir -p build/tests

gcc \
  -std=c11 \
  -Wall \
  -Wextra \
  -pedantic \
  -Isrc/c/core \
  tests/c/unit/test_main.c \
  src/c/core/message_grouping.c \
  src/c/core/payload_parser.c \
  src/c/core/unread_badge.c \
  src/c/core/sync_status.c \
  -o build/tests/tg_pebble_c_tests

./build/tests/tg_pebble_c_tests
