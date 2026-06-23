import { describe, expect, it } from "vitest";

import {
  canRunTelegramTestEnv,
  loadTelegramTestEnv,
} from "../../../src/pkjs/lib/telegram/test_env.js";

describe("telegram test env config", () => {
  it("requires a saved session string for production-safe runs by default", () => {
    const config = loadTelegramTestEnv({
      TG_TEST_ENABLE: "1",
      TG_API_ID: "123456",
      TG_API_HASH: "abc123",
      TG_TEST_SERVERS: "0",
    });

    expect(config.errors).toContain(
      "Production Telegram tests require TG_SESSION_STRING unless TG_TEST_ALLOW_SEND_CODE=1 is explicitly set."
    );
    expect(canRunTelegramTestEnv(config)).toBe(false);
  });

  it("allows production-safe runs when a saved session string is provided", () => {
    const config = loadTelegramTestEnv({
      TG_TEST_ENABLE: "1",
      TG_API_ID: "123456",
      TG_API_HASH: "abc123",
      TG_TEST_SERVERS: "0",
      TG_SESSION_STRING: "saved-session",
    });

    expect(config.errors).toEqual([]);
    expect(config.missing).toEqual([]);
    expect(config.allowSendCode).toBe(false);
    expect(canRunTelegramTestEnv(config)).toBe(true);
  });

  it("only requires phone auth inputs when code login is explicitly enabled", () => {
    const config = loadTelegramTestEnv({
      TG_TEST_ENABLE: "1",
      TG_API_ID: "123456",
      TG_API_HASH: "abc123",
      TG_TEST_SERVERS: "0",
      TG_TEST_ALLOW_SEND_CODE: "1",
    });

    expect(config.missing).toContain("TG_TEST_PHONE");
    expect(config.missing).toContain("TG_TEST_CODE");
    expect(canRunTelegramTestEnv(config)).toBe(false);
  });

  it("deduplicates missing keys when ES6 collection helpers are unavailable", () => {
    const originalSet = globalThis.Set;
    const originalArrayFrom = Array.from;
    let config;

    try {
      globalThis.Set = undefined;
      Array.from = undefined;
      config = loadTelegramTestEnv({
        TG_API_ID: "",
        TG_API_HASH: "",
      });
    } finally {
      globalThis.Set = originalSet;
      Array.from = originalArrayFrom;
    }

    expect(config.missing.filter((key) => key === "TG_API_ID")).toHaveLength(1);
    expect(config.missing).toContain("TG_API_HASH");
  });

  it("rejects production send tests without a real target dialog", () => {
    const config = loadTelegramTestEnv({
      TG_TEST_ENABLE: "1",
      TG_API_ID: "123456",
      TG_API_HASH: "abc123",
      TG_TEST_SERVERS: "0",
      TG_SESSION_STRING: "saved-session",
      TG_TEST_ALLOW_SEND: "1",
    });

    expect(config.errors).toContain(
      "Production send tests require TG_TEST_TARGET_PEER to reference a real dialog; Saved Messages (`me`) is not supported by this Telegram send path."
    );
    expect(canRunTelegramTestEnv(config)).toBe(false);
  });
});
