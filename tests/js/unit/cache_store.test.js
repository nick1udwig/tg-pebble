import { describe, expect, it } from "vitest";

import { createCacheStore } from "../../../src/pkjs/lib/cache_store.js";

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
  it("persists settings with preview as the default send mode", () => {
    const store = createCacheStore(createMemoryStorage());

    expect(store.getSettings()).toEqual({ sendMode: "preview" });

    store.setSettings({ sendMode: "auto" });

    expect(store.getSettings()).toEqual({ sendMode: "auto" });
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
});

