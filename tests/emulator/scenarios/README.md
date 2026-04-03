# Emulator Scenarios

This directory is reserved for scripted emulator scenarios.

Implemented scenarios:

- `bash scripts/test-emulator.sh`
  - boots the app in a manual `qemu-pebble + pypkjs` session
  - captures the fixture-backed chat list
  - injects `Down` and `Select` through the QEMU monitor using the official `Q/W/S/X` keyboard mapping
  - captures the first chat view

Planned follow-ups:

- cached cold launch
- cached warm launch
- sync icon state matrix
- dictation success and failure matrix
- non-microphone read-only layout
