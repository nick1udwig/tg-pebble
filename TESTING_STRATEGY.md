# TG Pebble Testing Strategy

This document defines the regression, frontend, emulator, and release-testing strategy for TG Pebble.

It is written for the architecture in [SPEC.md](/root/git/tg-pebble/SPEC.md):

- Pebble watch app
- PebbleKit JS (`pkjs`)
- No hosted backend
- No native companion app
- Personal Telegram account session owned by `pkjs`

## 1. Testing Goals

The testing strategy must catch regressions in five areas:

1. `pkjs` session, cache, and sync behavior
2. Watch-side UI state and navigation
3. Voice compose and send flows
4. Config-page frontend behavior
5. Cross-platform behavior on all rectangular Pebble targets

The strategy must also reduce risk in the hardest part of the project:

- implementing a personal-account Telegram client in `pkjs`

## 2. Testing Principles

### 2.1 Deterministic First

CI should not depend on the live Telegram network.

Most tests must run against:

- pure unit-test fixtures
- mocked `pkjs` dependencies
- emulator-driven watch flows
- local fake Telegram transport or recorded protocol fixtures

Live Telegram testing should be a small, explicit smoke-test layer only.

### 2.2 Test At Boundaries

The codebase should be structured so that the following seams are testable independently:

- Telegram transport layer
- cache/store layer
- sync reducer/state machine
- watch/phone message protocol
- watch-side view-model shaping
- config-page frontend

### 2.3 Keep Visual Tests Honest

Visual correctness should be verified with deterministic screenshot diffs.

LLM or browser-agent tooling can help inspect and fix UI issues, but it should not be the pass/fail oracle.

## 3. Recommended Tooling

### 3.1 JavaScript / PKJS Tests

Use `Vitest` for the JavaScript test runner.

Reasons:

- fast local feedback
- fake timers for polling/retry tests
- straightforward mocking of `WebSocket`, `XMLHttpRequest`, `localStorage`, and Pebble globals
- easy snapshot and fixture support
- easy reuse for config-page logic

`Jest` would also work, but `Vitest` is the preferred default unless an existing repo constraint says otherwise.

### 3.2 Config Page Browser Tests

Use `Playwright`.

Reasons:

- the config page is a real web frontend
- Playwright can verify login flow, validation, settings persistence, and logout/clear-cache UI
- traces and screenshots are useful for debugging layout regressions

### 3.3 Watch-Side C Logic Tests

Use a lightweight host-compiled C test harness for the initial scaffold, with an easy path to a vendored framework such as `Unity` if the suite grows.

Reasons:

- lightweight and easy to bootstrap
- suitable for host-compiled pure C logic
- good fit for embedded-style projects

Do not try to unit-test Pebble SDK UI primitives directly. Instead, extract pure logic into small C modules and test those on the host.

### 3.4 Emulator Tests

Use the official Pebble SDK emulator plus the `pebble` CLI.

Important official tools:

- `pebble install --emulator <platform>`
- `pebble logs`
- `pebble screenshot`
- `pebble gdb`
- `pebble emu-app-config`
- `pebble emu-bt-connection`
- `pebble transcribe`

Relevant official references:

- [Command Line Tool](https://developer.repebble.com/guides/tools-and-resources/pebble-tool/)
- [Debugging with App Logs](https://developer.repebble.com/guides/debugging/debugging-with-app-logs/)
- [Debugging with GDB](https://developer.repebble.com/guides/debugging/debugging-with-gdb/)

### 3.5 Visual Regression

Use `pixelmatch` or `odiff` for screenshot comparison.

Recommendation:

- `pixelmatch` if we want a pure Node workflow
- `odiff` if we want a faster image-diff binary

### 3.6 AI / Agent-Assisted UI Work

Use agent tooling as a secondary workflow on top of deterministic tests:

- Playwright traces and screenshots for config-page debugging
- emulator screenshots for watch UI review
- LLM visual review for clipping, truncation, contrast, icon clarity, and layout density

Agents are useful for:

- exploring edge cases
- proposing UI fixes
- triaging visual diffs
- manipulating the config-page frontend during exploratory testing

Agents are not the source of truth for regression pass/fail.

## 4. Test Pyramid

The project should use four main layers.

### 4.1 Layer 1: Fast Unit Tests

These run on every change and should be the majority of the suite.

#### PKJS unit tests

Cover:

- cache reads and writes
- cache eviction and pagination rules
- session lifecycle
- login state transitions
- sync-state reducer
- message placeholder mapping
- chat list shaping
- sender-run grouping metadata
- send retry and error retention behavior
- settings persistence
- refresh fallback timing logic

Mock:

- `WebSocket`
- `XMLHttpRequest`
- `localStorage`
- Pebble JS bridge APIs
- timers

#### Watch-side pure-C unit tests

Cover only logic extracted away from Pebble SDK calls, for example:

- sender-run grouping
- unread badge formatting
- sync-icon state mapping
- pagination threshold logic
- message placeholder selection
- view-model truncation helpers

Do not put UI layout code that depends directly on Pebble layers into host-side unit tests.

### 4.2 Layer 2: Contract Tests

These verify agreements between subsystems.

#### Watch/PKJS message contract tests

Test the schema for:

- app ready
- auth state
- chat list page
- chat page
- older-history page
- mark read
- send request
- send result
- sync status
- settings update

These tests should use golden fixtures so any protocol change is explicit in review.

#### Telegram adapter contract tests

The Telegram adapter should be wrapped behind an interface.

The tests should prove that:

- raw Telegram responses are normalized into internal models
- unsupported content becomes placeholders
- incremental updates patch the cache correctly
- auth errors produce logged-out state

For CI, use fixture replay or a local fake transport.

### 4.3 Layer 3: Emulator Integration Tests

These verify that the built app behaves correctly on actual watch firmware in QEMU.

Use the emulator for:

- screen navigation
- watch/PKJS message exchange
- sync icon visibility
- cached-first launch
- progressive chat loading
- dictation flow
- failure states
- non-microphone read-only behavior

Important emulator hooks:

- `pebble transcribe "hello"` for deterministic dictation success
- `pebble transcribe --error connectivity`
- `pebble transcribe --error disabled`
- `pebble transcribe --error no-speech-detected`
- `pebble emu-bt-connection --connected no` to simulate phone disconnect
- `pebble screenshot` to capture visual state
- `pebble logs` to assert expected lifecycle markers

### 4.4 Layer 4: Release Smoke Tests

This is a small layer and should be run manually or in a protected environment.

Cover:

- one real Telegram login
- one real DM read
- one real group read
- one real bot chat read
- one successful dictated send on a microphone-capable device
- logout and relogin

Use a sacrificial Telegram account dedicated to testing.

## 5. Test Architecture Requirements

To make the above practical, implementation should follow these rules.

### 5.1 Telegram Adapter Abstraction

The `pkjs` code must not scatter Telegram protocol logic across the app.

Create a dedicated adapter boundary:

- `TelegramTransport`
- `TelegramSession`
- `TelegramSyncEngine`
- `TelegramNormalizer`

This allows tests to replace the real adapter with:

- replay fixtures
- fake server responses
- forced auth failures
- forced disconnects

### 5.2 Cache Store Abstraction

Wrap `localStorage` behind a store interface.

This makes it possible to test:

- cache migrations
- corrupt cache recovery
- clear-cache behavior
- session preservation across cache clears

### 5.3 Watch Protocol Boundary

Treat the watch/PKJS `AppMessage` protocol as a versioned interface.

Add:

- message-key constants in one place
- payload builders/parsers in one place
- fixture-based tests for every payload type

### 5.4 View-Model Shaping

The watch UI should receive already-shaped view models whenever possible.

This keeps Pebble C code simpler and makes regressions easier to pin to:

- normalization bugs
- protocol bugs
- UI rendering bugs

## 6. Emulator Strategy

### 6.1 Platform Matrix

For all-rectangular support, the emulator matrix should cover at least:

1. `aplite`
   - smallest rectangular display
   - black-and-white
   - lowest memory pressure
   - no microphone path

2. `basalt`
   - legacy color rectangular target
   - dictation-capable path

3. newest rectangular QEMU platform available in the installed SDK
   - currently `snowy_emery` in SDK `4.9.127+`
   - validates larger modern rectangular hardware behavior

If the installed SDK exposes more rectangular emulators, add them to the nightly matrix.

### 6.2 What To Assert Per Platform

On `aplite`:

- app launches without memory or resource failures
- send action is absent
- chat list remains legible in black-and-white
- chat view placeholders render correctly

On `basalt`:

- dictation flow works via `pebble transcribe`
- preview/send flow behaves correctly
- sync icon states are visible

On newest rectangular emulator:

- larger-screen layout remains compact and not sparse
- top-corner sync icon remains visible
- longer titles and previews render correctly

### 6.3 Emulator Automation Approach

The emulator should not rely only on brittle manual keypress automation.

Preferred approach:

1. Add a `TEST_HARNESS` build mode.
2. In test mode, expose hidden watch commands over `AppMessage` to:
   - open chat list
   - open a specific chat fixture
   - enter preview screen
   - trigger loading state
   - trigger synced/desynced state
   - scroll to pagination boundaries
3. Use the emulator only for rendering and Pebble-runtime behavior.

Fallback approach:

- drive emulator buttons with OS-level key injection where necessary

The test harness build should never ship in release builds.

## 7. Frontend Testing Strategy

There are two frontends:

1. the watch UI
2. the Pebble phone config page

### 7.1 Watch UI Frontend Tests

Use emulator screenshots plus fixture-driven watch state injection.

Required visual baselines:

- chat list, syncing
- chat list, synced
- chat list, desynced
- chat list with unread badges
- chat view with grouped sender names
- chat view with placeholder media rows
- send preview success-ready state
- send preview error/retry state
- non-mic device chat view with no compose affordance

Every baseline should exist at least for:

- `aplite`
- `basalt`
- newest rectangular emulator

### 7.2 Config Page Frontend Tests

Use `Playwright`.

Cover:

- login form validation
- code entry flow
- 2FA password flow
- send-mode toggle persistence
- clear-cache confirmation flow
- logout confirmation flow
- error rendering

Mock the `Pebble` JS bridge so the config page can be tested as a normal browser app.

### 7.3 Visual Regression Rules

When taking screenshot diffs:

- freeze clocks and timestamps
- use fixed fixture data
- disable animated spinner frames if necessary for deterministic capture
- capture the same screen at the same state each run

If spinner animation prevents stable diffs, use a test-only static loading glyph.

## 8. Dictation Testing

The dictation flow is critical and should be automated with the official transcription tool.

Required test cases:

- dictation success with preview mode
- dictation success with auto-send mode
- dictation disabled error
- dictation connectivity error
- dictation no-speech-detected error
- send failure after a successful transcription
- retry send without re-dictating

Use:

- `pebble transcribe "test message"`
- `pebble transcribe --error <kind>`

The watch-side tests should assert:

- preview text appears
- auto-send bypasses preview only when enabled
- failure preserves preview text
- no send action exists on non-microphone devices

## 9. Sync And Cache Regression Tests

Because the product is cache-first, these tests are mandatory.

### 9.1 Cache Boot Tests

Cover:

- cold start with empty cache
- warm start with valid cache
- warm start with stale cache
- warm start with corrupt cache
- clear cache while logged in
- logout after valid cache exists

### 9.2 Sync Tests

Cover:

- initial sync after launch
- live-update patch into chat list
- live-update patch into open chat
- disconnect to desynced state
- reconnect to synced state
- fallback timed refresh when live connection is unavailable

### 9.3 Pagination Tests

Cover:

- initial 20 chats
- initial 20 messages
- fetch older messages on upward scroll boundary
- duplicate-message dedupe during pagination
- stable ordering after incremental refresh

## 10. Failure-Injection Matrix

Regression coverage should explicitly inject failures in:

- Telegram auth
- Telegram transport disconnect
- malformed Telegram payload
- corrupt local cache
- `AppMessage` send failure
- dictation service failure
- send-message rejection
- mark-read failure

Each failure should have an expected user-visible outcome.

## 11. Logging And Debugging Strategy

### 11.1 Structured Logs

Use structured log prefixes in both C and JS.

Examples:

- `AUTH`
- `SYNC`
- `CACHE`
- `PROTO`
- `SEND`
- `DICTATION`
- `UI`

This makes `pebble logs` useful in CI and local triage.

### 11.2 Crash Triage

Use:

- `pebble build --debug`
- `pebble gdb --emulator <platform>`

GDB is not the main test runner. It is the crash-analysis tool for:

- watch crashes
- memory corruption
- null dereferences
- bad view-state transitions

## 12. CI Recommendations

### 12.1 Per-PR Required Checks

Every pull request should run:

1. JavaScript unit tests
2. Config-page browser tests
3. Host-side C unit tests
4. Build for every supported rectangular platform
5. Emulator smoke tests on:
   - `aplite`
   - `basalt`
   - newest rectangular emulator
6. Visual regression on a small golden set

### 12.2 Nightly Checks

Nightly should run:

1. full visual baseline matrix
2. dictation error matrix
3. cache migration tests
4. long-running sync/poll stability tests
5. optional live Telegram smoke test against a dedicated test account

## 13. Suggested Repo Layout

Recommended test layout:

```text
tests/
  js/
    unit/
    contract/
    fixtures/
  c/
    unit/
  emulator/
    scenarios/
    baselines/
    artifacts/
  config-page/
    e2e/
    fixtures/
scripts/
  test-js.sh
  test-c.sh
  test-emulator.sh
  capture-baselines.sh
  review-visual-diffs.sh
```

## 14. AI / LLM Workflow

LLM coding agents should be used in a constrained, auditable workflow.

### 14.1 Good Uses

- inspect Playwright screenshots and traces for config-page issues
- inspect watch screenshots for clipping, truncation, low contrast, and spacing problems
- generate targeted CSS or layout fixes for the config page
- generate small watch-layout adjustments after visual review
- review diff artifacts and summarize likely regressions

### 14.2 Bad Uses

- deciding whether a regression passes without deterministic evidence
- replacing unit tests
- replacing screenshot diffs
- replacing emulator integration tests

### 14.3 Recommended Agent Loop

1. Run deterministic tests.
2. If visual diffs fail, collect artifacts.
3. Feed screenshot pairs and traces to an agent.
4. Let the agent propose a narrow fix.
5. Re-run deterministic tests.
6. Accept only if deterministic tests pass.

For the config-page frontend, browser-capable agents can be useful during exploratory work, but all important flows still need Playwright coverage.

## 15. Release Gate

A release candidate should not ship unless all of the following are true:

- all JS unit tests pass
- all C unit tests pass
- all config-page browser tests pass
- emulator smoke tests pass on the rectangular matrix
- visual diff suite has no unexplained changes
- dictation success and error scenarios pass
- clear-cache and logout behavior are verified
- one real-account smoke test passes on an actual microphone-capable rectangular watch

## 16. Initial Implementation Priorities

The first testing work to build should be:

1. PKJS unit-test harness with mocked transport and mocked `localStorage`
2. watch/PKJS contract fixtures
3. Playwright tests for the config page
4. emulator smoke harness using `pebble transcribe`, `pebble screenshot`, and `pebble logs`
5. screenshot baselines for `aplite`, `basalt`, and newest rectangular emulator

This order gives the best risk reduction early.
