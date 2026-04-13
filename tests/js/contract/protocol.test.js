import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildChatListPagePayload,
  buildChatPagePayload,
  encodeMessage,
  MessageType,
  serializeChatItem,
  serializeMessageItem,
  serializeSettingsState,
  serializeSendResult,
} from "../../../src/pkjs/lib/protocol.js";
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
    const encoded = encodeMessage(MessageType.chatItem, "1001|Alice|See you soon|2", 42, "synced");

    expect(encoded).toEqual({
      0: "chat_item",
      1: "1001|Alice|See you soon|2",
      2: 42,
      3: "synced",
    });
  });

  it("serializes chat rows, message rows, and send results", () => {
    expect(
      serializeChatItem({ id: 1001, title: "Alice", preview: "See you soon", unreadCount: 2 }),
    ).toBe("1001|Alice|See you soon|2");

    expect(
      serializeMessageItem({ senderName: "Alice", showSender: true, outgoing: false, text: "Morning" }),
    ).toBe("Alice|1|0|Morning");

    expect(serializeSendResult({ ok: true })).toBe("ok");
    expect(serializeSendResult({ ok: false, detail: "Fixture transport rejected the message." })).toBe(
      "error|Fixture transport rejected the message.",
    );
    expect(serializeSettingsState({ sendMode: "preview", previewChatMessage: false })).toBe("preview|0|0|0");
    expect(serializeSettingsState({ sendMode: "auto", previewChatMessage: true, hasSession: true, hasAuthError: true })).toBe("auto|1|1|1");
  });
});
