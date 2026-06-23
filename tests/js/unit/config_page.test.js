import { describe, expect, it } from "vitest";

import {
  buildConfigPageUrl,
  parseConfigPageResponse,
  readConfigPageState,
} from "../../../src/pkjs/lib/config_page.js";

describe("config page helpers", () => {
  it("builds a config URL with encoded state", () => {
    const url = buildConfigPageUrl("http://127.0.0.1:4173", {
      phoneNumber: "+15551234567",
      sendMode: "preview",
      previewChatMessage: false,
    });

    expect(url.startsWith("http://127.0.0.1:4173?state=")).toBe(true);
    expect(url).toContain("&v=");
    expect(readConfigPageState(url.slice(url.indexOf("?")))).toEqual({
      phoneNumber: "+15551234567",
      sendMode: "preview",
      previewChatMessage: false,
    });
  });

  it("parses config responses and ignores cancelled closes", () => {
    const encoded = encodeURIComponent(JSON.stringify({ action: "config:save", state: { sendMode: "auto" } }));

    expect(parseConfigPageResponse(encoded)).toEqual({
      action: "config:save",
      state: { sendMode: "auto" },
    });
    expect(parseConfigPageResponse({ response: encoded })).toEqual({
      action: "config:save",
      state: { sendMode: "auto" },
    });
    expect(parseConfigPageResponse({ action: "settings:update", state: { sendMode: "preview" } })).toEqual({
      action: "settings:update",
      state: { sendMode: "preview" },
    });
    expect(parseConfigPageResponse("CANCELLED")).toBe(null);
    expect(parseConfigPageResponse("not-json")).toBe(null);
  });
});
