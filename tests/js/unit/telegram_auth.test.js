import { describe, expect, it, vi } from "vitest";

import {
  authorizeTelegramSession,
  buildTelegramClientParams,
  createTelegramClient,
  formatAccountLabel,
  requestTelegramLoginCode,
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

  it("seeds a selected Telegram web DC into new sessions", () => {
    const client = createTelegramClient({
      apiId: 123456,
      apiHash: "hash",
      telegramWebDcId: 2,
      telegramWebDcHost: "venus.web.telegram.org",
      telegramWebDcPort: 443,
      forceWSS: true,
      testServers: false,
    }, "");

    expect(client.session.dcId).toBe(2);
    expect(client.session.serverAddress).toBe("venus.web.telegram.org");
    expect(client.session.port).toBe(443);
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

  it("requests a login code and returns Telegram's phone code hash", async () => {
    const sendCode = vi.fn(async () => ({
      phoneCodeHash: "hash-123",
      isCodeViaApp: true,
    }));
    const disconnect = vi.fn(async () => {});
    const client = {
      connected: false,
      connect: vi.fn(async () => {}),
      sendCode,
      disconnect,
    };

    await expect(requestTelegramLoginCode(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "+15551234567" },
      () => client,
    )).resolves.toEqual({
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      isCodeViaApp: true,
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(sendCode).toHaveBeenCalledWith({ apiId: 123456, apiHash: "hash" }, "+15551234567", false);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns the active web DC after login-code migration", async () => {
    const client = {
      connected: true,
      session: {
        dcId: 1,
        serverAddress: "pluto.web.telegram.org",
        port: 443,
      },
      sendCode: vi.fn(async () => ({
        phoneCodeHash: "hash-123",
        isCodeViaApp: true,
      })),
      disconnect: vi.fn(async () => {}),
    };

    await expect(requestTelegramLoginCode(
      { apiId: 123456, apiHash: "hash", forceWSS: true, testServers: false },
      { phoneNumber: "+15551234567" },
      () => client,
    )).resolves.toMatchObject({
      phoneCodeHash: "hash-123",
      telegramWebDcId: 1,
      telegramWebDcHost: "pluto.web.telegram.org",
      telegramWebDcPort: 443,
      forceWSS: true,
    });
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

  it("authorizes with a previously requested Telegram phone code hash", async () => {
    const invoke = vi.fn(async () => ({
      user: { id: 7, firstName: "Alice", lastName: "Example" },
    }));
    const disconnect = vi.fn(async () => {});
    const client = {
      connected: false,
      connect: vi.fn(async () => {}),
      session: { save: () => "saved-session" },
      invoke,
      disconnect,
    };

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        phoneCodeHash: "hash-123",
      },
      () => client,
    )).resolves.toEqual({
      sessionString: "saved-session",
      phoneNumber: "+15551234567",
      accountLabel: "Alice Example",
      userId: "7",
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toMatchObject({
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      phoneCode: "12345",
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("uses the 2FA password when Telegram requires one after code sign-in", async () => {
    const invoke = vi.fn(async () => {
      const error = new Error("Password needed.");
      error.errorMessage = "SESSION_PASSWORD_NEEDED";
      throw error;
    });
    const signInWithPassword = vi.fn(async (_credentials, callbacks) => {
      expect(await callbacks.password()).toBe("secret");
      return { id: 7, firstName: "Alice", lastName: "Example" };
    });
    const client = {
      connected: true,
      session: { save: () => "saved-session" },
      invoke,
      signInWithPassword,
      disconnect: vi.fn(async () => {}),
    };

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        phoneCodeHash: "hash-123",
        password: "secret",
      },
      () => client,
    )).resolves.toMatchObject({
      sessionString: "saved-session",
      accountLabel: "Alice Example",
    });

    expect(signInWithPassword).toHaveBeenCalledWith(
      { apiId: 123456, apiHash: "hash" },
      expect.objectContaining({ password: expect.any(Function), onError: expect.any(Function) }),
    );
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
