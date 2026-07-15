import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildChatListPagePayload,
  buildChatPagePayload,
  encodeMessage,
  MessageType,
  ProtocolByteLimit,
  serializeChatItem,
  serializeChatPageError,
  serializeMessageItem,
  serializeSettingsState,
  serializeSendResult,
  utf8ByteLength,
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
      serializeMessageItem({ senderName: "Alice", showSender: true, outgoing: false, text: "Morning" }, 3),
    ).toBe("3|Alice|1|0|Morning");

    expect(serializeChatPageError({ detail: "PEER_ID_INVALID" })).toBe("PEER_ID_INVALID");
    expect(serializeSendResult({ ok: true })).toBe("ok");
    expect(serializeSendResult({ ok: false, detail: "Fixture transport rejected the message." })).toBe(
      "error|Fixture transport rejected the message.",
    );
    expect(serializeSettingsState({ sendMode: "preview", previewChatMessage: false })).toBe("preview|0|0|0|phone");
    expect(serializeSettingsState({
      sendMode: "auto",
      previewChatMessage: true,
      hasSession: true,
      hasAuthError: true,
      authStep: "error",
    })).toBe("auto|1|1|1|error");
  });

  it("normalizes separators and newlines before serializing", () => {
    expect(
      serializeChatItem({
        id: 1001,
        title: "Alice|Ops",
        preview: "Line one\nLine two",
        unreadCount: 2,
      }),
    ).toBe("1001|Alice/Ops|Line one Line two|2");
  });

  it("truncates serialized rows to watch-safe UTF-8 byte budgets", () => {
    const emoji = "❗️";
    const longTitle = `Support ${emoji}`.repeat(10);
    const longPreview = `Login code: 31792. ${emoji} `.repeat(12);
    const longSender = `Telegram ${emoji}`.repeat(6);
    const longText = `Login code: 31792. Do not share this code. ${emoji} `.repeat(10);
    const longError = `Fixture transport rejected the message ${emoji} `.repeat(8);

    const chatPayload = serializeChatItem({
      id: 1001,
      title: longTitle,
      preview: longPreview,
      unreadCount: 2,
    });
    const messagePayload = serializeMessageItem({
      senderName: longSender,
      showSender: true,
      outgoing: false,
      text: longText,
    }, 7);
    const sendResultPayload = serializeSendResult({ ok: false, detail: longError });
    const chatPageErrorPayload = serializeChatPageError({ detail: longError });

    const [chatId, title, preview, unreadCount] = chatPayload.split("|");
    const [messageIndex, sender, showSender, outgoing, text] = messagePayload.split("|");
    const [, errorDetail] = sendResultPayload.split("|");

    expect(chatId).toBe("1001");
    expect(unreadCount).toBe("2");
    expect(messageIndex).toBe("7");
    expect(showSender).toBe("1");
    expect(outgoing).toBe("0");

    expect(utf8ByteLength(title)).toBeLessThanOrEqual(ProtocolByteLimit.chatTitle);
    expect(utf8ByteLength(preview)).toBeLessThanOrEqual(ProtocolByteLimit.chatPreview);
    expect(utf8ByteLength(sender)).toBeLessThanOrEqual(ProtocolByteLimit.messageSender);
    expect(utf8ByteLength(text)).toBeLessThanOrEqual(ProtocolByteLimit.messageText);
    expect(utf8ByteLength(chatPageErrorPayload)).toBeLessThanOrEqual(ProtocolByteLimit.chatPageErrorDetail);
    expect(utf8ByteLength(errorDetail)).toBeLessThanOrEqual(ProtocolByteLimit.sendResultDetail);

    expect(title.endsWith(emoji)).toBe(false);
    expect(preview.endsWith(emoji)).toBe(false);
    expect(sender.endsWith(emoji)).toBe(false);
    expect(text.endsWith(emoji)).toBe(false);
    expect(chatPageErrorPayload.endsWith(emoji)).toBe(false);
    expect(errorDetail.endsWith(emoji)).toBe(false);
  });
});
