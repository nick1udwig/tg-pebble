import { describe, expect, it, vi } from "vitest";

import {
  authorizeTelegramSession,
  buildTelegramClientParams,
  formatAccountLabel,
  revokeTelegramSession,
} from "../../../src/pkjs/lib/telegram/auth.js";

describe("telegram auth helpers", () => {
  it("builds stable Telegram client params without relying on host os metadata", () => {
    expect(buildTelegramClientParams({
      apiId: 123456,
      apiHash: "hash",
      useWSS: true,
      testServers: false,
    })).toEqual({
      connectionRetries: 3,
      requestRetries: 3,
      reconnectRetries: 0,
      useWSS: false,
      testServers: false,
      deviceModel: "TG Pebble",
      systemVersion: "Pebble PKJS",
      appVersion: "0.1",
      langCode: "en",
      systemLangCode: "en",
    });
  });

  it("allows WSS only when explicitly forced", () => {
    expect(buildTelegramClientParams({
      apiId: 123456,
      apiHash: "hash",
      forceWSS: true,
      testServers: false,
    }).useWSS).toBe(true);
  });

  it("formats account labels from names and usernames", () => {
    expect(formatAccountLabel({ firstName: "Alice", lastName: "Example" })).toBe("Alice Example");
    expect(formatAccountLabel({ username: "bot_name" })).toBe("@bot_name");
    expect(formatAccountLabel({ id: 42 })).toBe("42");
  });

  it("requires a phone number before creating a Telegram client", async () => {
    const clientFactory = vi.fn(() => {
      throw new Error("Should not create client");
    });

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "", loginCode: "12345" },
      clientFactory,
    )).rejects.toThrow("Phone number is required.");

    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("requires a login code before creating a Telegram client", async () => {
    const clientFactory = vi.fn(() => {
      throw new Error("Should not create client");
    });

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "+15551234567", loginCode: "" },
      clientFactory,
    )).rejects.toThrow("Login code is required.");

    expect(clientFactory).not.toHaveBeenCalled();
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

  it("disconnects the client when authorization fails", async () => {
    const disconnect = vi.fn(async () => {});
    const client = {
      start: vi.fn(async () => {
        throw new Error("Code expired.");
      }),
      disconnect,
    };

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "+15551234567", loginCode: "12345", password: "secret" },
      () => client,
    )).rejects.toThrow("Code expired.");

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

  it("skips logout requests for already-unauthorized sessions", async () => {
    const invoke = vi.fn(async () => ({}));
    const disconnect = vi.fn(async () => {});
    const client = {
      connect: vi.fn(async () => {}),
      isUserAuthorized: vi.fn(async () => false),
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
    expect(invoke).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
