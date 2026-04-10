# 260410 Handoff

## Overview

This repo is a Pebble watchapp + PKJS Telegram client prototype.

The product direction is:

- no hosted backend
- no native companion app
- PKJS owns local cache/session state
- Telegram access is direct from PKJS
- rectangular Pebbles first
- mic-capable devices can send by dictation only
- non-mic rectangular devices are read-only

Core product docs already in repo:

- [SPEC.md](/root/git/tg-pebble/SPEC.md)
- [TESTING_STRATEGY.md](/root/git/tg-pebble/TESTING_STRATEGY.md)
- [TEST_RUNBOOK.md](/root/git/tg-pebble/TEST_RUNBOOK.md)
- [TELEGRAM_TEST_ENV_PLAN.md](/root/git/tg-pebble/TELEGRAM_TEST_ENV_PLAN.md)

## Current Git State

Branch:

- `master`

Current committed HEAD:

- `279719e` `Guard live Telegram mutation target`

Important: there is substantial uncommitted work in the tree. A fresh implementer should review and either commit or shelve it before making unrelated changes.

Modified files:

- [TEST_RUNBOOK.md](/root/git/tg-pebble/TEST_RUNBOOK.md)
- [package-lock.json](/root/git/tg-pebble/package-lock.json)
- [package.json](/root/git/tg-pebble/package.json)
- [scripts/run-emulator.sh](/root/git/tg-pebble/scripts/run-emulator.sh)
- [scripts/serve-config-page.mjs](/root/git/tg-pebble/scripts/serve-config-page.mjs)
- [scripts/test-emulator.sh](/root/git/tg-pebble/scripts/test-emulator.sh)
- [src/config/app.js](/root/git/tg-pebble/src/config/app.js)
- [src/config/index.html](/root/git/tg-pebble/src/config/index.html)
- [src/pkjs/index.js](/root/git/tg-pebble/src/pkjs/index.js)
- [src/pkjs/lib/app.js](/root/git/tg-pebble/src/pkjs/lib/app.js)
- [tests/config-page/e2e/config-page.spec.js](/root/git/tg-pebble/tests/config-page/e2e/config-page.spec.js)
- [tests/js/unit/app.test.js](/root/git/tg-pebble/tests/js/unit/app.test.js)

Untracked files:

- [scripts/cleanup-dev-sessions.sh](/root/git/tg-pebble/scripts/cleanup-dev-sessions.sh)
- [scripts/run-agent-browser-safe.sh](/root/git/tg-pebble/scripts/run-agent-browser-safe.sh)
- [scripts/run-emulator-safe.sh](/root/git/tg-pebble/scripts/run-emulator-safe.sh)
- [scripts/session-guard.sh](/root/git/tg-pebble/scripts/session-guard.sh)
- [src/pkjs/lib/config_page.js](/root/git/tg-pebble/src/pkjs/lib/config_page.js)
- [src/pkjs/lib/telegram/auth.js](/root/git/tg-pebble/src/pkjs/lib/telegram/auth.js)
- [tests/js/unit/config_page.test.js](/root/git/tg-pebble/tests/js/unit/config_page.test.js)
- [tests/js/unit/telegram_auth.test.js](/root/git/tg-pebble/tests/js/unit/telegram_auth.test.js)

Untracked secret file:

- `.env.telegram.test`

Do not commit `.env.telegram.test`.

## What Exists Today

### Watch Shell

The watch shell is already built and has been emulator-tested in earlier iterations:

- chat list
- chat view
- settings
- sync state glyph
- dictation listening / preview / sent flow

Main watch file:

- [src/c/main.c](/root/git/tg-pebble/src/c/main.c)

Pure watch-side helpers:

- [src/c/core/message_grouping.c](/root/git/tg-pebble/src/c/core/message_grouping.c)
- [src/c/core/payload_parser.c](/root/git/tg-pebble/src/c/core/payload_parser.c)
- [src/c/core/sync_status.c](/root/git/tg-pebble/src/c/core/sync_status.c)
- [src/c/core/unread_badge.c](/root/git/tg-pebble/src/c/core/unread_badge.c)

### PKJS App Layer

PKJS app state, caching, fixtures, protocol, and sync helpers live here:

- [src/pkjs/index.js](/root/git/tg-pebble/src/pkjs/index.js)
- [src/pkjs/lib/app.js](/root/git/tg-pebble/src/pkjs/lib/app.js)
- [src/pkjs/lib/cache_store.js](/root/git/tg-pebble/src/pkjs/lib/cache_store.js)
- [src/pkjs/lib/fixtures.js](/root/git/tg-pebble/src/pkjs/lib/fixtures.js)
- [src/pkjs/lib/protocol.js](/root/git/tg-pebble/src/pkjs/lib/protocol.js)
- [src/pkjs/lib/placeholders.js](/root/git/tg-pebble/src/pkjs/lib/placeholders.js)
- [src/pkjs/lib/message_groups.js](/root/git/tg-pebble/src/pkjs/lib/message_groups.js)
- [src/pkjs/lib/sync_state.js](/root/git/tg-pebble/src/pkjs/lib/sync_state.js)

Telegram-specific code:

- [src/pkjs/lib/telegram/adapter.js](/root/git/tg-pebble/src/pkjs/lib/telegram/adapter.js)
- [src/pkjs/lib/telegram/auth.js](/root/git/tg-pebble/src/pkjs/lib/telegram/auth.js)
- [src/pkjs/lib/telegram/test_env.js](/root/git/tg-pebble/src/pkjs/lib/telegram/test_env.js)

### Config Page

Browser config page files:

- [src/config/index.html](/root/git/tg-pebble/src/config/index.html)
- [src/config/app.js](/root/git/tg-pebble/src/config/app.js)
- [src/config/style.css](/root/git/tg-pebble/src/config/style.css)

There is uncommitted work to move the config page beyond local form persistence and wire it into PKJS auth/session handling.

### Tests And Harnesses

Unit and contract tests:

- [tests/js/unit](/root/git/tg-pebble/tests/js/unit)
- [tests/js/contract/protocol.test.js](/root/git/tg-pebble/tests/js/contract/protocol.test.js)

Live Telegram integration tests:

- [tests/js/integration/telegram-test-env.test.js](/root/git/tg-pebble/tests/js/integration/telegram-test-env.test.js)
- [tests/js/integration/telegram-live-mutations.test.js](/root/git/tg-pebble/tests/js/integration/telegram-live-mutations.test.js)

Emulator artifacts and baselines:

- [tests/emulator/artifacts](/root/git/tg-pebble/tests/emulator/artifacts)
- [tests/emulator/baselines](/root/git/tg-pebble/tests/emulator/baselines)
- [tests/emulator/scenarios/README.md](/root/git/tg-pebble/tests/emulator/scenarios/README.md)

Session guard / safe wrappers:

- [scripts/session-guard.sh](/root/git/tg-pebble/scripts/session-guard.sh)
- [scripts/run-emulator-safe.sh](/root/git/tg-pebble/scripts/run-emulator-safe.sh)
- [scripts/run-agent-browser-safe.sh](/root/git/tg-pebble/scripts/run-agent-browser-safe.sh)
- [scripts/cleanup-dev-sessions.sh](/root/git/tg-pebble/scripts/cleanup-dev-sessions.sh)

## Telegram Status

### What Is Working

The live Telegram harness has moved off the flaky public test-environment path and now uses a real throwaway production account with a saved GramJS session string.

Safe live mode is:

- `TG_TEST_SERVERS=0`
- `TG_SESSION_STRING=...`
- `TG_TEST_ALLOW_SEND_CODE=0`
- `TG_TEST_ALLOW_LOGOUT=0`

The live read-only integration suite is implemented for:

- authorized session restore
- saved-session re-restore
- recent dialog listing
- recent message fetch

Mutation tests also exist for:

- fresh code login
- send message
- logout

but they are intentionally opt-in and not part of the default live run.

### Important Limitation

The current send mutation path does not work against `Saved Messages` / `me`. It needs a real target peer:

- second throwaway account
- private test group
- bot chat you control

Use:

- `TG_TEST_TARGET_PEER=<real dialog target>`

before enabling:

- `TG_TEST_ALLOW_SEND=1`

### Session Bootstrap

There is a helper for generating the saved session string:

- [scripts/create-telegram-session.mjs](/root/git/tg-pebble/scripts/create-telegram-session.mjs)

Entry point:

- `npm run telegram:session`

## What Was In Progress

There is active uncommitted work that was heading in this direction:

1. move the config page to real PKJS auth/session handling
2. keep `Clear cache` local-only while preserving Telegram session
3. perform real Telegram logout when requested
4. stop rehydrating fixtures when a live session exists

The main files for that in-progress work are:

- [src/pkjs/index.js](/root/git/tg-pebble/src/pkjs/index.js)
- [src/pkjs/lib/app.js](/root/git/tg-pebble/src/pkjs/lib/app.js)
- [src/pkjs/lib/config_page.js](/root/git/tg-pebble/src/pkjs/lib/config_page.js)
- [src/pkjs/lib/telegram/auth.js](/root/git/tg-pebble/src/pkjs/lib/telegram/auth.js)
- [src/config/app.js](/root/git/tg-pebble/src/config/app.js)
- [src/config/index.html](/root/git/tg-pebble/src/config/index.html)

## Current Blockers

### 1. Pebble Build Is Not Practical On This VPS With Raw `telegram` In PKJS

This is the main technical blocker right now.

Observed behavior:

- `pebble build` no longer fails immediately on duplicate packages after adding top-level `debug` and `ms` to [package.json](/root/git/tg-pebble/package.json)
- but `waf configure` spends a very long time recursively scanning `node_modules`
- on this VPS that is effectively a hang and can wedge the box when combined with emulator or browser work

Important evidence:

- `strace` on the hot `waf configure` process showed it recursively walking package trees under `node_modules`, including `telegram` transitive dependencies like `type`
- Pebble SDK helper code in `sdk_helpers.py` recursively globs `**/*.js` and `**/*.json` for non-Pebble npm packages
- this means the raw GramJS tree is a bad fit for direct inclusion in the Pebble PKJS dependency graph on a small VPS

Implication:

- do not keep trying full `pebble build` with the raw `telegram` dependency on this host as the default workflow

Most likely long-term fixes:

1. prebundle the Telegram runtime into a single trimmed artifact before Pebble sees it
2. split Telegram live harness work from the Pebble app worktree/install
3. replace GramJS with a much narrower client implementation

Recommended direction:

- prebundle or otherwise slim the runtime seen by Pebble

### 2. `node_modules` Is Currently Production-Pruned

Because of the Pebble build experiments, the current `node_modules` does not include dev dependencies.

This is the current verified state as of `2026-04-10`:

- `npm run test:c` passes
- `npm run test:js` fails because `vitest` is missing locally and `npx` tries to install a newer incompatible version on Node `18`
- `npm run test:config` fails because `@playwright/test` is missing locally

Evidence:

- `npm ls vitest @playwright/test --depth=0` shows `(empty)`

Practical consequence:

- a fresh implementer should expect to restore full dev dependencies with `npm install` before running JS/config tests
- but doing that may put the repo back into the state where Pebble build has to scan a larger dependency tree

This is another reason to separate the live Telegram harness dependency graph from the Pebble build path.

## Last Known Good Areas

Before the current Pebble-build investigation:

- watch shell and emulator harness had been working
- screenshots had been captured for:
  - chat list
  - chat open
  - dictation listening
  - dictation preview
  - dictation sent
- JS tests, C tests, config-page tests, and safe live Telegram tests had all passed in earlier iterations

Those results should be treated as last-known-good, not currently revalidated, until dev dependencies are restored and Pebble build is made usable again.

## Watchapp Gaps Still Remaining

Even once build/emulator are healthy again, the watchapp is still not feature-complete.

Not yet done:

- live refresh while app is open
- older-history loading as the user scrolls upward
- mark-as-read on chat open
- final explicit dictation state machine for `listening -> transcribing -> preview/auto-send`
- real auth state / empty state / sync error UI
- final end-to-end config-page auth flow through watch + PKJS

## Operational Notes

### Use The Safe Session Wrappers

Heavyweight sessions can wedge the VPS. Use:

- `npm run run:emulator -- basalt`
- `npm run cleanup:sessions`
- `scripts/run-agent-browser-safe.sh ...`

Read:

- [TEST_RUNBOOK.md](/root/git/tg-pebble/TEST_RUNBOOK.md)

### Avoid Parallel Heavy Jobs

Do not run these in parallel on this VPS:

- `pebble build`
- emulator/QEMU
- PKJS phone-sim
- Playwright/Chromium
- `agent-browser`

### Telegram Secrets

Keep these out of git:

- `.env.telegram.test`
- any saved session strings
- any live test account credentials

## Recommended Next Steps

For a fresh implementer, the order should be:

1. Snapshot or commit the current uncommitted work before mixing in more changes.
2. Restore full dev dependencies with `npm install` so JS/config tests work again.
3. Decide on the Pebble build strategy:
   - prebundle Telegram runtime for PKJS
   - or split the live Telegram harness into a separate package/worktree
4. Get `pebble build` back to a usable state without raw GramJS tree scanning.
5. Revalidate emulator smoke after build recovery.
6. Resume feature work:
   - config-page auth/session flow
   - live refresh
   - mark-as-read
   - pagination
7. After that, enable live send tests against a dedicated `TG_TEST_TARGET_PEER`.

## Useful Commands

Restore dev deps:

```bash
npm install
```

Safe live Telegram test run:

```bash
set -a && source ./.env.telegram.test && set +a && npm run test:telegram
```

Create a Telegram session string:

```bash
set -a && source ./.env.telegram.test && set +a && npm run telegram:session
```

Safe emulator run:

```bash
npm run run:emulator -- basalt
```

Session cleanup:

```bash
npm run cleanup:sessions
```

## Bottom Line

The project is past the “toy shell” stage:

- watch UI exists
- Telegram live read-only integration exists
- mutation tests exist
- config/auth integration work is underway

The immediate problem is build architecture, not product definition.

Raw GramJS inside the Pebble PKJS dependency tree is the current bottleneck. A fresh implementer should solve that packaging problem first, then continue the app integration work on top of the existing shell and live harness.
