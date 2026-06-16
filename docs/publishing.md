# Publishing Notes

## App Icon

Use [`assets/tg-pebble-icon.png`](../assets/tg-pebble-icon.png) as the watch app menu icon and the app store submission icon.

## Public Config Page

The Pebble config page for published builds is intended to be served from:

- `https://nick1udwig.github.io/tg-pebble/config/`

The Pages root URL redirects there:

- `https://nick1udwig.github.io/tg-pebble/`

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


## GitHub Repository Secrets

Add these repository secrets in GitHub under `Settings -> Secrets and variables -> Actions`:

- `TG_PEBBLE_APP_API_ID`
- `TG_PEBBLE_APP_API_HASH`
- optional: `TG_PEBBLE_APP_CONFIG_URL`

Recommended values:

- `TG_PEBBLE_APP_API_ID`: your Telegram application API ID
- `TG_PEBBLE_APP_API_HASH`: your Telegram application API hash
- `TG_PEBBLE_APP_CONFIG_URL`: `https://nick1udwig.github.io/tg-pebble/config/`

The `Public Build` workflow consumes these secrets to build the release `.pbw`. Do not commit the real values into the repo.

## GitHub Actions Workflows

This repo now uses CI for both public build output and Pages deployment:

- `.github/workflows/public-build.yml`: builds the public `.pbw` on push to `master` and on manual dispatch, using the Telegram app secrets above
- `.github/workflows/pages.yml`: builds `docs/config/` and deploys the full `docs/` tree to GitHub Pages on push to `master` and on manual dispatch

## GitHub Pages Setup

To use the Actions-based Pages deployment:

1. Push `master` with the new workflow files.
2. In GitHub, open `Settings -> Pages`.
3. Set `Build and deployment` to `GitHub Actions`.
4. Save if GitHub prompts for confirmation.
5. Let the `Deploy Pages` workflow run.
6. Verify `https://nick1udwig.github.io/tg-pebble/config/` loads the config page.

After that, new pushes to `master` will redeploy the config page automatically.
