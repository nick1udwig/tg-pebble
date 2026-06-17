import { describe, expect, it } from "vitest";

import { createCacheStore } from "../../../src/pkjs/lib/cache_store.js";
import { ProtocolByteLimit, utf8ByteLength } from "../../../src/pkjs/lib/protocol.js";

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

describe("createCacheStore", () => {
  it("persists settings with preview-off chat rows by default", () => {
    const store = createCacheStore(createMemoryStorage());

    expect(store.getSettings()).toEqual({ sendMode: "preview", previewChatMessage: false });

    store.setSettings({ sendMode: "auto" });
    store.setSettings({ previewChatMessage: true });

    expect(store.getSettings()).toEqual({ sendMode: "auto", previewChatMessage: true });
  });

  it("normalizes pending auth code state", () => {
    const store = createCacheStore(createMemoryStorage());

    store.setAuthState({
      errorMessage: "Code expired.",
      phoneNumber: " +15551234567 ",
      phoneCodeHash: "hash-123",
      codeDelivery: "app",
      codeRequestedAt: 1234,
      telegramWebDcId: "1",
      telegramWebDcHost: " pluto.web.telegram.org ",
      telegramWebDcPort: "443",
      forceWSS: true,
      authSessionString: "temp-auth-session",
    });

    expect(store.getAuthState()).toEqual({
      errorMessage: "Code expired.",
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      codeDelivery: "app",
      codeRequestedAt: 1234,
      telegramWebDcId: 1,
      telegramWebDcHost: "pluto.web.telegram.org",
      telegramWebDcPort: 443,
      forceWSS: true,
      authSessionString: "temp-auth-session",
    });
  });

  it("clears chats and message pages without deleting the session", () => {
    const store = createCacheStore(createMemoryStorage());

    store.setSession({ authKey: "abc123" });
    store.setChatList([{ id: 1 }]);
    store.setMessagePages({ 1: [{ id: 5 }] });

    store.clearChatsAndMessages();

    expect(store.getSession()).toEqual({ authKey: "abc123" });
    expect(store.getChatList()).toEqual([]);
    expect(store.getMessagePages()).toEqual({});
  });

  it("stores chat titles and previews within watch-safe UTF-8 byte budgets", () => {
    const store = createCacheStore(createMemoryStorage());
    const emoji = "❗️";

    store.setChatList([
      {
        id: 1,
        title: `Support ${emoji}`.repeat(8),
        preview: `Login code: 31792. ${emoji} `.repeat(8),
        unreadCount: 0,
      },
    ]);

    const [chat] = store.getChatList();

    expect(utf8ByteLength(chat.title)).toBeLessThanOrEqual(ProtocolByteLimit.chatTitle);
    expect(utf8ByteLength(chat.preview)).toBeLessThanOrEqual(ProtocolByteLimit.chatPreview);
    expect(chat.title.endsWith(emoji)).toBe(false);
    expect(chat.preview.endsWith(emoji)).toBe(false);
  });


  it("fits cached chat lists within the emulator-safe storage budget", () => {
    const store = createCacheStore(createMemoryStorage());

    store.setChatList([
      { id: 1001, title: "Alice", preview: "See you soon", unreadCount: 2 },
      { id: 2001, title: "Weekend Group", preview: "Warm relaunch message", unreadCount: 0 },
      { id: 3001, title: "Reminder Bot", preview: "Hydration reminder", unreadCount: 1 },
      { id: 4001, title: "Family", preview: "Mom: train arrives at 6", unreadCount: 0 },
      { id: 5001, title: "Build Notes", preview: "Fix the sync icon on aplite", unreadCount: 4 },
    ]);

    const chats = store.getChatList();
    const serialized = JSON.stringify(chats);

    expect(utf8ByteLength(serialized)).toBeLessThanOrEqual(407);
    expect(chats).toHaveLength(5);
    expect(chats[1].preview).toBe("Warm relaunch message");
    expect(chats[4].preview).toBe("Fix the sync icon on apli");
  });


  it("stores only the most recent watch-safe messages per chat page", () => {
    const store = createCacheStore(createMemoryStorage());
    const emoji = "❗️";

    store.setMessagePages({
      2001: [
        { senderId: 1, senderName: "Alice", outgoing: false, text: "first", showSender: true },
        { senderId: 2, senderName: "Bob", outgoing: false, text: "second", showSender: true },
        { senderId: 3, senderName: "Carol", outgoing: false, text: "third", showSender: true },
        { senderId: 4, senderName: "Dave", outgoing: false, text: "fourth", showSender: true },
        {
          senderId: 5,
          senderName: `Support ${emoji}`.repeat(6),
          outgoing: true,
          text: `Warm relaunch message ${emoji} `.repeat(8),
          showSender: false,
        },
      ],
    });

    const pages = store.getMessagePages();

    expect(pages[2001]).toHaveLength(4);
    expect(pages[2001][0].text).toBe("second");
    expect(pages[2001][3].text.startsWith("Warm relaunch message")).toBe(true);
    expect(utf8ByteLength(pages[2001][3].senderName)).toBeLessThanOrEqual(ProtocolByteLimit.messageSender);
    expect(utf8ByteLength(pages[2001][3].text)).toBeLessThanOrEqual(ProtocolByteLimit.messageText);
    expect(pages[2001][3].text.endsWith(emoji)).toBe(false);
  });
});
