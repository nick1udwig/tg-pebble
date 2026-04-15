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
  const authorizeResult = options.authorizeResult || {
    sessionString: "saved-session",
    phoneNumber: "+15551234567",
    accountLabel: "Alice Example",
    userId: "7",
  };
  const authorizeError = options.authorizeError || null;
  const sentMessages = [];
  const listeners = new Map();
  const storage = createMemoryStorage();
  const previousPebble = globalThis.Pebble;
  const previousLocalStorage = globalThis.localStorage;
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
  const originalCreateTelegramAdapter = adapterModule.createTelegramAdapter;
  const authorizeTelegramSession = vi.fn(async () => {
    if (authorizeError) {
      throw authorizeError;
    }

    return authorizeResult;
  });
  const createTelegramAdapter = vi.fn(() => ({
    isConfigured() {
      return true;
    },
    async hydrateChatList() {
      return {
        chats: [
          { id: 7, remoteId: "user:42", title: "Live Alice", preview: "Latest", unreadCount: 1 },
        ],
        chatRefs: {
          7: { peerKey: "user:42", peerType: "user", peerId: "42", accessHash: "123" },
        },
      };
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
  adapterModule.createTelegramAdapter = createTelegramAdapter;

  const module = require(indexModulePath);

  return {
    module,
    listeners,
    sentMessages,
    storage,
    authorizeTelegramSession,
    createTelegramAdapter,
    restore() {
      delete require.cache[indexModulePath];
      authModule.authorizeTelegramSession = originalAuthorizeTelegramSession;
      adapterModule.createTelegramAdapter = originalCreateTelegramAdapter;

      for (const key of envKeys) {
        if (envBackup[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = envBackup[key];
        }
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
      const response = encodeConfigResponse("config:save", {
        phoneNumber: "+15551234567",
        loginCode: "12345",
        password: "secret",
        sendMode: "auto",
        previewChatMessage: true,
      });

      harness.listeners.get("webviewclosed")({ response });
      await flushAsyncWork();

      expect(harness.authorizeTelegramSession).toHaveBeenCalledWith(
        expect.objectContaining({ apiId: 123456, apiHash: "env-hash" }),
        expect.objectContaining({
          phoneNumber: "+15551234567",
          loginCode: "12345",
          password: "secret",
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
        payload: "auto|1|1|0",
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

  it("persists auth errors when config-page auth save fails", async () => {
    const harness = await loadPkjsHarness({
      authorizeError: new Error("Code expired."),
    });

    try {
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
      });
      expect(JSON.parse(harness.storage.getItem("tg_pebble:session"))).toEqual({
        sessionString: "",
        phoneNumber: "+15551234567",
        accountLabel: "",
        userId: "",
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|1",
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
        payload: "auto|1|0|0",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });

  it("surfaces configuration errors when Telegram auth env is unavailable", async () => {
    const harness = await loadPkjsHarness({
      env: {
        TG_API_ID: null,
        TG_API_HASH: null,
        TG_TEST_USE_WSS: null,
        TG_TEST_SERVERS: null,
        TG_CONFIG_URL: null,
        TG_SESSION_STRING: null,
      },
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
      });
      expect(getSentPayloads(harness.sentMessages, "settings_state").at(-1)).toEqual({
        payload: "preview|0|0|1",
        requestId: 0,
        syncState: "desynced",
      });
    } finally {
      harness.restore();
    }
  });
});
