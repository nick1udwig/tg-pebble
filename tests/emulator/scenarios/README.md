# Emulator Scenarios

This directory is reserved for scripted emulator scenarios.

Implemented scenarios:

- `bash scripts/test-emulator.sh`
  - boots the app in a manual `qemu-pebble + pypkjs` session
  - uses an isolated PKJS/watch persist directory so settings and cache state do not leak across runs
  - captures the fixture-backed chat list
  - injects `Down` and `Select` through the QEMU monitor using the official `Q/W/S/X` keyboard mapping
  - captures the first chat view
  - runs emulator dictation through `pebble transcribe`
  - captures the dictation listening screen, preview window, and post-send chat state

Planned follow-ups:

- cached cold launch
- cached warm launch
- sync icon state matrix
- dictation success and failure matrix
- non-microphone read-only layout
