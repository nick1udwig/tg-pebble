import { describe, expect, it } from "vitest";

import { addSenderRunMetadata } from "../../../src/pkjs/lib/message_groups.js";

describe("addSenderRunMetadata", () => {
  it("marks only the first message in a consecutive sender run", () => {
    const messages = [
      { id: 1, senderId: 7, senderName: "Alice" },
      { id: 2, senderId: 7, senderName: "Alice" },
      { id: 3, senderId: 9, senderName: "Bob" },
      { id: 4, senderId: 9, senderName: "Bob" },
      { id: 5, senderId: 7, senderName: "Alice" },
    ];

    expect(addSenderRunMetadata(messages).map((message) => message.showSender)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
  });
});

