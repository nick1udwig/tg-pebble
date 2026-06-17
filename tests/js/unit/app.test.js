import { describe, expect, it } from "vitest";

import { createPkjsApp } from "../../../src/pkjs/lib/app.js";

function createMemoryStorage() {
  const data = new Map();

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

describe("createPkjsApp", () => {
  it("hydrates fixture data on bootstrap", async () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });
    const payload = await app.bootstrap();

    expect(payload.chats.length).toBeGreaterThan(0);
    expect(payload.chats[0]).toMatchObject({
      id: 1001,
      title: "Alice",
    });
  });

  it("does not seed fixtures when fixture mode is disabled", async () => {
    const app = createPkjsApp({ storage: createMemoryStorage(), fixtureMode: false });
    const payload = await app.bootstrap();

    expect(payload.chats).toEqual([]);
    expect(app.getSession()).toBe(null);
  });

  it("persists send mode updates in the cache", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    expect(app.getSettingsState()).toEqual({ sendMode: "preview", previewChatMessage: false });

    app.setPreviewChatMessage(true);
    app.setSendMode("auto");

    expect(app.getSettingsState()).toEqual({ sendMode: "auto", previewChatMessage: true });
  });

  it("exposes config state from cached settings and session metadata", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    app.setSendMode("auto");
    app.setPreviewChatMessage(true);
    app.setSession({ sessionString: "saved-session", phoneNumber: "+15551234567", accountLabel: "Alice Example" });

    expect(app.getConfigState()).toEqual({
      phoneNumber: "+15551234567",
      sendMode: "auto",
      previewChatMessage: true,
      hasSession: true,
      accountLabel: "Alice Example",
      authError: "",
      codeRequested: false,
      codeDelivery: "",
    });
  });

  it("exposes pending login-code requests without exposing the code hash", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    app.setSession({ sessionString: "", phoneNumber: "+15551234567" });
    app.setAuthCodeRequest({
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      isCodeViaApp: true,
      telegramWebDcId: 1,
      telegramWebDcHost: "pluto.web.telegram.org",
      telegramWebDcPort: 443,
      forceWSS: true,
    });

    expect(app.getPendingAuthCodeHash("+15551234567")).toBe("hash-123");
    expect(app.getPendingAuthRequest("+15551234567")).toMatchObject({
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      telegramWebDcId: 1,
      telegramWebDcHost: "pluto.web.telegram.org",
      telegramWebDcPort: 443,
      forceWSS: true,
    });
    expect(app.getConfigState()).toMatchObject({
      phoneNumber: "+15551234567",
      codeRequested: true,
      codeDelivery: "app",
    });
    expect(app.getConfigState()).not.toHaveProperty("phoneCodeHash");
  });

  it("persists auth errors in config state until a live session is stored", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    app.setAuthError("Code expired.");
    expect(app.getConfigState()).toMatchObject({
      hasSession: false,
      authError: "Code expired.",
    });

    app.setSession({ sessionString: "saved-session", phoneNumber: "+15551234567" });
    expect(app.getConfigState()).toMatchObject({
      hasSession: true,
      authError: "",
    });
  });

  it("appends a fixture outgoing message on successful send", async () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });
    const before = (await app.getChatPage(1001)).messages.length;

    expect(await app.sendMessage(1001, "Sent from test")).toEqual({ ok: true });

    const after = (await app.getChatPage(1001)).messages;
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toMatchObject({
      senderName: "You",
      text: "Sent from test",
      outgoing: true,
    });
  });

  it("returns a deterministic fixture error for failing send text", async () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    expect(await app.sendMessage(1001, "please fail this send")).toEqual({
      ok: false,
      detail: "Fixture transport rejected the message.",
    });
  });

  it("uses the Telegram adapter when a session is available", async () => {
    const app = createPkjsApp({
      storage: createMemoryStorage(),
      initialSession: { sessionString: "live-session" },
      telegramAdapterFactory() {
        return {
          isConfigured() {
            return true;
          },
          async hydrateChatList() {
            return {
              chats: [
                { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
              ],
              chatRefs: {
                7: { peerKey: "user:42", peerType: "user", peerId: "42", accessHash: "123" },
              },
            };
          },
          async hydrateChatPage() {
            return {
              chatId: 7,
              messages: [
                {
                  senderId: "42",
                  senderName: "Live Alice",
                  outgoing: false,
                  text: "Latest",
                  showSender: true,
                },
              ],
            };
          },
          async sendTextMessage() {
            return { ok: true, messageId: 10 };
          },
        };
      },
    });

    const chatList = await app.bootstrap();
    const chatPage = await app.getChatPage(7);
    const sendResult = await app.sendMessage(7, "Reply");

    expect(chatList.chats).toEqual([
      { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
    ]);
    expect(chatPage.messages[0]).toMatchObject({
      senderName: "Live Alice",
      text: "Latest",
    });
    expect(sendResult).toEqual({ ok: true });
    expect((await app.getChatPage(7)).messages.at(-1)).toMatchObject({
      senderName: "You",
      text: "Reply",
      outgoing: true,
    });
  });

  it("replaces a cached fixture session when a live session is provided", async () => {
    const storage = createMemoryStorage();
    const fixtureApp = createPkjsApp({ storage });

    await fixtureApp.bootstrap();
    expect(fixtureApp.getSession()).toMatchObject({
      fixtureSession: true,
    });

    const liveApp = createPkjsApp({
      storage,
      initialSession: { sessionString: "live-session", phoneNumber: "+15551234567" },
      telegramAdapterFactory() {
        return {
          isConfigured() {
            return true;
          },
          async hydrateChatList() {
            return {
              chats: [
                { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
              ],
              chatRefs: {
                7: { peerKey: "user:42", peerType: "user", peerId: "42", accessHash: "123" },
              },
            };
          },
        };
      },
    });

    const chatList = await liveApp.bootstrap();

    expect(liveApp.getSession()).toMatchObject({
      sessionString: "live-session",
      phoneNumber: "+15551234567",
    });
    expect(chatList.chats).toEqual([
      { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
    ]);
  });

  it("clears cached chats and messages without dropping the live session", async () => {
    const app = createPkjsApp({
      storage: createMemoryStorage(),
      initialSession: { sessionString: "live-session", phoneNumber: "+15551234567" },
      telegramAdapterFactory() {
        return {
          isConfigured() {
            return true;
          },
          async hydrateChatList() {
            return {
              chats: [
                { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
              ],
              chatRefs: {
                7: { peerKey: "user:42", peerType: "user", peerId: "42", accessHash: "123" },
              },
            };
          },
          async hydrateChatPage() {
            return {
              chatId: 7,
              messages: [
                {
                  senderId: "42",
                  senderName: "Live Alice",
                  outgoing: false,
                  text: "Latest",
                  showSender: true,
                },
              ],
            };
          },
          async sendTextMessage() {
            return { ok: true, messageId: 10 };
          },
        };
      },
    });

    await app.bootstrap();
    await app.getChatPage(7);
    app.clearCache();

    expect(app.getSession()).toMatchObject({ sessionString: "live-session" });
    expect(app.cache.getChatList()).toEqual([]);
    expect(app.cache.getMessagePages()).toEqual({});
  });
});
