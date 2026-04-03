import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildChatListPagePayload, buildChatPagePayload, encodeMessage, MessageType } from "../../../src/pkjs/lib/protocol.js";
import { addSenderRunMetadata } from "../../../src/pkjs/lib/message_groups.js";

function readFixture(name) {
  const fixturePath = resolve("tests/js/fixtures", name);
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

describe("watch/pkjs protocol fixtures", () => {
  it("matches the chat list payload fixture", () => {
    const fixture = readFixture("chat-list-page.json");

    const payload = buildChatListPagePayload({
      chats: fixture.chats,
      syncState: fixture.syncState,
    });

    expect(payload).toEqual(fixture);
  });

  it("matches the chat page payload fixture", () => {
    const fixture = readFixture("chat-page.json");
    const payload = buildChatPagePayload({
      chatId: fixture.chatId,
      hasOlder: fixture.hasOlder,
      syncState: fixture.syncState,
      messages: addSenderRunMetadata(
        fixture.messages.map((message) => ({
          ...message,
          showSender: undefined,
        })),
      ).map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName: message.senderName,
        text: message.text,
        showSender: message.showSender,
      })),
    });

    expect(payload).toEqual(fixture);
  });

  it("encodes payloads into the compact AppMessage envelope", () => {
    const encoded = encodeMessage(MessageType.chatListPage, { syncState: "synced", chats: [] }, 42);

    expect(encoded).toEqual({
      0: "chat_list_page",
      1: "{\"syncState\":\"synced\",\"chats\":[]}",
      2: 42,
      3: "synced",
    });
  });
});

