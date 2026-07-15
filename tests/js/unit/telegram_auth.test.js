import { describe, expect, it, vi } from "vitest";

import {
  authorizeTelegramSession,
  buildTelegramClientParams,
  completeTelegramPasswordAuth,
  createTelegramClient,
  describeTelegramSessionString,
  encodePasswordChallenge,
  fingerprintText,
  formatAccountLabel,
  isPasswordNeededError,
  requestTelegramLoginCode,
  revokeTelegramSession,
} from "../../../src/pkjs/lib/telegram/auth.js";
import { base64Encode, NativeTelegramSession } from "../../../src/pkjs/lib/tgproto/session.js";

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
    expect(client.getWebSocketUrl()).toBe("wss://venus.web.telegram.org:443/apiws");
  });

  it("uses plain WebSocket transport when WSS is disabled", () => {
    const client = createTelegramClient({
      apiId: 123456,
      apiHash: "hash",
      forceWSS: false,
      testServers: false,
    }, "");

    expect(client.session.port).toBe(80);
    expect(client.getWebSocketUrl()).toBe("ws://venus.web.telegram.org:80/apiws");
  });

  it("formats account labels from names and usernames", () => {
    expect(formatAccountLabel({ firstName: "Alice", lastName: "Example" })).toBe("Alice Example");
    expect(formatAccountLabel({ username: "bot_name" })).toBe("@bot_name");
    expect(formatAccountLabel({ id: 42 })).toBe("42");
  });

  it("describes restored auth sessions without exposing key material", () => {
    const session = new NativeTelegramSession();
    const authKey = new Uint8Array(256);
    for (let index = 0; index < authKey.length; index += 1) {
      authKey[index] = index & 255;
    }
    session.setDC(1, "pluto.web.telegram.org", 443);
    session.setAuthKey(authKey, "123456789");
    session.serverSalt = "42";

    const saved = session.save();

    expect(describeTelegramSessionString(saved)).toMatchObject({
      authSessionLength: saved.length,
      authSessionFp: fingerprintText(saved),
      authSessionRestored: true,
      sessionDcId: 1,
      sessionHost: "pluto.web.telegram.org",
      sessionPort: 443,
      hasAuthKey: true,
      authKeyLength: 256,
      authKeyIdFp: fingerprintText("123456789"),
      serverSaltPresent: true,
    });
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
      authSessionString: "",
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
        save: () => "temp-auth-session",
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
      authSessionString: "temp-auth-session",
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

  it("requires a prior login-code request before authorizing", async () => {
    const disconnect = vi.fn(async () => {});
    const client = {
      session: { save: () => "saved-session" },
      disconnect,
    };

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "+15551234567", loginCode: "12345", password: "secret" },
      () => client,
    )).rejects.toThrow("Request a Telegram login code first.");

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("authorizes with a previously requested Telegram phone code hash", async () => {
    const signIn = vi.fn(async () => ({ id: 7, firstName: "Alice", lastName: "Example" }));
    const disconnect = vi.fn(async () => {});
    const client = {
      connected: false,
      connect: vi.fn(async () => {}),
      session: { save: () => "saved-session" },
      signIn,
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
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn.mock.calls[0][0]).toMatchObject({
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      phoneCode: "12345",
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("passes the pending auth session into the sign-in client factory", async () => {
    const signIn = vi.fn(async () => ({ id: 7, firstName: "Alice" }));
    const client = {
      connected: true,
      session: { save: () => "saved-session" },
      signIn,
      disconnect: vi.fn(async () => {}),
    };
    const clientFactory = vi.fn(() => client);

    await authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        phoneCodeHash: "hash-123",
        authSessionString: "temp-auth-session",
      },
      clientFactory,
    );

    expect(clientFactory).toHaveBeenCalledWith("temp-auth-session");
  });

  it("uses the 2FA password when Telegram requires one after code sign-in", async () => {
    const authStageLogger = vi.fn();
    const signIn = vi.fn(async () => {
      const error = new Error("Password needed.");
      error.errorMessage = "SESSION_PASSWORD_NEEDED";
      throw error;
    });
    const signInWithPassword = vi.fn(async (_credentials, callbacks) => {
      expect(await callbacks.password()).toBe("secret");
      await callbacks.onPasswordInfo();
      await callbacks.onComputeStart();
      await callbacks.onComputeDone();
      await callbacks.onCheckStart();
      await callbacks.onCheckDone();
      return { id: 7, firstName: "Alice", lastName: "Example" };
    });
    const client = {
      connected: true,
      session: { save: () => "saved-session" },
      signIn,
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
        authStageLogger,
      },
      () => client,
    )).resolves.toMatchObject({
      sessionString: "saved-session",
      accountLabel: "Alice Example",
    });

    expect(signInWithPassword).toHaveBeenCalledWith(
      { apiId: 123456, apiHash: "hash" },
      expect.objectContaining({
        password: expect.any(Function),
        onPasswordInfo: expect.any(Function),
        onComputeStart: expect.any(Function),
        onComputeDone: expect.any(Function),
        onCheckStart: expect.any(Function),
        onCheckDone: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(authStageLogger.mock.calls.map((call) => call[0])).toEqual([
      "Telegram auth connect started",
      "Telegram auth connect done",
      "Telegram auth signIn started",
      "Telegram auth signIn requires 2FA",
      "Telegram auth 2FA started",
      "Telegram auth 2FA password info received",
      "Telegram auth 2FA SRP compute started",
      "Telegram auth 2FA SRP compute done",
      "Telegram auth 2FA checkPassword started",
      "Telegram auth 2FA checkPassword done",
      "Telegram auth 2FA done",
    ]);
  });

  it("returns a serializable password challenge when code sign-in requires 2FA", async () => {
    const authStageLogger = vi.fn();
    const signIn = vi.fn(async () => {
      const error = new Error("Password needed.");
      error.errorMessage = "SESSION_PASSWORD_NEEDED";
      throw error;
    });
    const passwordInfo = {
      currentAlgo: {
        salt1: new Uint8Array([1, 2, 3]),
        salt2: new Uint8Array([4, 5, 6]),
        g: 2,
        p: new Uint8Array([7, 8, 9]),
      },
      srpB: new Uint8Array([10, 11, 12]),
      srpId: "42",
      hint: "hint",
    };
    const client = {
      connected: true,
      session: { save: () => "temp-auth-session-after-code" },
      signIn,
      getPasswordInfo: vi.fn(async () => passwordInfo),
      disconnect: vi.fn(async () => {}),
    };

    try {
      await authorizeTelegramSession(
        { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
        {
          phoneNumber: "+15551234567",
          loginCode: "12345",
          phoneCodeHash: "hash-123",
          authStageLogger,
        },
        () => client,
      );
      throw new Error("Expected password-needed error");
    } catch (error) {
      expect(isPasswordNeededError(error)).toBe(true);
      expect(error).toMatchObject({
        passwordRequired: true,
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        authSessionString: "temp-auth-session-after-code",
        passwordHint: "hint",
        passwordChallenge: encodePasswordChallenge(passwordInfo),
      });
    }

    expect(client.getPasswordInfo).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(authStageLogger.mock.calls.map((call) => call[0])).toContain("Telegram auth 2FA password info requested");
  });

  it("completes password-required auth with a config-page SRP proof", async () => {
    const checkPassword = vi.fn(async () => ({ id: 7, firstName: "Alice", lastName: "Example" }));
    const client = {
      connected: false,
      connect: vi.fn(async () => {}),
      session: { save: () => "saved-session" },
      checkPassword,
      disconnect: vi.fn(async () => {}),
    };

    await expect(completeTelegramPasswordAuth(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      {
        phoneNumber: "+15551234567",
        authSessionString: "temp-auth-session",
        passwordProof: {
          srpId: "42",
          A: base64Encode(new Uint8Array([1, 2, 3])),
          M1: base64Encode(new Uint8Array([4, 5, 6])),
        },
      },
      () => client,
    )).resolves.toEqual({
      sessionString: "saved-session",
      phoneNumber: "+15551234567",
      accountLabel: "Alice Example",
      userId: "7",
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(checkPassword).toHaveBeenCalledWith(expect.objectContaining({
      className: "inputCheckPasswordSRP",
      srpId: "42",
      A: new Uint8Array([1, 2, 3]),
      M1: new Uint8Array([4, 5, 6]),
    }));
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects the client when authorization fails", async () => {
    const disconnect = vi.fn(async () => {});
    const client = {
      connected: true,
      signIn: vi.fn(async () => {
        throw new Error("Code expired.");
      }),
      disconnect,
    };

    await expect(authorizeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      { phoneNumber: "+15551234567", loginCode: "12345", phoneCodeHash: "hash-123", password: "secret" },
      () => client,
    )).rejects.toThrow("Code expired.");

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("logs out authorized sessions through the provided client factory", async () => {
    const logOut = vi.fn(async () => ({}));
    const disconnect = vi.fn(async () => {});
    const client = {
      connect: vi.fn(async () => {}),
      isUserAuthorized: vi.fn(async () => true),
      logOut,
      disconnect,
    };

    await revokeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      "saved-session",
      () => client,
    );

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.isUserAuthorized).toHaveBeenCalledTimes(1);
    expect(logOut).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("skips logout requests for already-unauthorized sessions", async () => {
    const logOut = vi.fn(async () => ({}));
    const disconnect = vi.fn(async () => {});
    const client = {
      connect: vi.fn(async () => {}),
      isUserAuthorized: vi.fn(async () => false),
      logOut,
      disconnect,
    };

    await revokeTelegramSession(
      { apiId: 123456, apiHash: "hash", useWSS: true, testServers: false },
      "saved-session",
      () => client,
    );

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.isUserAuthorized).toHaveBeenCalledTimes(1);
    expect(logOut).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
