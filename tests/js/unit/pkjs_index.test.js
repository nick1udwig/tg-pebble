import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const authModulePath = require.resolve("../../../src/pkjs/lib/telegram/auth.js");
const adapterModulePath = require.resolve("../../../src/pkjs/lib/telegram/adapter.js");
const indexModulePath = require.resolve("../../../src/pkjs/index.js");

function createMemoryStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function encodeConfigResponse(action, state) {
  return encodeURIComponent(JSON.stringify({ action, state }));
}

function getSentPayloads(sentMessages, type) {
  return sentMessages.filter((message) => message[0] === type).map((message) => ({
    payload: message[1],
    requestId: message[2],
    syncState: message[3],
  }));
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadPkjsHarness(options = {}) {
  const env = options.env || {};
  const embeddedConfig = Object.prototype.hasOwnProperty.call(options, "embeddedConfig")
    ? options.embeddedConfig
    : null;
  const authorizeResult = options.authorizeResult || {
    sessionString: "saved-session",
    phoneNumber: "+15551234567",
    accountLabel: "Alice Example",
    userId: "7",
  };
  const authorizeError = options.authorizeError || null;
  const passwordAuthResult = options.passwordAuthResult || authorizeResult;
  const passwordAuthError = options.passwordAuthError || null;
  const requestCodeResult = options.requestCodeResult || {
    phoneNumber: "+15551234567",
    phoneCodeHash: "hash-123",
    isCodeViaApp: true,
    telegramWebDcId: 1,
    telegramWebDcHost: "pluto.web.telegram.org",
    telegramWebDcPort: 443,
    forceWSS: true,
    authSessionString: "temp-auth-session",
  };
  const requestCodeError = options.requestCodeError || null;
  const hydrateChatList = options.hydrateChatList || (async () => ({
    chats: [
      { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
    ],
    chatRefs: {
      7: { peerKey: "user:42", peerType: "user", peerId: "42", accessHash: "123" },
    },
  }));
  const sentMessages = [];
  const listeners = new Map();
  const storage = createMemoryStorage();
  const previousPebble = globalThis.Pebble;
  const previousLocalStorage = globalThis.localStorage;
  const previousEmbeddedConfig = globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__;
  const envBackup = {};
  const envKeys = [
    "TG_API_ID",
    "TG_API_HASH",
    "TG_TEST_USE_WSS",
    "TG_TEST_SERVERS",
    "TG_CONFIG_URL",
    "TG_SESSION_STRING",
  ];

  const authModule = require(authModulePath);
  const adapterModule = require(adapterModulePath);
  const originalAuthorizeTelegramSession = authModule.authorizeTelegramSession;
  const originalCompleteTelegramPasswordAuth = authModule.completeTelegramPasswordAuth;
  const originalRequestTelegramLoginCode = authModule.requestTelegramLoginCode;
  const originalCreateTelegramAdapter = adapterModule.createTelegramAdapter;
  const authorizeTelegramSession = vi.fn(async () => {
    if (authorizeError) {
      throw authorizeError;
    }

    return authorizeResult;
  });
  const completeTelegramPasswordAuth = vi.fn(async () => {
    if (passwordAuthError) {
      throw passwordAuthError;
    }

    return passwordAuthResult;
  });
  const requestTelegramLoginCode = vi.fn(async () => {
    if (requestCodeError) {
      throw requestCodeError;
    }

    return requestCodeResult;
  });
  if (options.initialStorage) {
    for (const [key, value] of Object.entries(options.initialStorage)) {
      storage.setItem(key, value);
    }
  }

  const createTelegramAdapter = vi.fn(() => ({
    isConfigured() {
      return true;
    },
    async hydrateChatList() {
      return hydrateChatList();
    },
    async hydrateChatPage() {
      return {
        chatId: 7,
        messages: [
          {
            senderId: "42",
            senderName: "Live Alice",
            outgoing: false,
            text: "Latest",
            showSender: true,
          },
        ],
      };
    },
    async sendTextMessage() {
      return { ok: true, messageId: 99 };
    },
  }));

  delete require.cache[indexModulePath];

  for (const key of envKeys) {
    envBackup[key] = process.env[key];
    delete process.env[key];
  }

  for (const key of envKeys) {
    const hasOverride = Object.prototype.hasOwnProperty.call(env, key);
    const value = hasOverride
      ? env[key]
      : {
          TG_API_ID: "123456",
          TG_API_HASH: "env-hash",
          TG_TEST_USE_WSS: "false",
          TG_TEST_SERVERS: "false",
          TG_CONFIG_URL: "http://127.0.0.1:4173",
        }[key];

    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  if (embeddedConfig == null) {
    delete globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__;
  } else {
    globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__ = embeddedConfig;
  }

  globalThis.localStorage = storage;
  globalThis.Pebble = {
    addEventListener(event, listener) {
      listeners.set(event, listener);
    },
    sendAppMessage(message, onSuccess) {
      sentMessages.push({ ...message });
      if (typeof onSuccess === "function") {
        onSuccess({});
      }
    },
    openURL: vi.fn(),
  };

  authModule.authorizeTelegramSession = authorizeTelegramSession;
  authModule.completeTelegramPasswordAuth = completeTelegramPasswordAuth;
  authModule.requestTelegramLoginCode = requestTelegramLoginCode;
  adapterModule.createTelegramAdapter = createTelegramAdapter;

  const module = require(indexModulePath);

  return {
    module,
    listeners,
    sentMessages,
    storage,
    authorizeTelegramSession,
    completeTelegramPasswordAuth,
    requestTelegramLoginCode,
    createTelegramAdapter,
    hydrateChatList,
    restore() {
      delete require.cache[indexModulePath];
      authModule.authorizeTelegramSession = originalAuthorizeTelegramSession;
      authModule.completeTelegramPasswordAuth = originalCompleteTelegramPasswordAuth;
      authModule.requestTelegramLoginCode = originalRequestTelegramLoginCode;
      adapterModule.createTelegramAdapter = originalCreateTelegramAdapter;

      for (const key of envKeys) {
        if (envBackup[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = envBackup[key];
        }
      }

      if (previousEmbeddedConfig === undefined) {
        delete globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__;
      } else {
        globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__ = previousEmbeddedConfig;
      }

      if (previousPebble === undefined) {
        delete globalThis.Pebble;
      } else {
        globalThis.Pebble = previousPebble;
      }

      if (previousLocalStorage === undefined) {
        delete globalThis.localStorage;
      } else {
        globalThis.localStorage = previousLocalStorage;
      }
    },
  };
}

describe("PKJS config auth flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates chats after a successful config-page auth save", async () => {
    const harness = await loadPkjsHarness();

    try {
      const requestCodeResponse = encodeConfigResponse("auth:request-code", {
        phoneNumber: "+15551234567",
        loginCode: "",
        password: "",
        sendMode: "auto",
        previewChatMessage: true,
      });
      const response = encodeConfigResponse("config:save", {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "secret",
        sendMode: "auto",
        previewChatMessage: true,
      });

      harness.listeners.get("webviewclosed")({ response: requestCodeResponse });
      await flushAsyncWork();

      expect(harness.requestTelegramLoginCode).toHaveBeenCalledWith(
        expect.objectContaining({ apiId: 123456, apiHash: "env-hash", source: "env" }),
        expect.objectContaining({
          phoneNumber: "+15551234567",
          sendMode: "auto",
          previewChatMessage: true,
        }),
        expect.any(Function),
      );
      expect(JSON.parse(harness.storage.getItem("tg_pebble:auth_state"))).toMatchObject({
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        codeDelivery: "app",
        telegramWebDcId: 1,
        telegramWebDcHost: "pluto.web.telegram.org",
        telegramWebDcPort: 443,
        forceWSS: true,
        authSessionString: "temp-auth-session",
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "auto|1|0|0|code",
        requestId: 0,
        syncState: "desynced",
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.authorizeTelegramSession).toHaveBeenCalledWith(
        expect.objectContaining({
          apiId: 123456,
          apiHash: "env-hash",
          source: "env",
          telegramWebDcId: 1,
          telegramWebDcHost: "pluto.web.telegram.org",
          telegramWebDcPort: 443,
          forceWSS: true,
        }),
        expect.objectContaining({
          phoneNumber: "+15551234567",
          loginCode: "12345",
          password: "secret",
          phoneCodeHash: "hash-123",
          authSessionString: "temp-auth-session",
          sendMode: "auto",
          previewChatMessage: true,
        }),
        expect.any(Function),
      );

      expect(JSON.parse(harness.storage.getItem("tg_pebble:session"))).toEqual({
        sessionString: "saved-session",
        phoneNumber: "+15551234567",
        accountLabel: "Alice Example",
        userId: "7",
      });
      expect(JSON.parse(harness.storage.getItem("tg_pebble:chat_list"))).toEqual([
        { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
      ]);

      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "auto|1|1|0|signed_in",
        requestId: 0,
        syncState: "syncing",
      });
      expect(getSentPayloads(harness.sentMessages, "chat_list_complete").at(-1)).toEqual({
        payload: "1",
        requestId: 1,
        syncState: "synced",
      });
      expect(getSentPayloads(harness.sentMessages, "chat_item")).toEqual([
        {
          payload: "7|Live Alice|Latest|1",
          requestId: 0,
          syncState: "syncing",
        },
      ]);
    } finally {
      harness.restore();
    }
  });

  it("drops stale chat page work and correlates the latest response", async () => {
    vi.useFakeTimers();
    const harness = await loadPkjsHarness();

    try {
      await harness.module.handleRequest({ 0: "open_chat", 1: "1001", 2: 41 });
      await harness.module.handleRequest({ 0: "open_chat", 1: "2001", 2: 42 });
      await vi.runAllTimersAsync();

      expect(getSentPayloads(harness.sentMessages, "chat_page_complete")).toEqual([
        { payload: "2001", requestId: 42, syncState: "synced" },
      ]);
      expect(getSentPayloads(harness.sentMessages, "sync_status")).toEqual([
        { payload: "", requestId: 42, syncState: "syncing" },
      ]);
    } finally {
      harness.restore();
      vi.useRealTimers();
    }
  });

  it("coalesces repeated startup chat-list requests", async () => {
    vi.useFakeTimers();
    const harness = await loadPkjsHarness();
    let resolveRefresh;
    const refreshChatList = vi.fn(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    harness.module.app.canRefreshChatList = () => true;
    harness.module.app.getChatListSnapshot = () => ({ chats: [] });
    harness.module.app.refreshChatList = refreshChatList;

    try {
      await harness.module.handleRequest({ 0: "app_ready" });
      await vi.advanceTimersByTimeAsync(120);
      await harness.module.handleRequest({ 0: "app_ready" });
      await vi.advanceTimersByTimeAsync(120);

      expect(refreshChatList).toHaveBeenCalledTimes(1);

      resolveRefresh({ chats: [] });
      await vi.runAllTimersAsync();

      expect(getSentPayloads(harness.sentMessages, "sync_status")).toHaveLength(2);
      expect(getSentPayloads(harness.sentMessages, "settings_state")).toHaveLength(2);
      expect(getSentPayloads(harness.sentMessages, "chat_list_complete")).toEqual([
        { payload: "0", requestId: 0, syncState: "syncing" },
        { payload: "0", requestId: 0, syncState: "synced" },
      ]);
    } finally {
      harness.restore();
      vi.useRealTimers();
    }
  });

  it("sends the warm cache before the Telegram refresh completes", async () => {
    vi.useFakeTimers();
    let resolveRefresh;
    const hydrateChatList = vi.fn(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    const harness = await loadPkjsHarness({
      hydrateChatList,
      initialStorage: {
        "tg_pebble:session": JSON.stringify({ sessionString: "live-session" }),
        "tg_pebble:chat_list": JSON.stringify([
          { id: 9, remoteId: "user:9", title: "Cached Alice", preview: "Cached", unreadCount: 2 },
        ]),
        "tg_pebble:chat_refs": JSON.stringify({
          9: { peerKey: "user:9", peerType: "user", peerId: "9", accessHash: "90" },
        }),
      },
    });

    try {
      await harness.module.handleRequest({ 0: "app_ready" });
      await vi.advanceTimersByTimeAsync(120);

      expect(hydrateChatList).toHaveBeenCalledTimes(1);
      expect(getSentPayloads(harness.sentMessages, "chat_item")).toEqual([
        { payload: "9|Cached Alice|Cached|2", requestId: 0, syncState: "syncing" },
      ]);
      expect(getSentPayloads(harness.sentMessages, "chat_list_complete")).toEqual([
        { payload: "1", requestId: 1, syncState: "syncing" },
      ]);

      resolveRefresh({
        chats: [{ id: 7, title: "Live Alice", preview: "Latest", unreadCount: 1 }],
        chatRefs: { 7: { peerKey: "user:7", peerType: "user", peerId: "7", accessHash: "70" } },
      });
      await vi.runAllTimersAsync();

      expect(getSentPayloads(harness.sentMessages, "chat_item").at(-1)).toEqual({
        payload: "7|Live Alice|Latest|1",
        requestId: 0,
        syncState: "syncing",
      });
      expect(getSentPayloads(harness.sentMessages, "chat_list_complete").at(-1)).toEqual({
        payload: "1",
        requestId: 1,
        syncState: "synced",
      });
    } finally {
      harness.restore();
      vi.useRealTimers();
    }
  });

  it("keeps cached chats visible and reports desync when refresh fails", async () => {
    vi.useFakeTimers();
    const harness = await loadPkjsHarness({
      hydrateChatList: async () => {
        throw new Error("NETWORK_UNAVAILABLE");
      },
      initialStorage: {
        "tg_pebble:session": JSON.stringify({ sessionString: "live-session" }),
        "tg_pebble:chat_list": JSON.stringify([
          { id: 9, title: "Cached Alice", preview: "Cached", unreadCount: 2 },
        ]),
      },
    });

    try {
      await harness.module.handleRequest({ 0: "app_ready" });
      await vi.runAllTimersAsync();

      expect(getSentPayloads(harness.sentMessages, "chat_item")).toEqual([
        { payload: "9|Cached Alice|Cached|2", requestId: 0, syncState: "syncing" },
      ]);
      expect(getSentPayloads(harness.sentMessages, "chat_list_complete")).toEqual([
        { payload: "1", requestId: 1, syncState: "syncing" },
      ]);
      expect(getSentPayloads(harness.sentMessages, "sync_status").at(-1)).toEqual({
        payload: "",
        requestId: 0,
        syncState: "desynced",
      });
      expect(harness.module.app.getSyncState()).toBe("desynced");
    } finally {
      harness.restore();
      vi.useRealTimers();
    }
  });

  it("correlates send results with the originating watch request", async () => {
    const harness = await loadPkjsHarness();
    harness.module.app.sendMessage = vi.fn(async () => ({ ok: true }));

    try {
      await harness.module.handleRequest({ 0: "send_message", 1: "1001|Hello", 2: 77 });

      expect(harness.module.app.sendMessage).toHaveBeenCalledWith("1001", "Hello");
      expect(getSentPayloads(harness.sentMessages, "send_result")).toEqual([
        { payload: "ok", requestId: 77, syncState: "desynced" },
      ]);
    } finally {
      harness.restore();
    }
  });

  it("uses embedded runtime config when env is unavailable", async () => {
    const harness = await loadPkjsHarness({
      env: {
        TG_API_ID: null,
        TG_API_HASH: null,
        TG_TEST_USE_WSS: null,
        TG_TEST_SERVERS: null,
        TG_CONFIG_URL: null,
        TG_SESSION_STRING: null,
      },
      embeddedConfig: {
        apiId: 888001,
        apiHash: "embedded-hash",
        configUrl: "https://nick1udwig.github.io/tg-pebble/config/",
      },
    });

    try {
      const requestCodeResponse = encodeConfigResponse("auth:request-code", {
        phoneNumber: "+15551234567",
        loginCode: "",
        password: "",
        sendMode: "preview",
        previewChatMessage: false,
      });
      const response = encodeConfigResponse("config:save", {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "secret",
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response: requestCodeResponse });
      await flushAsyncWork();
      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.requestTelegramLoginCode).toHaveBeenCalledWith(
        expect.objectContaining({ apiId: 888001, apiHash: "embedded-hash", source: "embedded" }),
        expect.objectContaining({ phoneNumber: "+15551234567" }),
        expect.any(Function),
      );
      expect(harness.authorizeTelegramSession).toHaveBeenCalledWith(
        expect.objectContaining({ apiId: 888001, apiHash: "embedded-hash", source: "embedded" }),
        expect.objectContaining({
          phoneNumber: "+15551234567",
          loginCode: "12345",
          phoneCodeHash: "hash-123",
          authSessionString: "temp-auth-session",
        }),
        expect.any(Function),
      );
      expect(JSON.parse(harness.storage.getItem("tg_pebble:session"))).toEqual({
        sessionString: "saved-session",
        phoneNumber: "+15551234567",
        accountLabel: "Alice Example",
        userId: "7",
      });
    } finally {
      harness.restore();
    }
  });

  it("stores a password challenge when Telegram accepts the code but requires 2FA", async () => {
    vi.useFakeTimers();

    const passwordChallenge = {
      srpId: "42",
      g: 2,
      p: "p64",
      salt1: "s164",
      salt2: "s264",
      srpB: "b64",
    };
    const passwordNeeded = new Error("2FA password is required for this Telegram account.");
    passwordNeeded.errorMessage = "SESSION_PASSWORD_NEEDED";
    passwordNeeded.passwordRequired = true;
    passwordNeeded.authSessionString = "temp-auth-session-after-code";
    passwordNeeded.passwordHint = "hint";
    passwordNeeded.passwordChallenge = passwordChallenge;
    const harness = await loadPkjsHarness({ authorizeError: passwordNeeded });

    try {
      harness.storage.setItem("tg_pebble:auth_state", JSON.stringify({
        errorMessage: "",
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        codeDelivery: "app",
        codeRequestedAt: 1234,
        telegramWebDcId: 1,
        telegramWebDcHost: "pluto.web.telegram.org",
        telegramWebDcPort: 443,
        forceWSS: true,
        authSessionString: "temp-auth-session",
      }));
      harness.storage.setItem("tg_pebble:session", JSON.stringify({
        sessionString: "",
        phoneNumber: "+15551234567",
        accountLabel: "",
        userId: "",
      }));
      const response = encodeConfigResponse("config:save", {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "",
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response });
      await vi.runAllTimersAsync();

      expect(JSON.parse(harness.storage.getItem("tg_pebble:auth_state"))).toMatchObject({
        errorMessage: "",
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        passwordRequired: true,
        passwordHint: "hint",
        passwordChallenge,
        authSessionString: "temp-auth-session-after-code",
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|0|password",
        requestId: 0,
        syncState: "desynced",
      });
      expect(globalThis.Pebble.openURL).toHaveBeenCalledTimes(1);
      expect(globalThis.Pebble.openURL.mock.calls[0][0]).toContain("passwordRequired");
    } finally {
      harness.restore();
      vi.useRealTimers();
    }
  });

  it("finishes password-required auth using a config-page SRP proof", async () => {
    const harness = await loadPkjsHarness();

    try {
      harness.storage.setItem("tg_pebble:auth_state", JSON.stringify({
        errorMessage: "",
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        codeDelivery: "app",
        codeRequestedAt: 1234,
        telegramWebDcId: 1,
        telegramWebDcHost: "pluto.web.telegram.org",
        telegramWebDcPort: 443,
        forceWSS: true,
        authSessionString: "temp-auth-session",
        passwordRequired: true,
        passwordHint: "hint",
        passwordChallenge: {
          srpId: "42",
          g: 2,
          p: "p64",
          salt1: "s164",
          salt2: "s264",
          srpB: "b64",
        },
      }));
      harness.storage.setItem("tg_pebble:session", JSON.stringify({
        sessionString: "",
        phoneNumber: "+15551234567",
        accountLabel: "",
        userId: "",
      }));
      const response = encodeConfigResponse("auth:submit-password", {
        phoneNumber: "+15551234567",
        loginCode: "",
        password: "",
        passwordProof: {
          srpId: "42",
          A: "A64",
          M1: "M164",
        },
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.completeTelegramPasswordAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          telegramWebDcId: 1,
          telegramWebDcHost: "pluto.web.telegram.org",
          telegramWebDcPort: 443,
          forceWSS: true,
        }),
        expect.objectContaining({
          phoneNumber: "+15551234567",
          passwordProof: {
            srpId: "42",
            A: "A64",
            M1: "M164",
          },
          phoneCodeHash: "hash-123",
          authSessionString: "temp-auth-session",
        }),
        expect.any(Function),
      );
      expect(JSON.parse(harness.storage.getItem("tg_pebble:session"))).toEqual({
        sessionString: "saved-session",
        phoneNumber: "+15551234567",
        accountLabel: "Alice Example",
        userId: "7",
      });
    } finally {
      harness.restore();
    }
  });

  it("persists auth errors when config-page auth save fails", async () => {
    const harness = await loadPkjsHarness({
      authorizeError: new Error("Code expired."),
    });

    try {
      harness.storage.setItem("tg_pebble:auth_state", JSON.stringify({
        errorMessage: "",
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        codeDelivery: "app",
        codeRequestedAt: 1234,
      }));
      const response = encodeConfigResponse("auth:save", {
        phoneNumber: "+15551234567",
        loginCode: "99999",
        password: "secret",
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(JSON.parse(harness.storage.getItem("tg_pebble:auth_state"))).toEqual({
        errorMessage: "Code expired.",
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        codeDelivery: "app",
        codeRequestedAt: 1234,
        telegramWebDcId: 0,
        telegramWebDcHost: "",
        telegramWebDcPort: 0,
        forceWSS: false,
        authSessionString: "",
        passwordRequired: false,
        passwordHint: "",
        passwordChallenge: null,
      });
      expect(JSON.parse(harness.storage.getItem("tg_pebble:session"))).toEqual({
        sessionString: "",
        phoneNumber: "+15551234567",
        accountLabel: "",
        userId: "",
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|1|error",
        requestId: 0,
        syncState: "desynced",
      });
      expect(getSentPayloads(harness.sentMessages, "sync_status").at(-1)).toEqual({
        payload: "",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });

  it("clears stale pending login-code state after terminal code auth errors", async () => {
    const phoneCodeExpired = new Error("PHONE_CODE_EXPIRED");
    phoneCodeExpired.errorMessage = "PHONE_CODE_EXPIRED";
    const harness = await loadPkjsHarness({
      authorizeError: phoneCodeExpired,
    });

    try {
      harness.storage.setItem("tg_pebble:auth_state", JSON.stringify({
        errorMessage: "",
        phoneNumber: "+15551234567",
        phoneCodeHash: "hash-123",
        codeDelivery: "app",
        codeRequestedAt: 1234,
        telegramWebDcId: 1,
        telegramWebDcHost: "pluto.web.telegram.org",
        telegramWebDcPort: 443,
        forceWSS: true,
        authSessionString: "temp-auth-session",
        passwordRequired: false,
        passwordHint: "",
        passwordChallenge: null,
      }));
      const response = encodeConfigResponse("auth:save", {
        phoneNumber: "+15551234567",
        loginCode: "99999",
        password: "",
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(JSON.parse(harness.storage.getItem("tg_pebble:auth_state"))).toEqual({
        errorMessage: "PHONE_CODE_EXPIRED",
        phoneNumber: "+15551234567",
        phoneCodeHash: "",
        codeDelivery: "",
        codeRequestedAt: 0,
        telegramWebDcId: 0,
        telegramWebDcHost: "",
        telegramWebDcPort: 0,
        forceWSS: false,
        authSessionString: "",
        passwordRequired: false,
        passwordHint: "",
        passwordChallenge: null,
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|1|error",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });

  it("updates settings locally without attempting auth when login credentials are absent", async () => {
    const harness = await loadPkjsHarness();

    try {
      const response = encodeConfigResponse("settings:update", {
        phoneNumber: "+15551234567",
        loginCode: "",
        password: "",
        sendMode: "auto",
        previewChatMessage: true,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.authorizeTelegramSession).not.toHaveBeenCalled();
      expect(JSON.parse(harness.storage.getItem("tg_pebble:session"))).toEqual({
        sessionString: "",
        phoneNumber: "+15551234567",
        accountLabel: "",
        userId: "",
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "auto|1|0|0|phone",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });

  it("requires requesting a login code before submitting the received code", async () => {
    const harness = await loadPkjsHarness();

    try {
      const response = encodeConfigResponse("config:save", {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "",
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.authorizeTelegramSession).not.toHaveBeenCalled();
      expect(JSON.parse(harness.storage.getItem("tg_pebble:auth_state"))).toEqual({
        errorMessage: "Request a Telegram login code first.",
        phoneNumber: "",
        phoneCodeHash: "",
        codeDelivery: "",
        codeRequestedAt: 0,
        telegramWebDcId: 0,
        telegramWebDcHost: "",
        telegramWebDcPort: 0,
        forceWSS: false,
        authSessionString: "",
        passwordRequired: false,
        passwordHint: "",
        passwordChallenge: null,
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|1|error",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });

  it("opens the embedded config page URL for published builds", async () => {
    const harness = await loadPkjsHarness({
      env: {
        TG_API_ID: null,
        TG_API_HASH: null,
        TG_TEST_USE_WSS: null,
        TG_TEST_SERVERS: null,
        TG_CONFIG_URL: null,
        TG_SESSION_STRING: null,
      },
      embeddedConfig: {
        apiId: 888001,
        apiHash: "embedded-hash",
        configUrl: "https://nick1udwig.github.io/tg-pebble/config/",
      },
    });

    try {
      harness.listeners.get("showConfiguration")();

      expect(globalThis.Pebble.openURL).toHaveBeenCalledTimes(1);
      expect(globalThis.Pebble.openURL.mock.calls[0][0]).toContain("https://nick1udwig.github.io/tg-pebble/config/");
      expect(globalThis.Pebble.openURL.mock.calls[0][0]).toContain("state=");
    } finally {
      harness.restore();
    }
  });

  it("surfaces configuration errors when no Telegram auth config is available", async () => {
    const harness = await loadPkjsHarness({
      env: {
        TG_API_ID: null,
        TG_API_HASH: null,
        TG_TEST_USE_WSS: null,
        TG_TEST_SERVERS: null,
        TG_CONFIG_URL: null,
        TG_SESSION_STRING: null,
      },
      embeddedConfig: null,
    });

    try {
      const response = encodeConfigResponse("config:save", {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "secret",
        sendMode: "preview",
        previewChatMessage: false,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.authorizeTelegramSession).not.toHaveBeenCalled();
      expect(JSON.parse(harness.storage.getItem("tg_pebble:auth_state"))).toEqual({
        errorMessage: "Telegram auth is not configured in this build.",
        phoneNumber: "",
        phoneCodeHash: "",
        codeDelivery: "",
        codeRequestedAt: 0,
        telegramWebDcId: 0,
        telegramWebDcHost: "",
        telegramWebDcPort: 0,
        forceWSS: false,
        authSessionString: "",
        passwordRequired: false,
        passwordHint: "",
        passwordChallenge: null,
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|1|error",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });

  it("logs object details when Object.getOwnPropertyNames is unavailable", async () => {
    const originalGetOwnPropertyNames = Object.getOwnPropertyNames;
    const harness = await loadPkjsHarness();

    try {
      Object.getOwnPropertyNames = undefined;

      harness.listeners.get("showConfiguration")();

      expect(globalThis.Pebble.openURL).toHaveBeenCalledTimes(1);
    } finally {
      Object.getOwnPropertyNames = originalGetOwnPropertyNames;
      harness.restore();
    }
  });
});
