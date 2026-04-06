import { describe, expect, it } from "vitest";

import {
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
});
