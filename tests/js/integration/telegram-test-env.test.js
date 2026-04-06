import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  canRunTelegramTestEnv,
  createTelegramTestClient,
  disconnectTelegramTestClient,
  loadTelegramTestEnv,
  loginTelegramTestUser,
  logoutTelegramTestUser,
  restoreTelegramTestSession,
} from "../../../src/pkjs/lib/telegram/test_env.js";

const config = loadTelegramTestEnv();
const describeIf = canRunTelegramTestEnv(config) ? describe : describe.skip;
const itIf = (condition) => (condition ? it : it.skip);

if (config.enabled && (config.missing.length > 0 || config.errors.length > 0)) {
  describe("Telegram Test DC auth integration config", () => {
    it("has valid Telegram Test DC environment variables", () => {
      expect({
        missing: config.missing,
        errors: config.errors,
      }).toEqual({
        missing: [],
        errors: [],
      });
    });
  });
}

describeIf("Telegram Test DC auth integration", () => {
  let loginClient;
  let sessionString = config.sessionString || "";
  let me;
  let bootMode = "";

  beforeAll(async () => {
    loginClient = createTelegramTestClient(config, sessionString);

    if (sessionString) {
      const restored = await restoreTelegramTestSession(loginClient);
      if (!restored) {
        throw new Error("TG_SESSION_STRING is not authorized.");
      }
      bootMode = "session";
    } else if (config.allowSendCode) {
      sessionString = await loginTelegramTestUser(loginClient, config);
      bootMode = "login";
    } else {
      throw new Error("No Telegram auth path configured.");
    }

    me = await loginClient.getMe();
  }, 120_000);

  afterAll(async () => {
    await disconnectTelegramTestClient(loginClient);
  });

  it("connects with an authorized Telegram session", async () => {
    expect(sessionString.length).toBeGreaterThan(0);
    expect(await loginClient.isUserAuthorized()).toBe(true);
    expect(me).toBeTruthy();
    expect(me.id).toBeDefined();
    expect(bootMode === "session" || bootMode === "login").toBe(true);
  }, 120_000);

  itIf(config.allowSendCode && !config.sessionString)("can establish a session via code login", async () => {
    expect(bootMode).toBe("login");
  }, 120_000);

  it("restores a saved session string", async () => {
    const restoredClient = createTelegramTestClient(config, sessionString);

    try {
      expect(await restoreTelegramTestSession(restoredClient)).toBe(true);

      const restoredMe = await restoredClient.getMe();
      expect(String(restoredMe.id)).toBe(String(me.id));
    } finally {
      await disconnectTelegramTestClient(restoredClient);
    }
  }, 120_000);

  itIf(config.allowLogout)("logs out and invalidates the saved session", async () => {
    const logoutClient = createTelegramTestClient(config, sessionString);
    const staleClient = createTelegramTestClient(config, sessionString);

    try {
      expect(await restoreTelegramTestSession(logoutClient)).toBe(true);
      await logoutTelegramTestUser(logoutClient);
      await disconnectTelegramTestClient(logoutClient);

      expect(await restoreTelegramTestSession(staleClient)).toBe(false);
    } finally {
      await disconnectTelegramTestClient(logoutClient);
      await disconnectTelegramTestClient(staleClient);
    }
  }, 120_000);
});
