# Publishing Notes

## Public Config Page

The Pebble config page for published builds is intended to be served from:

- `https://nick1udwig.github.io/tg-pebble/config/`

Generate the hosted static files from the current source config page with:

```bash
npm run build:config:docs
```

That copies `src/config/` to `docs/config/` for GitHub Pages style hosting.

## Embedded Telegram App Credentials

Published builds can embed app-owned Telegram credentials directly into PKJS at build time.

Set these environment variables before building the watch app:

- `TG_PEBBLE_APP_API_ID`
- `TG_PEBBLE_APP_API_HASH`
- `TG_PEBBLE_APP_CONFIG_URL` (optional)
- `TG_PEBBLE_APP_FORCE_WSS` (optional)
- `TG_PEBBLE_APP_TEST_SERVERS` (optional)

Example:

```bash
set -a
. ./.env.telegram.app.example
set +a

npm run build:config:docs
npm run build:watch
```

`TG_PEBBLE_APP_CONFIG_URL` defaults to the GitHub Pages config URL above when omitted.

## Precedence Rules

Telegram runtime config is loaded in this order:

1. runtime env (`TG_API_ID`, `TG_API_HASH`, etc.)
2. emulator-seeded PKJS storage (`tg_pebble:runtime_config`)
3. embedded build-time app credentials (`TG_PEBBLE_APP_*`)

That keeps local testing flexible while letting published builds sign in real users without emulator-only setup.
