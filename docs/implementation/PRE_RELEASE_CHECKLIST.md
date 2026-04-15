# TG Pebble Pre-Release Checklist

This is the highest-confidence local test plan available without a physical watch.

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
- `basalt` send failure after a successful transcript
- `basalt` long dictation text
- `basalt` dictation failures for `connectivity`, `disabled`, and `no-speech-detected`
- `aplite`, `diorite`, `emery`, and `flint` read-only navigation

Artifacts land under:

- `tests/emulator/artifacts/`

Prefixed outputs indicate the platform/scenario that produced them.

## 3. Emulator State Layer

Run:

```bash
npm run test:emulator:states
npm run test:emulator:relaunch
```

This covers:

- signed-out watch state
- auth-error watch state
- empty-but-signed-in watch state
- persisted warm relaunch after a successful send

## 4. Visual Regression Layer

Run:

```bash
npm run review:visual
```

To refresh the committed emulator baselines first:

```bash
npm run capture:baselines
```

This compares the current deterministic emulator screenshots against:

- `tests/emulator/baselines/`

Diff images are written to:

- `tests/emulator/artifacts/diffs/`

## 5. Emulator Soak Layer

Run:

```bash
npm run test:emulator:soak -- 2 basalt
```

Increase the first argument for longer soak passes.

This is meant to catch:

- stale emulator persist state problems
- repeated startup/install issues
- repeated dictation/send regressions

## 6. Full Safe Local Pass

Run:

```bash
npm run test:pre-release
```

This runs the safe local stack:

- JS tests
- C tests
- config-page tests
- emulator matrix
- zero-state coverage
- warm relaunch coverage
- visual diff review
- emulator soak

The default soak pass is `2` basalt iterations.

Override when needed:

```bash
TG_PEBBLE_SOAK_ITERATIONS=4 TG_PEBBLE_SOAK_PLATFORM=basalt npm run test:pre-release
```

## 7. Optional Live Telegram Checks

These remain opt-in because they can hit a real Telegram account.

To include them in the pre-release pass:

```bash
TG_PEBBLE_RUN_LIVE_RELEASE_CHECKS=1 npm run test:pre-release
```

Only do this with a dedicated throwaway account/session and the guardrails documented in [`TEST_RUNBOOK.md`](./TEST_RUNBOOK.md).

## 8. Remaining Unknowns Without Hardware

Even after the full checklist passes, these are still hardware-only risks:

- real dictation service behavior on a watch/phone pair
- Bluetooth timing and disconnect edge cases
- phone companion webview quirks on real mobile OS versions
- device-specific memory pressure and firmware behavior

Those risks are reduced by this checklist, not eliminated.
