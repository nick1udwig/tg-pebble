# TG Pebble Test Runbook

This runbook documents how to set up the local test environment for TG Pebble, how to run the available tests, and the platform-specific issues encountered while bringing up the RePebble SDK and emulator.

It complements:

- [SPEC.md](/root/git/tg-pebble/SPEC.md)
- [TESTING_STRATEGY.md](/root/git/tg-pebble/TESTING_STRATEGY.md)

## 1. Scope

This runbook covers:

1. installing local dependencies required for testing
2. running the current automated test suites
3. running the Pebble emulator locally
4. taking screenshots from the emulator
5. known gotchas and workarounds

## 2. Official References

The setup below follows the current RePebble documentation:

- SDK install: https://developer.repebble.com/sdk/
- Pebble CLI and emulator commands: https://developer.repebble.com/guides/tools-and-resources/pebble-tool/

## 3. Installation Of Dependencies For Testing

### 3.1 System Packages

On Ubuntu, install the packages required by the RePebble SDK plus the extra packages needed in practice for headless testing:

```bash
sudo apt-get update
sudo apt-get install -y \
  nodejs \
  npm \
  libsdl1.2debian \
  libfdt1 \
  python3.12-venv \
  xvfb \
  xauth
```

Notes:

- `libsdl1.2debian` and `libfdt1` are called out by the official SDK docs for Ubuntu.
- `python3.12-venv` was additionally required on this machine because `pebble sdk install latest` failed without Python venv support.
- `xvfb` and `xauth` are not part of the basic SDK install docs, but they are important for running the emulator and screenshots in a headless shell environment.

### 3.2 Install `uv`

The official SDK docs recommend `uv` for installing `pebble-tool`.

If `uv` is not already installed:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Make sure `uv` is on `PATH`. On a default Linux install that usually means:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 3.3 Install `pebble-tool`

Install the official CLI with a supported Python version:

```bash
uv tool install pebble-tool --python 3.12
```

Verify:

```bash
pebble --version
```

Expected shape:

```text
Pebble Tool v5.x
```

### 3.4 Install The SDK

Install the latest SDK:

```bash
pebble sdk install latest
```

Verify:

```bash
pebble sdk list
```

Expected shape:

```text
Installed SDKs:
4.9.148 (active)
```

### 3.5 Install Project Dependencies

From the repo root:

```bash
npm install
```

This installs:

- `vitest`
- `playwright`
- `pixelmatch`
- related frontend test dependencies

For browser tests, install the Playwright browser runtime:

```bash
npx playwright install chromium
```

## 4. How To Test

All commands below assume you are in the repo root:

```bash
cd /root/git/tg-pebble
export PATH="$HOME/.local/bin:$PATH"
```

### 4.1 JavaScript Unit And Contract Tests

Run:

```bash
npm run test:js
```

This executes:

- PKJS unit tests
- protocol fixture tests

### 4.2 Host-Side C Logic Tests

Run:

```bash
npm run test:c
```

This compiles and runs the host-side pure-C logic tests in `tests/c/unit`.

### 4.3 Config Page Browser Tests

Run:

```bash
npm run test:config
```

This starts the local config-page server and executes the Playwright suite against it.

### 4.4 Full Non-Emulator Test Pass

Run:

```bash
npm test
```

This runs:

- JS tests
- C tests
- config-page browser tests

### 4.5 Build The Pebble App

Run:

```bash
pebble build
```

This should build the app for the configured rectangular platforms and emit a `.pbw` bundle into `build/`.

### 4.6 Run The Emulator

#### Desktop Session

If you have a working X11 desktop session:

```bash
pebble install --emulator basalt
```

#### Headless / SSH Session

Use the helper script:

```bash
scripts/run-emulator.sh basalt
```

What this does:

- detects that there is no `DISPLAY`
- wraps the emulator in `xvfb-run`
- enables VNC mode
- keeps the process running while the emulator session is alive
- streams logs in that same terminal

Important:

- keep that terminal open while you want the emulator session to live
- stop the session from another shell with `pebble kill`

### 4.7 Emulator-Side CLI Commands

Officially useful commands include:

```bash
pebble logs --emulator basalt
pebble transcribe "hello world"
pebble emu-bt-connection --connected no
pebble emu-app-config
```

In practice, see the screenshot notes below for the difference between:

- one-shot emulator commands
- reconnecting to an already-running headless emulator

## 5. Pebble Screenshot

### 5.1 Is `pebble screenshot` usable?

Yes.

It is important and usable.

The working pattern in this environment is:

```bash
xvfb-run -a pebble screenshot --emulator basalt --no-open build/tests/oneshot-screenshot.png
```

This successfully:

- launches an emulator session
- captures a screenshot
- writes the PNG to disk
- works in a headless shell

### 5.2 What was the problem, then?

The problem was not that `pebble screenshot` is broken.

The problem was narrower:

- launching a long-running headless emulator via `pebble install --emulator ...`
- then trying to attach a second separate CLI command to that already-running headless emulator

In this environment, that reconnection path was unreliable.

Observed behavior:

- the emulator could build and install successfully
- the long-running headless session could stay alive when launched through the helper script
- but follow-up commands such as `pebble screenshot` aimed at that live session were not reliably attaching to it

### 5.2.1 Exact Issue To Watch For

There are really two separate behaviors:

1. `One-shot screenshot capture`
   - works
   - launches its own emulator session
   - captures the PNG
   - exits cleanly

2. `Attach a second CLI command to an already-running headless emulator`
   - unreliable in this environment
   - may fail to find the live watch connection
   - may try to launch a fresh emulator session instead of reusing the existing one
   - may then fail with an SDL/X11 error if that second command is not also wrapped in `xvfb-run`

Common symptom shapes:

```text
No pebble connection specified.
```

or:

```text
Could not initialize SDL(x11 not available) - exiting
```

Interpretation:

- these errors do **not** mean screenshots are unavailable
- they mean the CLI did not successfully reconnect to the already-running headless emulator session
- the safe fallback is to use the one-shot `xvfb-run -a pebble screenshot --emulator ...` form

### 5.3 Working Recommendation

Use `pebble screenshot` in one of these ways:

1. `Preferred for headless automation`
   Use one-shot screenshot capture:

   ```bash
   xvfb-run -a pebble screenshot --emulator basalt --no-open build/tests/shot.png
   ```

2. `Preferred for interactive desktop work`
   Run the emulator in a graphical desktop session and use the normal screenshot command against that environment.

3. `Future harness work`
   Build a dedicated emulator automation harness that manages QEMU lifetime and attachment explicitly.

For now, option `1` is the reliable CI/headless path and should be treated as the baseline.

### 5.4 What This Means For Visual Testing

It does **not** mean visual testing is blocked.

It means:

- one-shot screenshot capture is reliable now
- persistent headless emulator control still needs a more deliberate harness

That is enough to proceed with:

- static watch UI baseline capture
- platform screenshot comparisons
- layout regression checks

## 6. Other Gotchas And Workarounds

### 6.1 Missing `python3.12-venv`

Problem:

- `pebble sdk install latest` failed during SDK setup because Python venv support was missing

Error shape:

```text
The virtual environment was not created successfully because ensurepip is not available
```

Fix:

```bash
sudo apt-get install -y python3.12-venv
```

### 6.2 Headless Emulator Needed More Than The Official Minimum

Problem:

- the official SDK dependencies were not enough for a headless shell environment
- direct emulator launch failed with SDL/X11 errors

Error shape:

```text
Could not initialize SDL(x11 not available) - exiting
```

Fix:

- install `xvfb` and `xauth`
- launch headless emulator commands through `xvfb-run`

### 6.3 `wscript` Needed To Match The Current SDK Pattern

Problem:

- the initial placeholder `wscript` used the wrong build helper shape for the current SDK
- `pebble build` failed with a missing `target` key

Fix:

- switch to the generated-project pattern used by current `pebble new-project` templates
- use `ctx.pbl_build(..., target=..., bin_type='app')`
- then `ctx.pbl_bundle(...)`

### 6.4 `appinfo.json` Version Label Validation

Problem:

- `versionLabel` was initially set to `0.1.0`
- the SDK rejected that format for this style of app metadata

Error shape:

```text
appinfo.json versionLabel format for app revision must be "Major" or "Major.Minor"
```

Fix:

- use `0.1` instead of `0.1.0`

### 6.5 Playwright Browser Runtime Was Not Installed By Default

Problem:

- the Playwright test suite failed even though the npm package was installed

Error shape:

```text
Executable doesn't exist ... Please run: npx playwright install
```

Fix:

```bash
npx playwright install chromium
```

### 6.6 Long-Running Headless Emulator Reconnection

Problem:

- the emulator could be launched and used
- but secondary CLI tools did not reliably reconnect to that exact already-running headless session

Workaround:

- prefer one-shot commands like `xvfb-run -a pebble screenshot --emulator basalt ...`
- use `scripts/run-emulator.sh` for interactive headless development
- treat persistent headless emulator orchestration as future harness work

### 6.7 Headless Emulator PKJS Bridge Was Not Reliable

Problem:

- the watch app launched correctly in the headless emulator
- native watch-side logs and screenshots worked
- but the default phone-simulator path behind `pebble install --emulator ... --logs` did not deliver PKJS `AppMessage` replies in this environment

Observed behavior:

- the watch sent repeated bootstrap requests such as `app_ready`
- no inbound PKJS messages reached the watch
- the watch shell remained on its local loading state even though the PKJS bundle was present in the `.pbw`

What was verified:

- the multi-file PKJS bundle is now built through `package.json` `pebble.enableMultiJS`
- the SDK successfully emits `build/pebble-js-app.js`
- the watch app installs and stays alive in the emulator
- watch-side screenshots such as `build/tests/live-shell.png` can be captured from that live session

Current workaround:

- use the emulator to validate the native watch shell, layout, and navigation scaffolding
- use JS unit tests to validate PKJS behavior deterministically
- treat end-to-end PKJS-in-emulator validation as pending follow-up work

Likely next investigation:

- try the direct QEMU path with `--qemu ... --pypkjs --platform <platform>`
- compare behavior in a desktop session versus the current headless shell
- inspect whether the default phone simulator path is dropping messages before PKJS `ready`

## 7. Practical Command Summary

### Initial Machine Setup

```bash
sudo apt-get update
sudo apt-get install -y \
  nodejs npm libsdl1.2debian libfdt1 python3.12-venv xvfb xauth
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv tool install pebble-tool --python 3.12
pebble sdk install latest
```

### Project Setup

```bash
cd /root/git/tg-pebble
npm install
npx playwright install chromium
```

### Main Test Commands

```bash
npm run test:js
npm run test:c
npm run test:config
npm test
pebble build
```

### Emulator Commands

```bash
scripts/run-emulator.sh basalt
pebble kill
pebble transcribe "hello world"
pebble emu-bt-connection --connected no
```

### Screenshot Command

```bash
xvfb-run -a pebble screenshot --emulator basalt --no-open build/tests/shot.png
```

## 8. Current Status

As of this runbook:

- `pebble-tool` installation is working
- SDK `4.9.148` installation is working
- `pebble build` is working
- `npm run test:js` is working
- `npm run test:c` is working
- `npm run test:config` is working
- one-shot headless `pebble screenshot` capture is working
- the headless emulator launches the native watch shell successfully
- PKJS logic is covered by JS tests, but end-to-end PKJS delivery inside the headless emulator remains unresolved
- persistent headless emulator reconnection remains a known limitation and should be handled by a future automation harness
