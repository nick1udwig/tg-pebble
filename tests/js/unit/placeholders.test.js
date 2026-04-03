import { describe, expect, it } from "vitest";

import { toDisplayText } from "../../../src/pkjs/lib/placeholders.js";

describe("toDisplayText", () => {
  it("prefers plain text when present", () => {
    expect(toDisplayText({ text: "Hello" })).toBe("Hello");
  });

  it("falls back to known placeholders", () => {
    expect(toDisplayText({ kind: "photo" })).toBe("Photo");
    expect(toDisplayText({ kind: "voice" })).toBe("Voice message");
  });

  it("uses a generic placeholder for unknown kinds", () => {
    expect(toDisplayText({ kind: "poll" })).toBe("Unsupported message");
  });
});

