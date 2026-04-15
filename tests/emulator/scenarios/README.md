# Emulator Scenarios

This directory is reserved for scripted emulator scenarios.

Implemented scenarios:

- `bash scripts/test-emulator.sh`
  - parameterized single-scenario harness
  - defaults to `basalt` dictation success
  - supports `read-only`, `send-failure`, `dictation-error`, and `zero-state` through env vars
- `bash scripts/test-emulator-matrix.sh`
  - runs the local emulator confidence matrix
  - `basalt` dictation success
  - `basalt` send failure after a successful transcript
  - `basalt` long-text dictation success
  - `basalt` dictation failures: `connectivity`, `disabled`, `no-speech-detected`
  - `aplite`, `diorite`, `emery`, and `flint` read-only navigation
- `bash scripts/test-emulator-states.sh`
  - covers signed-out, auth-error, and no-chats-yet watch states
- `bash scripts/test-emulator-relaunch.sh`
  - proves cold-send then warm-relaunch persistence against the same emulator storage
- `bash scripts/test-emulator-soak.sh`
  - repeats the single-scenario harness to catch restart/persist regressions
- `bash scripts/test-emulator-visual.sh`
  - reruns the deterministic screenshot lanes and compares them against committed baselines

Harness details:

- uses an isolated PKJS/watch persist directory per run unless warm-relaunch explicitly reuses one
- captures screenshots from the QEMU monitor
- drives navigation through the official `Q/W/S/X` keyboard mapping
- uses `pebble transcribe` for deterministic dictation success and failure
- validates persisted PKJS storage after each run so the test asserts actual app state, not only screenshots/logs

Planned follow-ups:

- config-page driven live login inside emulator
- broader hardware beta coverage
- CI automation for the emulator lanes once the SDK toolchain is encoded in CI
