# Agent Runbook

## Phone Sideload Deploy

Use this runbook when asked to build and install the Pebble app onto the paired phone.

### Prerequisites

- The Pebble SDK and `pebble` CLI must be installed.
- The phone must be paired and reachable by `pebble install --phone`.
- `.env.telegram.test` must exist at the repo root.
- `.env.telegram.test` must contain real Telegram app credentials:
  - `TG_API_ID`
  - `TG_API_HASH`
- The hosted config page should already be live at `https://nick1udwig.github.io/tg-pebble/config/`.

Do not print or commit Telegram API credentials.

### Command

Run:

```bash
npm run deploy:phone
```

This calls `scripts/build-and-install-phone.sh`.

### What The Script Does

1. Reads `TG_API_ID` and `TG_API_HASH` from `.env.telegram.test`.
2. Exports them for the app build as:
   - `TG_PEBBLE_APP_API_ID`
   - `TG_PEBBLE_APP_API_HASH`
3. Sets phone-side Telegram transport settings:
   - `TG_PEBBLE_APP_FORCE_WSS=1` by default so Core Devices iOS uses Telegram's secure web endpoint on port 443.
   - `TG_TEST_USE_WSS` is intentionally not copied from `.env.telegram.test`; it is for Node-side tests, while phone builds use the app-specific secure transport default above.
   - `TG_TEST_SERVERS` -> `TG_PEBBLE_APP_TEST_SERVERS`
4. Sets `TG_PEBBLE_APP_CONFIG_URL`.
   - Uses an existing environment value if present.
   - Else uses `TG_CONFIG_URL` from `.env.telegram.test` if present.
   - Else defaults to `https://nick1udwig.github.io/tg-pebble/config/`.
5. Runs `npm run build:watch`.
6. Runs:

```bash
pebble install build/tg-pebble.pbw --phone
```

### Useful Checks

Before deploying:

```bash
curl -sL -o /tmp/tg-pebble-config.html -w '%{http_code}\n' https://nick1udwig.github.io/tg-pebble/config/
```

Expected result: `200`.

After a successful install, open the app settings from the Pebble app. The config page should show `Send Code & Close`.

### Troubleshooting

- If the script says `.env.telegram.test` is missing, create it from `.env.telegram.test.example`.
- If Telegram never sends a login code and logs show `venus.web.telegram.org:80` or an immediate WebSocket error, the build selected cleartext transport. Re-run `npm run deploy:phone` and confirm the script prints `Telegram transport WSS enabled: 1`.
- If the config page opens as localhost, the PBW was built without embedded Telegram credentials. Re-run `npm run deploy:phone`.
- If the phone install fails, verify the Pebble phone app is running, paired, and reachable by `pebble install --phone`.
- If the config page URL is wrong, rerun with:

```bash
TG_PEBBLE_APP_CONFIG_URL=https://nick1udwig.github.io/tg-pebble/config/ npm run deploy:phone
```
