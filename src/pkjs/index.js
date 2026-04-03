import { createPkjsApp } from "./lib/app.js";

const app = createPkjsApp({
  storage: globalThis.localStorage,
});

function log(message, extra = {}) {
  console.log(`[PKJS] ${message}`, extra);
}

if (typeof Pebble !== "undefined" && Pebble.addEventListener) {
  Pebble.addEventListener("ready", () => {
    log("ready");
    app.refreshStarted();
  });

  Pebble.addEventListener("showConfiguration", () => {
    const configUrl = "http://127.0.0.1:4173";
    log("showConfiguration", { configUrl });
    Pebble.openURL(configUrl);
  });

  Pebble.addEventListener("webviewclosed", (event) => {
    log("webviewclosed", { response: event?.response ?? null });
  });
}

export { app };

