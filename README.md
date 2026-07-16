# tg

## For Users

![tg icon](./assets/tg-pebble-icon-144.png)

tg is an unofficial Telegram client for Pebble watches. Read your Telegram messages on-wrist and send replies using dictation through the Pebble companion-hosted config flow.

![Sign-in required](./docs/screenshots/other/sign-in-required.png)
![Chat list](./docs/screenshots/other/chat-list.png)
![Chat open](./docs/screenshots/other/chat-open.png)
![Dictation preview](./docs/screenshots/other/dictation-preview.png)
![Dictation sent](./docs/screenshots/other/dictation-sent.png)
![Emery chat list](./docs/screenshots/emery/chat-list.png)
![Emery chat open](./docs/screenshots/emery/chat-open.png)

## For Developers

This repo contains the Pebble watch app, PKJS Telegram client, hosted config page, emulator test harness, and CI workflows for Pages and public `.pbw` builds. Run `npm run test:pre-release` for the full local gate, `npm run build:watch` for a package build, and use [docs/publishing.md](./docs/publishing.md) plus the implementation docs under [docs/implementation](./docs/implementation) for the build, test, and release details.

The Telegram codec currently negotiates API layer 198. Run `npm run check:tl-schema` for the offline generated-schema and reviewed-layer checks, or `npm run check:tl-schema:remote` to compare the acknowledged layer with Telegram's official machine-readable config.
