import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  canRunTelegramTestEnv,
  createTelegramTestClient,
  disconnectTelegramTestClient,
  getTelegramDialogMessages,
  loadTelegramTestEnv,
  loginTelegramTestUser,
  logoutTelegramTestUser,
  resolveTelegramPeer,
  restoreTelegramTestSession,
  sendTelegramTextMessage,
} from "../../../src/pkjs/lib/telegram/test_env.js";

const config = loadTelegramTestEnv();
const describeIf = canRunTelegramTestEnv(config) ? describe : describe.skip;
const itIf = (condition) => (condition ? it : it.skip);

describeIf("Telegram live mutation integration", () => {
  let sessionClient;

  beforeAll(async () => {
    sessionClient = createTelegramTestClient(config, config.sessionString || "");

    if (config.sessionString) {
      expect(await restoreTelegramTestSession(sessionClient)).toBe(true);
    }
  }, 120_000);

  afterAll(async () => {
    await disconnectTelegramTestClient(sessionClient);
  });

  itIf(config.allowSendCode)("can establish a fresh authorized session via login code", async () => {
    const freshClient = createTelegramTestClient(config, "");

    try {
      const sessionString = await loginTelegramTestUser(freshClient, config);
      expect(sessionString.length).toBeGreaterThan(0);
      expect(await freshClient.isUserAuthorized()).toBe(true);
    } finally {
      await disconnectTelegramTestClient(freshClient);
    }
  }, 120_000);

  itIf(config.allowSend)("sends a text message to the configured mutation target", async () => {
    const targetPeer = await resolveTelegramPeer(sessionClient, config.targetPeer);
    const beforeMessages = await getTelegramDialogMessages(sessionClient, targetPeer, { limit: 5 });
    const marker = config.mutationTextPrefix + " " + new Date().toISOString();
    const sent = await sendTelegramTextMessage(sessionClient, targetPeer, marker);
    const afterMessages = await getTelegramDialogMessages(sessionClient, targetPeer, { limit: 5 });
    const matchingMessage = afterMessages.find((message) => typeof message.message === "string" && message.message === marker);

    expect(sent).toBeTruthy();
    expect(targetPeer).toBeTruthy();
    expect(Array.isArray(beforeMessages)).toBe(true);
    expect(Array.isArray(afterMessages)).toBe(true);
    expect(matchingMessage).toBeTruthy();
  }, 120_000);

  itIf(config.allowLogout)("logs out the live Telegram session when explicitly enabled", async () => {
    const logoutClient = createTelegramTestClient(config, config.sessionString || "");
    const staleClient = createTelegramTestClient(config, config.sessionString || "");

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
