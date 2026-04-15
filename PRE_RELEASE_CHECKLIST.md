# TG Pebble Pre-Release Checklist

This checklist is the highest-confidence local test plan available without a physical watch.

## 1. Fast Regression Layer

Run:

```bash
npm run test:js
npm run test:c
npm run test:config
```

This covers:

- PKJS session and auth-state handling
- config-page payload behavior
- protocol serialization and payload budgets
- watch-side parser truncation and UTF-8 safety

## 2. Emulator Matrix Layer

Run:

```bash
npm run test:emulator:matrix
```

This covers:

- `basalt` dictation success
- `basalt` dictation failures for:
  - `connectivity`
  - `disabled`
  - `no-speech-detected`
- `aplite` read-only chat navigation without dictation

Artifacts land under:

- `tests/emulator/artifacts/`

Prefixed outputs indicate the platform/scenario that produced them.

## 3. Emulator Soak Layer

Run:

```bash
npm run test:emulator:soak -- 2 basalt
```

Increase the first argument for longer soak passes.

This is meant to catch:

- stale emulator persist state problems
- repeated startup/install issues
- repeated dictation/send regressions

## 4. Full Safe Local Pass

Run:

```bash
npm run test:pre-release
```

This runs the safe local stack:

- JS tests
- C tests
- config-page tests
- emulator matrix
- emulator soak

The default soak pass is `2` basalt iterations.

Override when needed:

```bash
TG_PEBBLE_SOAK_ITERATIONS=4 TG_PEBBLE_SOAK_PLATFORM=basalt npm run test:pre-release
```

## 5. Optional Live Telegram Checks

These remain opt-in because they can hit a real Telegram account.

To include them in the pre-release pass:

```bash
TG_PEBBLE_RUN_LIVE_RELEASE_CHECKS=1 npm run test:pre-release
```

Only do this with a dedicated throwaway account/session and the guardrails documented in `TEST_RUNBOOK.md`.

## 6. Remaining Unknowns Without Hardware

Even after the full checklist passes, these are still hardware-only risks:

- real dictation service behavior on a watch/phone pair
- Bluetooth timing and disconnect edge cases
- phone companion webview quirks on real mobile OS versions
- device-specific memory pressure and firmware behavior

Those risks are reduced by this checklist, not eliminated.
