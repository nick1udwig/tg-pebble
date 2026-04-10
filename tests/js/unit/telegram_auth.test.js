import { describe, expect, it, vi } from "vitest";

import {
  authorizeTelegramSession,
  formatAccountLabel,
  revokeTelegramSession,
} from "../../../src/pkjs/lib/telegram/auth.js";

describe("telegram auth helpers", () => {
  it("formats account labels from names and usernames", () => {
    expect(formatAccountLabel({ firstName: "Alice", lastName: "Example" })).toBe("Alice Example");
    expect(formatAccountLabel({ username: "bot_name" })).toBe("@bot_name");
    expect(formatAccountLabel({ id: 42 })).toBe("42");
  });

  it("authorizes a session through the provided client factory", async () => {
    const start = vi.fn(async (callbacks) => {
      expect(await callbacks.phoneNumber()).toBe("+15551234567");
      expect(await callbacks.phoneCode()).toBe("12345");
      expect(await callbacks.password()).toBe("secret");
    });
    const disconnect = vi.fn(async () => {});
    const client = {
      session: { save: () => "saved-session" },
      start,
      disconnect,
      getMe: vi.fn(async () => ({ id: 7, firstName: "Alice", lastName: "Example" })),
    };

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "+15551234567", loginCode: "12345", password: "secret" },
      () => client,
    )).resolves.toEqual({
      sessionString: "saved-session",
      phoneNumber: "+15551234567",
      accountLabel: "Alice Example",
      userId: "7",
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("logs out authorized sessions through the provided client factory", async () => {
    const invoke = vi.fn(async () => ({}));
    const disconnect = vi.fn(async () => {});
    const client = {
      connect: vi.fn(async () => {}),
      isUserAuthorized: vi.fn(async () => true),
      invoke,
      disconnect,
    };

    await revokeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      "saved-session",
      () => client,
    );

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.isUserAuthorized).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
