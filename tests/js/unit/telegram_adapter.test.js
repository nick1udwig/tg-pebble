import { describe, expect, it, vi } from "vitest";

import {
  createTelegramAdapter,
  mapDialogs,
  mapMessages,
} from "../../../src/pkjs/lib/telegram/adapter.js";

describe("telegram adapter mapping", () => {
  it("maps dialogs onto stable local watch ids", () => {
    const result = mapDialogs(
      [
        {
          name: "Alice",
          unreadCount: 2,
          message: { message: "Latest hello" },
          inputEntity: { className: "InputPeerUser", userId: "42", accessHash: "abc" },
        },
      ],
      {
        9: { peerKey: "user:42", peerType: "user", peerId: "42", accessHash: "abc" },
      },
      { limit: 20 }
    );

    expect(result.chats).toEqual([
      { id: 9, remoteId: "user:42", title: "Alice", preview: "Latest hello", unreadCount: 2 },
    ]);
    expect(result.chatRefs["9"]).toMatchObject({
      peerKey: "user:42",
      peerType: "user",
      peerId: "42",
    });
  });

  it("maps non-text Telegram messages to placeholders", () => {
    const messages = mapMessages([
      {
        id: 1,
        out: false,
        senderId: "42",
        sender: { firstName: "Alice" },
        photo: {},
      },
      {
        id: 2,
        out: false,
        senderId: "42",
        sender: { firstName: "Alice" },
        message: "Follow-up",
      },
    ]);

    expect(messages[0]).toMatchObject({
      senderName: "Alice",
      text: "Photo",
      showSender: true,
    });
    expect(messages[1]).toMatchObject({
      senderName: "Alice",
      text: "Follow-up",
      showSender: false,
    });
  });

  it("maps Telegram sticker documents to the sticker placeholder", () => {
    const messages = mapMessages([
      {
        id: 1,
        out: false,
        senderId: "42",
        sender: { firstName: "Alice" },
        document: {
          attributes: [
            { className: "documentAttributeSticker" },
          ],
        },
      },
    ]);

    expect(messages[0]).toMatchObject({
      senderName: "Alice",
      text: "Sticker",
      showSender: true,
    });
  });

  it("maps Telegram voice-note documents to the voice placeholder", () => {
    const messages = mapMessages([
      {
        id: 1,
        out: false,
        senderId: "42",
        sender: { firstName: "Alice" },
        document: {
          attributes: [
            { className: "documentAttributeAudio", voice: true },
          ],
        },
      },
    ]);

    expect(messages[0]).toMatchObject({
      senderName: "Alice",
      text: "Voice message",
      showSender: true,
    });
  });

  it("groups outgoing messages as self even when Telegram reports the peer sender id", () => {
    const messages = mapMessages([
      {
        id: 1,
        out: false,
        senderId: "42",
        sender: { firstName: "Alice" },
        message: "Incoming",
      },
      {
        id: 2,
        out: true,
        senderId: "42",
        sender: { firstName: "Alice" },
        message: "Reply",
      },
    ]);

    expect(messages).toEqual([
      expect.objectContaining({
        senderId: "42",
        senderName: "Alice",
        showSender: true,
      }),
      expect.objectContaining({
        senderId: "self",
        senderName: "You",
        showSender: true,
      }),
    ]);
  });

  it("reuses one connected client and marks opened chats read", async () => {
    const client = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      getDialogs: vi.fn(async () => []),
      getMessages: vi.fn(async () => [
        { id: 12, out: false, senderId: "42", sender: { firstName: "Alice" }, message: "Latest" },
      ]),
      markRead: vi.fn(async () => ({})),
    };
    const clientFactory = vi.fn(() => client);
    const adapter = createTelegramAdapter({
      enabled: true,
      sessionString: "saved-session",
      clientFactory,
    });

    await expect(adapter.hydrateChatList({ limit: 5, cachedRefs: {} })).resolves.toEqual({
      chats: [],
      chatRefs: {},
    });
    await expect(adapter.hydrateChatPage({
      chatId: 9,
      remoteRef: { peerType: "user", peerId: "42", accessHash: "99" },
      limit: 5,
    })).resolves.toMatchObject({
      chatId: 9,
      messages: [expect.objectContaining({ text: "Latest" })],
    });

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.getDialogs).toHaveBeenCalledTimes(1);
    expect(client.getMessages).toHaveBeenCalledTimes(1);
    expect(client.markRead).toHaveBeenCalledWith({
      className: "InputPeerUser",
      userId: "42",
      accessHash: "99",
    }, 12);
    expect(client.disconnect).not.toHaveBeenCalled();

    await adapter.disconnect();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("serializes operations on the shared Telegram connection", async () => {
    let resolveDialogs;
    const client = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      getDialogs: vi.fn(() => new Promise((resolve) => {
        resolveDialogs = resolve;
      })),
      sendMessage: vi.fn(async () => ({ id: 5 })),
    };
    const adapter = createTelegramAdapter({
      enabled: true,
      sessionString: "saved-session",
      clientFactory: () => client,
    });

    const dialogsPromise = adapter.hydrateChatList({ limit: 5, cachedRefs: {} });
    const sendPromise = adapter.sendTextMessage({
      remoteRef: { peerType: "user", peerId: "42", accessHash: "99" },
      text: "Hello",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.getDialogs).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).not.toHaveBeenCalled();

    resolveDialogs([]);
    await dialogsPromise;
    await sendPromise;

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    await adapter.disconnect();
  });
});
