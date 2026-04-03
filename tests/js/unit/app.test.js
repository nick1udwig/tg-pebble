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
  it("hydrates fixture data on bootstrap", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });
    const payload = app.bootstrap();

    expect(payload.chats.length).toBeGreaterThan(0);
    expect(payload.chats[0]).toMatchObject({
      id: 1001,
      title: "Alice",
    });
  });

  it("persists send mode updates in the cache", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    expect(app.getSettingsState()).toEqual({ sendMode: "preview" });

    app.setSendMode("auto");

    expect(app.getSettingsState()).toEqual({ sendMode: "auto" });
  });

  it("appends a fixture outgoing message on successful send", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });
    const before = app.getChatPage(1001).messages.length;

    expect(app.sendMessage(1001, "Sent from test")).toEqual({ ok: true });

    const after = app.getChatPage(1001).messages;
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toMatchObject({
      senderName: "You",
      text: "Sent from test",
      outgoing: true,
    });
  });

  it("returns a deterministic fixture error for failing send text", () => {
    const app = createPkjsApp({ storage: createMemoryStorage() });

    expect(app.sendMessage(1001, "please fail this send")).toEqual({
      ok: false,
      detail: "Fixture transport rejected the message.",
    });
  });
});
