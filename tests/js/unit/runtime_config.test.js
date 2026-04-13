import { describe, expect, it } from "vitest";

import { loadTelegramRuntimeConfig, RUNTIME_CONFIG_STORAGE_KEY } from "../../../src/pkjs/lib/runtime_config.js";

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
    });

    expect(config).toEqual({
      apiId: 123456,
      apiHash: "env-hash",
      sessionString: "saved-session",
      useWSS: false,
      testServers: true,
      configUrl: "https://example.test/config",
      source: "env",
    });
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
    });

    expect(config).toEqual({
      apiId: 777001,
      apiHash: "storage-hash",
      sessionString: "",
      useWSS: true,
      testServers: false,
      configUrl: "http://127.0.0.1:4173",
      source: "storage",
    });
  });

  it("prefers env config over stored runtime config", () => {
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
    });

    expect(config).toMatchObject({
      apiId: 42,
      apiHash: "env-hash",
      source: "env",
    });
  });

  it("returns null when neither env nor storage provides valid config", () => {
    expect(loadTelegramRuntimeConfig({
      envSource: { TG_API_ID: "bad", TG_API_HASH: "" },
      storage: createMemoryStorage({
        [RUNTIME_CONFIG_STORAGE_KEY]: "{not json",
      }),
    })).toBe(null);
  });
});
