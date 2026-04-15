# TG Pebble Product Specification

## 1. Summary

TG Pebble is a Pebble watch application for a user's personal Telegram account.

The application consists of:

- A Pebble watch app written against the RePebble SDK.
- A PebbleKit JS (`pkjs`) component running inside the Pebble mobile app.

The product does **not** use:

- A hosted backend service.
- A native Android companion app.
- A native iOS companion app.
- The installed Telegram mobile app as an application integration point.

The watch app provides three primary views:

- Chat list
- Chat view
- Settings

Message composition is voice-only on microphone-capable devices:

- The user starts compose from a chat.
- Pebble dictation converts speech to text.
- The resulting text is shown in a preview/send box by default.
- The user can then send the text to the active Telegram chat.

On devices without a microphone, the app is read-only and does not render any send action.

## 2. Product Goals

- Let a user browse recent Telegram chats from Pebble.
- Let a user open a chat and read recent messages.
- Let a user send plain-text Telegram messages by voice dictation only.
- Load cached state immediately on app open.
- Refresh in the background while the app is open and reflect sync state clearly.
- Work on all rectangular Pebble devices first.

## 3. Non-Goals For V1

- Hosted sync infrastructure
- Native companion applications
- Round device support
- New chat creation
- Contact search
- Channel support
- Secret chat support
- Media rendering
- Stickers, reactions, edits, deletes, reply-to, bot keyboards, inline keyboards
- A manual text entry UI on the watch
- App-specific notification handling

Media and unsupported content types must be represented as text placeholders only.

## 4. Core Constraints

### 4.1 Platform Constraints

- The watch UI runs as a normal Pebble watch app.
- `pkjs` is the phone-side runtime and the local cache owner.
- `pkjs` only runs while the watch app is active.
- Therefore, background sync is out of scope.
- Data must be shown from cache first, then refreshed while the app is open.

### 4.2 Telegram Constraints

- The app targets the user's personal Telegram account.
- The app maintains its own Telegram session and does not reuse the installed Telegram mobile app's private session.
- The app must authenticate directly against Telegram using bundled application credentials.
- Telegram is the remote system of record.
- `pkjs` cache is the local source of truth for the watch UI.

### 4.3 UI Constraints

- Rectangular devices only in v1.
- Read-only mode on devices without `PBL_MICROPHONE`.
- Compact text-first UI to fit older rectangular hardware.

## 5. High-Level Architecture

### 5.1 Components

1. Watch app
   - Renders all views.
   - Handles navigation.
   - Starts dictation on supported devices.
   - Displays cached and refreshed state sent from `pkjs`.

2. PebbleKit JS
   - Owns the Telegram session.
   - Owns persistent local cache.
   - Talks to Telegram over the user-account API.
   - Fetches updates while the watch app is open.
   - Normalizes chat and message data into a watch-friendly format.
   - Serves data to the watch via `AppMessage`.

3. Telegram
   - Remote source of truth for account state, chats, messages, and read state.

### 5.2 Sync Model

The primary sync path is:

- Persistent cache load from `pkjs`
- Live connection while the app is open
- Incremental update delivery to the watch UI

The desired live path is:

- `pkjs` opens a Telegram live connection over WebSocket/WSS
- `pkjs` catches up state on connect
- `pkjs` applies incoming deltas to the local cache
- `pkjs` pushes compact UI updates to the watch

The fallback path is:

- Periodic refresh every 10 seconds while the app is open if live updates are unavailable or disconnected

## 6. Authentication

### 6.1 App Credentials

- Telegram application credentials are bundled with the product.
- The end user does not manually enter `api_id` or `api_hash`.

### 6.2 User Login Flow

The login flow is hosted in the Pebble phone config page and stores resulting auth state in `pkjs`.

Flow:

1. User opens app config from the Pebble app.
2. User enters phone number.
3. User enters Telegram login code.
4. User enters 2FA password if required.
5. `pkjs` stores session material locally.
6. Watch app can then load chats from cache and refresh from Telegram.

### 6.3 Session Semantics

- The Telegram session lives in `pkjs`.
- Session data must persist across app launches.
- Session data must survive normal app restarts.
- `Clear cache` must not destroy the Telegram session.
- `Logout` must call real Telegram logout and then erase local session and cache.

## 7. Data Model

The watch-facing model is intentionally smaller than Telegram's full model.

### 7.1 Supported Chat Types

- User DMs
- Group chats
- Bot chats

### 7.2 Excluded Chat Types

- Channels
- Secret chats

### 7.3 Chat Summary Model

Each chat list item contains:

- Stable chat ID
- Chat title
- Last message preview text
- Unread count
- Chat type
- Timestamp of last message
- Local sync metadata as needed

### 7.4 Message Model

Each rendered message contains:

- Stable message ID
- Chat ID
- Sender display name
- Direction (`incoming` or `outgoing`)
- Plain text body or placeholder text
- Timestamp
- Consecutive-message grouping metadata

### 7.5 Unsupported Message Rendering

Unsupported content is displayed as a placeholder string, for example:

- `Photo`
- `Sticker`
- `Voice message`
- `File`
- `Unsupported message`

## 8. Cache Model

### 8.1 Cache Ownership

- `pkjs` owns the persistent cache.
- The watch consumes data from `pkjs`.
- The watch may keep minimal transient view state, but not the authoritative application cache.

### 8.2 Cache Contents

The cache stores:

- Auth/session state
- Settings
- Up to 20 most-recent chats for initial list display
- Per-chat recent message windows
- Read-state metadata
- Sync cursors/checkpoints required for incremental refresh

### 8.3 Cache Serving Rules

On app launch:

1. Load cache immediately.
2. Send cached data to the watch immediately.
3. Start live sync.
4. Replace or patch UI state as refreshed data arrives.

If refresh fails:

- Continue showing cached data.
- Mark the sync state as desynced/error.

## 9. Refresh And Sync Behavior

### 9.1 Chat List

- Show 20 chats immediately from cache if available.
- Refresh the list when the app opens.
- Update rows incrementally as fresh data arrives.

### 9.2 Chat View

- Show the 20 most recent messages initially.
- When the user scrolls toward older history, fetch the next older page automatically.
- Older history loading should feel continuous rather than requiring a dedicated full-screen step.

### 9.3 Read State

- Opening a chat marks it as read remotely in Telegram.
- The local cache must update immediately to reflect the new read state.

### 9.4 Connection Policy

Primary:

- Maintain a live sync connection while the watch app is open.

Fallback:

- If the live connection is unavailable, perform a timed refresh every 10 seconds while the app remains open.

### 9.5 Sync Status States

The app exposes exactly three sync states:

- `syncing`
- `synced`
- `desynced`

## 10. Watch UI

### 10.1 Global UI Rules

- All screens must expose the sync state icon at the top-left or top-right and keep it visible.
- The sync state indicator must be present on chat list, chat view, and settings.
- The app should remain compact and legible on older rectangular devices.
- The UI should prioritize text density over decorative layout.

### 10.2 Sync Indicator Semantics

- `syncing`: active spinner or equivalent animated loading indicator
- `synced`: clear positive icon indicating current state is up to date
- `desynced`: clear negative icon indicating refresh failure or disconnected state

### 10.3 Chat List View

The chat list is the default main screen.

Each row shows:

- Chat title
- Last message preview
- Unread badge/count

Expected behavior:

- Select opens the chat view.
- Scrolling should remain responsive even while refresh is active.
- Refreshed list data should patch into the visible list.

### 10.4 Chat View

The chat view is a compact message list.

Rules:

- No bubble-heavy layout in v1.
- Outgoing and incoming messages must be visually distinguishable with lightweight styling.
- In group chats, sender name is shown only over the first message in a consecutive run from that sender.
- If Alice sends three consecutive messages, her name appears once over that run.
- If Bob then sends a message, Bob's name appears over that new run.

### 10.5 Compose Flow

On microphone-capable devices only:

1. User initiates compose from the active chat.
2. App starts Pebble dictation.
3. Dictation returns text.
4. Returned text populates a preview/send UI by default.
5. User confirms send, unless auto-send is enabled.
6. `pkjs` sends the plain-text message to Telegram.

If send fails:

- Keep the dictated text in the preview UI.
- Show send failure state.
- Allow retry without re-dictating.

On non-microphone devices:

- Do not render the compose/send option at all.

### 10.6 Settings View

The on-watch settings view exists for navigation consistency if needed, but settings are primarily configured via the Pebble phone config page.

V1 settings:

- Send mode: `Preview` or `Auto-send`
- Clear cache
- Logout

## 11. Phone Config Page

The Pebble phone config page is responsible for:

- Login
- Session management actions
- Persistent settings storage in `pkjs`

Required config actions:

- Login
- Change send mode
- Clear cache
- Logout

Config rules:

- Settings must persist in `pkjs`.
- `Clear cache` removes chats and messages only.
- `Logout` performs Telegram logout and then clears all local auth/session/cache state.

## 12. Sending Rules

- V1 sends plain text only.
- No manual typing on the watch.
- No attachments.
- No message edit/delete.
- No reactions.
- No reply threading.
- No bot keyboard interactions.

## 13. Error Handling

### 13.1 Refresh Errors

- Keep showing last cached state.
- Set sync status to `desynced`.
- Do not force the user out of the current screen.

### 13.2 Send Errors

- Preserve dictated preview text.
- Show send failure state in the preview/send UI.
- Allow explicit retry.

### 13.3 Auth Errors

- If session refresh fails due to invalid auth, transition to logged-out state.
- Require login again through the phone config page.

## 14. Device Support

### 14.1 Included In V1

- All rectangular Pebble devices

### 14.2 Input Capability Rules

- Microphone-capable devices: full read/write experience
- Non-microphone devices: read-only experience

### 14.3 Deferred

- Round devices

## 15. Implementation Notes

### 15.1 Watch App

Expected watch-side screens:

- Launch/loading shell
- Chat list window
- Chat window
- Send preview window
- Settings window

Expected watch-side responsibilities:

- Window stack and navigation
- List rendering
- Incremental append/prepend of message history
- Dictation session integration
- Sync status icon rendering

### 15.2 PKJS

Expected `pkjs` responsibilities:

- Persistent storage layer
- Telegram auth/session bootstrap
- Refresh orchestration
- Live connection management
- Incremental cache updates
- Pagination for history
- Message send requests
- Config page state management

### 15.3 Messaging Between Watch And PKJS

The watch/phone protocol should support at least:

- App ready
- Request cached chat list
- Request chat page
- Request older messages for active chat
- Open chat / mark read
- Start send
- Send message
- Refresh status update
- Auth state update
- Settings update

## 16. Open Technical Risks

These are accepted risks for the chosen no-backend architecture:

- Implementing a personal-account Telegram client directly in `pkjs` is significantly more complex than a typical Pebble app.
- Live update handling and session maintenance must work within the `pkjs` runtime rather than a native companion or backend.
- Older rectangular devices have tighter memory and display constraints, so paging and compact payload design are required.
- Unsupported Telegram content must degrade gracefully into placeholders without breaking list or chat rendering.

## 17. Acceptance Criteria For V1

V1 is complete when the following are true:

- A user can log in to their Telegram account through the phone config flow.
- The app opens and immediately renders cached chat list data if present.
- The app visibly indicates `syncing`, `synced`, and `desynced` states on every main screen.
- The chat list shows 20 recent chats with title, last-message preview, and unread badge.
- Opening a chat loads and shows 20 recent messages.
- Scrolling older in a chat fetches and renders older messages progressively.
- Opening a chat marks it as read remotely.
- On microphone-capable rectangular devices, the user can dictate a message, preview it, and send it as plain text.
- If sending fails, the dictated text remains available for retry.
- On non-microphone rectangular devices, send controls are absent and the app remains readable.
- `Clear cache` preserves the session but removes cached chats and messages.
- `Logout` logs out of Telegram and clears local session and cache.
