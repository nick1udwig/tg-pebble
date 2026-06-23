import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG_URL,
  loadTelegramRuntimeConfig,
  RUNTIME_CONFIG_STORAGE_KEY,
} from "../../../src/pkjs/lib/runtime_config.js";

function createMemoryStorage(initialData = {}) {
  const data = new Map(Object.entries(initialData));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("loadTelegramRuntimeConfig", () => {
  it("loads Telegram config from process-style env values", () => {
    const config = loadTelegramRuntimeConfig({
      envSource: {
        TG_API_ID: "123456",
        TG_API_HASH: "env-hash",
        TG_SESSION_STRING: "saved-session",
        TG_TEST_USE_WSS: "false",
        TG_TEST_SERVERS: "true",
        TG_CONFIG_URL: "https://example.test/config",
      },
      storage: createMemoryStorage(),
      embeddedSource: null,
    });

    expect(config).toEqual({
      apiId: 123456,
      apiHash: "env-hash",
      sessionString: "saved-session",
      useWSS: false,
      forceWSS: false,
      testServers: true,
      configUrl: "https://example.test/config",
      source: "env",
    });
  });

  it("loads Telegram config when Number ES6 helpers are unavailable", () => {
    const originalIsFinite = Number.isFinite;
    const originalParseInt = Number.parseInt;

    try {
      Number.isFinite = undefined;
      Number.parseInt = undefined;

      expect(loadTelegramRuntimeConfig({
        envSource: {
          TG_API_ID: "123456",
          TG_API_HASH: "env-hash",
        },
        storage: createMemoryStorage(),
        embeddedSource: null,
      })).toMatchObject({
        apiId: 123456,
        apiHash: "env-hash",
        source: "env",
      });
    } finally {
      Number.isFinite = originalIsFinite;
      Number.parseInt = originalParseInt;
    }
  });

  it("falls back to stored emulator runtime config when env is unavailable", () => {
    const config = loadTelegramRuntimeConfig({
      envSource: null,
      storage: createMemoryStorage({
        [RUNTIME_CONFIG_STORAGE_KEY]: JSON.stringify({
          apiId: 777001,
          apiHash: "storage-hash",
          useWSS: true,
          testServers: false,
          configUrl: "http://127.0.0.1:4173",
        }),
      }),
      embeddedSource: {
        apiId: 777002,
        apiHash: "embedded-hash",
      },
    });

    expect(config).toEqual({
      apiId: 777001,
      apiHash: "storage-hash",
      sessionString: "",
      useWSS: true,
      forceWSS: true,
      testServers: false,
      configUrl: "http://127.0.0.1:4173",
      source: "storage",
    });
  });

  it("falls back to embedded build config when env and storage are unavailable", () => {
    const config = loadTelegramRuntimeConfig({
      envSource: null,
      storage: createMemoryStorage(),
      embeddedSource: {
        apiId: 777003,
        apiHash: "embedded-hash",
        forceWSS: false,
        testServers: false,
        configUrl: "https://nick1udwig.github.io/tg-pebble/config/",
      },
    });

    expect(config).toEqual({
      apiId: 777003,
      apiHash: "embedded-hash",
      sessionString: "",
      useWSS: false,
      forceWSS: false,
      testServers: false,
      configUrl: "https://nick1udwig.github.io/tg-pebble/config/",
      source: "embedded",
    });
  });

  it("prefers env config over stored and embedded runtime config", () => {
    const config = loadTelegramRuntimeConfig({
      envSource: {
        TG_API_ID: "42",
        TG_API_HASH: "env-hash",
      },
      storage: createMemoryStorage({
        [RUNTIME_CONFIG_STORAGE_KEY]: JSON.stringify({
          apiId: 777001,
          apiHash: "storage-hash",
        }),
      }),
      embeddedSource: {
        apiId: 777003,
        apiHash: "embedded-hash",
      },
    });

    expect(config).toMatchObject({
      apiId: 42,
      apiHash: "env-hash",
      source: "env",
    });
  });

  it("uses the default config URL when a valid config omits one", () => {
    const config = loadTelegramRuntimeConfig({
      envSource: null,
      storage: createMemoryStorage(),
      embeddedSource: {
        apiId: 777003,
        apiHash: "embedded-hash",
      },
    });

    expect(config).toMatchObject({
      configUrl: DEFAULT_CONFIG_URL,
      source: "embedded",
    });
  });

  it("returns null when env, storage, and embedded config are all invalid", () => {
    expect(loadTelegramRuntimeConfig({
      envSource: { TG_API_ID: "bad", TG_API_HASH: "" },
      storage: createMemoryStorage({
        [RUNTIME_CONFIG_STORAGE_KEY]: "{not json",
      }),
      embeddedSource: {
        apiId: "bad",
        apiHash: "",
      },
    })).toBe(null);
  });
});
