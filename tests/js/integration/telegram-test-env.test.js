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
  let sessionString = "";
  let me;

  beforeAll(async () => {
    loginClient = createTelegramTestClient(config);
    sessionString = await loginTelegramTestUser(loginClient, config);
    me = await loginClient.getMe();
  }, 120_000);

  afterAll(async () => {
    await disconnectTelegramTestClient(loginClient);
  });

  it("logs in against the Telegram test environment", async () => {
    expect(sessionString.length).toBeGreaterThan(0);
    expect(await loginClient.isUserAuthorized()).toBe(true);
    expect(me).toBeTruthy();
    expect(me.id).toBeDefined();
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

  it("logs out and invalidates the saved session", async () => {
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
