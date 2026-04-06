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

### 4.4 Telegram Test Environment Integration

Run:

```bash
npm run test:telegram
```

This suite is opt-in. It can target either:

- Telegram's official test environment
- a live Telegram account when `TG_TEST_SERVERS=0`

It only runs when all required environment variables are set and `TG_TEST_ENABLE=1`.

Required variables:

- `TG_API_ID`
- `TG_API_HASH`

Optional variables:

- `TG_SESSION_STRING`
- `TG_TEST_ALLOW_SEND_CODE`
- `TG_TEST_ALLOW_SEND`
- `TG_TEST_ALLOW_LOGOUT`
- `TG_TEST_PREFER_SIGN_UP`
- `TG_TEST_TARGET_PEER`
- `TG_TEST_MUTATION_TEXT_PREFIX`
- `TG_TEST_PHONE`
- `TG_TEST_CODE`
- `TG_TEST_PASSWORD`
- `TG_TEST_USE_WSS`
- `TG_TEST_SERVERS`

An example file is provided at:

- `.env.telegram.test.example`

Get app credentials from:

- `https://my.telegram.org`
- then `API development tools`

Reference docs:

- `https://core.telegram.org/api/obtaining_api_id`
- `https://core.telegram.org/api/auth`

#### Production-Safe Live Account Mode

For a real throwaway Telegram account, the safe default is:

- `TG_TEST_SERVERS=0`
- `TG_SESSION_STRING=<saved authorized gramjs session>`
- do not set `TG_TEST_ALLOW_SEND_CODE=1`
- keep `TG_TEST_ALLOW_LOGOUT=0`

This avoids:

- sending a new login code on every test run
- repeated sign-in churn against a live account
- invalidating the live session with `auth.LogOut`

If you run production Telegram tests without `TG_SESSION_STRING`, `scripts/test-telegram.sh` now refuses to start unless you explicitly opt into fresh code login with:

```bash
TG_TEST_ALLOW_SEND_CODE=1
```

Do not enable:

```bash
TG_TEST_ALLOW_LOGOUT=1
```

unless you intentionally want the suite to perform a real Telegram logout on that account.

The live mutation suite is also opt-in. To test a real send:

```bash
TG_TEST_ALLOW_SEND=1
TG_TEST_TARGET_PEER=me
```

By default this sends to `Saved Messages` (`me`), which is the safest live target. Each send uses a unique prefix/timestamp marker and verifies that the message appears in recent history. The default `test:telegram` command still runs this suite, but the mutation tests remain skipped unless you explicitly enable them.

#### Create A Saved Session String

To create `TG_SESSION_STRING` for a live throwaway account:

1. Set these variables in [`.env.telegram.test`](/root/git/tg-pebble/.env.telegram.test):

```bash
TG_TEST_ENABLE=1
TG_TEST_SERVERS=0
TG_API_ID=...
TG_API_HASH=...
TG_TEST_USE_WSS=1
```

2. Load the env file and run:

```bash
set -a
source ./.env.telegram.test
set +a
npm run telegram:session
```

3. Enter:

- the phone number for the throwaway real Telegram account
- the login code
- the 2FA password if the account has one

4. Copy the printed line:

```bash
TG_SESSION_STRING=...
```

into [`.env.telegram.test`](/root/git/tg-pebble/.env.telegram.test).

5. Keep these production-safe settings:

```bash
TG_TEST_SERVERS=0
TG_TEST_ALLOW_LOGOUT=0
```

6. Run the live integration suite:

```bash
set -a
source ./.env.telegram.test
set +a
npm run test:telegram
```

### 4.5 Full Non-Emulator Test Pass

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

### 4.6 Run The Automated Emulator Smoke Test

Run:

```bash
npm run test:emulator
```

This now performs a real smoke pass:

- builds the app
- starts a manual `qemu-pebble` session under `xvfb-run`
- starts a long-lived `pypkjs` sidecar against that QEMU instance
- uses an isolated per-run persist directory so PKJS settings and watch state do not leak across test runs
- installs the app through the pypkjs websocket path
- captures the chat list
- injects `Down` and `Select`
- captures the first chat view
- starts `pebble transcribe`
- captures the dictation listening screen
- captures the dictation preview window
- sends the previewed message
- captures the updated chat view

Artifacts are written to:

- `tests/emulator/artifacts/chat-list.png`
- `tests/emulator/artifacts/chat-open.png`
- `tests/emulator/artifacts/dictation-listening.png`
- `tests/emulator/artifacts/dictation-preview.png`
- `tests/emulator/artifacts/dictation-sent.png`

### 4.7 Run The Emulator Manually

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

This is still useful for quick manual inspection, but the more reliable headless automation path now uses:

```bash
bash scripts/start-qemu-pkjs-session.sh basalt build/tg-pebble.pbw build/tests/emulator-session.json
```

Optional fourth argument:

```bash
bash scripts/start-qemu-pkjs-session.sh basalt build/tg-pebble.pbw build/tests/emulator-session.json build/tests/emulator-persist
```

Use that when you want an isolated PKJS/watch persistence directory instead of the default SDK persist path.

That script:

- launches `qemu-pebble` directly
- launches `pypkjs` directly
- writes a session file with the QEMU, PKJS, and monitor ports
- installs the app through the pypkjs websocket transport

Stop that session with:

```bash
bash scripts/stop-qemu-pkjs-session.sh build/tests/emulator-session.json
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

### 4.8 Emulator-Side CLI Commands

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

For the manual QEMU harness, use the QEMU monitor helper instead of relying on `--emulator` reconnect semantics:

```bash
python3 scripts/qemu-monitor.py --port MONITOR_PORT sendkey x s
python3 scripts/qemu-monitor.py --port MONITOR_PORT screendump tests/emulator/artifacts/frame.ppm
```

The official emulator docs map watch buttons to keyboard input as follows:

- Back: `Q`
- Up: `W`
- Select: `S`
- Down: `X`

Those keys are what the monitor helper injects through `sendkey`.

## 5. Pebble Screenshot And Screendumps

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

### 5.2 Which screenshot path is recommended now?

There are two useful paths:

1. one-shot screenshot capture with `pebble screenshot --emulator ...`
2. stable artifact capture from a manual QEMU session using the monitor `screendump` command

For repeatable automation, prefer the second path.

The smoke harness uses:

```bash
python3 scripts/qemu-monitor.py --port MONITOR_PORT screendump tests/emulator/artifacts/chat-list.ppm
/root/.local/share/uv/tools/pebble-tool/bin/python - <<'PY'
from PIL import Image
Image.open("tests/emulator/artifacts/chat-list.ppm").convert("RGBA").save("tests/emulator/artifacts/chat-list.png")
PY
```

This avoids the `pebble --emulator` reconnection edge cases entirely while still producing a normal PNG artifact.

## 6. Gotchas And Workarounds

### 6.1 `--emulator` reconnects are sensitive to VNC state

The RePebble CLI treats:

- `--emulator basalt`
- `--emulator basalt --vnc`

as different emulator shapes.

If the live emulator was started with VNC and a follow-up command omits `--vnc`, `pebble-tool` may kill the existing QEMU and attempt to spawn a new one, which fails in headless shells with:

```text
Could not initialize SDL(x11 not available) - exiting
```

### 6.2 Manual `qemu-pebble + pypkjs` is the stable headless path

The most reliable flow we found is:

1. start `qemu-pebble` directly under `xvfb-run`
2. start `pypkjs` directly against that QEMU port
3. install the app with `pebble install --qemu localhost:PORT`
4. drive navigation through the QEMU monitor
5. capture frames with the QEMU monitor `screendump`

That is what `scripts/start-qemu-pkjs-session.sh`, `scripts/qemu-monitor.py`, and `scripts/test-emulator.sh` now automate.

### 6.3 The pypkjs state file changes how `--qemu` behaves

When `/tmp/pb-qemu-pypkjs-<port>.json` exists, `pebble-tool` will route `--qemu localhost:<port>` commands through the pypkjs websocket instead of opening a direct socket to QEMU.

This is desirable for:

- `pebble install`
- phone-side app communication

But it is less desirable for low-level emulator control and screenshots.

That is why the smoke harness uses the QEMU monitor directly for:

- button injection
- frame capture

instead of relying on `pebble emu-button` or `pebble screenshot` against the live session.

### 6.4 `pypkjs` logs noisy websocket handler exceptions after short-lived CLI calls

After short-lived websocket clients disconnect, `pypkjs` may log a `TypeError: 'NoneType' object is not iterable` from the gevent websocket handler.

In this environment that noise did not prevent:

- app install
- PKJS startup
- AppMessage delivery

But it does make the raw logs look worse than the actual state of the session.

### 6.5 Stale state files still matter

These files can point later commands at dead sessions:

- `/tmp/pb-emulator.json`
- `/tmp/pb-qemu-pypkjs-*.json`

If emulator commands start connecting to the wrong place, clear those files and relaunch the session.
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

### 6.7 PKJS Runtime Compatibility In The Emulator

Problem:

- the watch app launched correctly
- `pypkjs` launched correctly
- but the bundled PKJS crashed immediately on startup

Observed behavior under a verbose launch:

```bash
xvfb-run -a pebble install -vv build/tg-pebble.pbw --emulator basalt --logs
```

The key failure looked like:

```text
SyntaxError: Cannot use import statement outside a module
```

Root cause:

- the RePebble SDK bundles PKJS with an older Webpack/pypkjs stack
- multi-file PKJS was enabled correctly through `package.json`
- but the runtime still expected CommonJS-style modules, not source files using ESM `import` / `export`

Fix:

- keep `pebble.enableMultiJS: true` in `package.json`
- write PKJS sources using CommonJS:
  - `require(...)`
  - `module.exports = ...`

Verification:

- `pypkjs` starts
- the watch receives `sync_status`, `settings_state`, `chat_item`, and `chat_list_complete`
- live chat-list screenshots now work, for example:
  - [build/tests/live-chat-list.png](/root/git/tg-pebble/build/tests/live-chat-list.png)

### 6.8 Stale Emulator Metadata In `/tmp`

Problem:

- after interrupted emulator runs, `pebble-tool` could incorrectly think QEMU / `pypkjs` were still alive
- subsequent commands would then try to reuse dead ports and fail with connection errors

Observed files:

- `/tmp/pb-emulator.json`
- `/tmp/pb-qemu-pypkjs-*.json`

Symptom shape:

```text
QEMU is already running.
pypkjs is already running.
[Errno 111] Connection refused
```

Fix:

```bash
pebble kill || true
rm -f /tmp/pb-emulator.json /tmp/pb-qemu-pypkjs-*.json
```

Use that cleanup before retrying a fresh headless emulator launch if the CLI claims to be reusing dead emulator state.

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
- end-to-end PKJS delivery in the headless emulator is working after the CommonJS conversion
- persistent headless emulator reconnection remains a known limitation and should be handled by a future automation harness
