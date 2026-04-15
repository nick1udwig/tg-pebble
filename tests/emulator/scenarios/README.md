# Emulator Scenarios

This directory is reserved for scripted emulator scenarios.

Implemented scenarios:

- `bash scripts/test-emulator.sh`
  - parameterized single-scenario harness
  - defaults to `basalt` dictation success
  - supports read-only and dictation-failure scenarios through env vars
- `bash scripts/test-emulator-matrix.sh`
  - runs the local emulator confidence matrix
  - `basalt` dictation success
  - `basalt` dictation failures: `connectivity`, `disabled`, `no-speech-detected`
  - `aplite` read-only navigation
- `bash scripts/test-emulator-soak.sh`
  - repeats the single-scenario harness to catch restart/persist regressions

Harness details:

- uses an isolated PKJS/watch persist directory per run
- captures screenshots from the QEMU monitor
- drives navigation through the official `Q/W/S/X` keyboard mapping
- uses `pebble transcribe` for deterministic dictation success and failure
- validates persisted PKJS storage after each run so the test asserts actual app state, not only screenshots/logs

Planned follow-ups:

- cached cold launch vs warm launch split
- sync icon state matrix
- config-page driven live login inside emulator
- non-rectangular platform coverage if the app expands beyond the current target set
