# Telegram Test Environment Plan

## 1. Goal

Use Telegram's official test environment as the first integration target for the PKJS Telegram client.

We are explicitly **not** starting by building:

- a local mock Telegram server
- a replay-fixture system
- a broad CI matrix for Telegram integration

Those can come later if they prove necessary.

## 2. Why This Order

The highest-risk part of this project is protocol correctness, not watch UI.

Because Telegram provides an official test environment for client authorization and API testing, the first useful harness should talk to that real test environment directly. That gives us:

- real auth behavior
- real session behavior
- real chat/message behavior
- real transport behavior

without touching production accounts or production data.

## 3. Official Sources

Telegram's official docs relevant to this plan:

- `Creating your Telegram Application`:
  - https://core.telegram.org/api/obtaining_api_id
- `User Authorization`:
  - https://core.telegram.org/api/auth
- `Telegram Test Environment`:
  - https://core.telegram.org/bug-bounty

The docs establish that:

- client developers obtain `api_id` and `api_hash` from `my.telegram.org`
- Telegram provides separate Test DCs
- test accounts use reserved phone numbers of the form `99966XYYYY`
- test login codes use the form `XXXXX`
- test data may be wiped periodically

## 4. Credentials And Accounts

### 4.1 Application Credentials

We need one Telegram application registration for development.

Official path:

1. Sign in to Telegram with a real account in an official Telegram client.
2. Open `https://my.telegram.org`.
3. Log in.
4. Open `API development tools`.
5. Create an application.
6. Record:
   - `api_id`
   - `api_hash`
   - any Test DC or transport details shown in the developer panel

These credentials are tied to a Telegram account, so they must be obtained manually by someone who controls that account.

### 4.2 Test Accounts

We should create at least:

- `Account A`: primary test user
- `Account B`: second user for DM and group interaction

Initial test coverage only needs two human accounts.

Bot-chat coverage should be deferred until the base client path works on Test DCs.

### 4.3 Local Secret Handling

The harness should read secrets from environment variables, not checked-in files.

Suggested variables:

- `TG_API_ID`
- `TG_API_HASH`
- `TG_TEST_PHONE_A`
- `TG_TEST_PHONE_B`
- `TG_TEST_PASSWORD_A`
- `TG_TEST_PASSWORD_B`

## 5. First Harness Scope

The first harness should validate Telegram integration without involving the watch UI.

That means:

- no Pebble emulator dependency
- no AppMessage dependency
- no watch rendering dependency

Instead, it should exercise a Telegram client module that PKJS can call later.

## 6. Test Harness Shape

The first harness should be a Node-side integration runner around a narrow Telegram adapter boundary.

Recommended layers:

- `TelegramTransport`
  - connection/session mechanics
- `TelegramSession`
  - login, restore, logout
- `TelegramClient`
  - list chats
  - fetch messages
  - send message
  - mark read

The watch app should not depend on these tests yet.

## 7. Test Cases

## 7.1 Auth

- `auth_login_success`
  - log in with a Telegram Test DC account
  - persist session material locally
- `auth_restore_session`
  - restart client using saved session
  - verify reauthorization is not required
- `auth_logout`
  - perform real Telegram logout
  - verify local session is cleared

## 7.2 Chats

- `chats_list_recent`
  - fetch recent chats/dialogs
  - verify at least one known DM or group is present
- `chat_open_recent_messages`
  - fetch recent messages for a known chat
  - verify ordering and sender metadata

## 7.3 Send

- `send_plain_text_dm`
  - send a plain text message from `Account A` to `Account B`
  - verify it appears in subsequent fetch results
- `send_plain_text_group`
  - send a plain text message into a known test group
  - verify it appears in subsequent fetch results

## 7.4 Read State

- `mark_chat_read`
  - open a chat
  - mark it read
  - verify unread state changes

## 7.5 Connection / Sync

- `session_reconnect`
  - disconnect and reconnect
  - verify session restore still works
- `live_update_or_fallback_refresh`
  - if live updates are available in the chosen transport path, verify update delivery
  - otherwise verify timed refresh logic against the test environment

## 8. Minimal Test Data Setup

Before running integration tests, manually prepare:

- one DM thread between `Account A` and `Account B`
- one group containing `Account A` and `Account B`
- a few known messages in each chat

This keeps the first test harness simple and deterministic enough to debug.

## 9. What We Are Deferring

We are intentionally deferring:

- local fake Telegram server
- offline protocol simulator
- replay-fixture capture
- CI automation against Telegram
- bot-chat integration tests
- media/sticker/file cases

These should only be added after the basic Telegram path works.

## 10. Exit Criteria For This Phase

This phase is complete when we can reliably do all of the following against Telegram Test DCs:

- log in
- restore session
- list chats
- open a chat
- send a text message
- mark read
- log out

At that point we can safely connect the Telegram adapter to PKJS and start replacing the current fixture-backed shell.

## 11. Next Step After This Document

The next implementation step should be:

1. define the Telegram adapter interface
2. scaffold the Node-side integration harness
3. wire in credentials from environment variables
4. write the first three tests:
   - login
   - restore session
   - logout

Only after those pass should we implement chat fetch and send.
