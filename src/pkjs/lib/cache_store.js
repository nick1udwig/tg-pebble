var protocol = require("./protocol");
var numberLib = require("./number");
var objectLib = require("./object");

var ProtocolByteLimit = protocol.ProtocolByteLimit;
var assign = objectLib.assign;
var truncateUtf8 = protocol.truncateUtf8;
var utf8ByteLength = protocol.utf8ByteLength;
var isFiniteNumber = numberLib.isFiniteNumber;

var CACHE_KEYS = Object.freeze({
  session: "session",
  settings: "settings",
  chatList: "chat_list",
  messagePages: "message_pages",
  chatRefs: "chat_refs",
  syncCheckpoint: "sync_checkpoint",
  authState: "auth_state"
});

var DEFAULT_SETTINGS = Object.freeze({
  sendMode: "preview",
  previewChatMessage: false
});

var DEFAULT_AUTH_STATE = Object.freeze({
  errorMessage: "",
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
  passwordChallenge: null
});

var MAX_CACHED_MESSAGES_PER_CHAT = 4;
var MAX_CACHED_CHAT_LIST_BYTES = 407;

function createMemoryStorage() {
  var data = {};

  return {
    getItem: function(key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        return data[key];
      }
      return null;
    },
    setItem: function(key, value) {
      data[key] = String(value);
    },
    removeItem: function(key) {
      delete data[key];
    }
  };
}

function mergeSettings(settings) {
  var merged = {
    sendMode: DEFAULT_SETTINGS.sendMode,
    previewChatMessage: DEFAULT_SETTINGS.previewChatMessage
  };
  var key;

  settings = settings || {};

  for (key in settings) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      merged[key] = settings[key];
    }
  }

  return merged;
}

function normalizeAuthState(authState) {
  var codeRequestedAt = Number(authState && authState.codeRequestedAt);
  var telegramWebDcId = Number(authState && authState.telegramWebDcId);
  var telegramWebDcPort = Number(authState && authState.telegramWebDcPort);
  var passwordChallenge = authState && authState.passwordChallenge && typeof authState.passwordChallenge === "object"
    ? authState.passwordChallenge
    : null;

  return {
    errorMessage: String(authState && authState.errorMessage ? authState.errorMessage : ""),
    phoneNumber: String(authState && authState.phoneNumber ? authState.phoneNumber : "").trim(),
    phoneCodeHash: String(authState && authState.phoneCodeHash ? authState.phoneCodeHash : ""),
    codeDelivery: authState && authState.codeDelivery === "app" ? "app" : (
      authState && authState.codeDelivery === "sms" ? "sms" : ""
    ),
    codeRequestedAt: isFiniteNumber(codeRequestedAt) && codeRequestedAt > 0 ? codeRequestedAt : 0,
    telegramWebDcId: isFiniteNumber(telegramWebDcId) && telegramWebDcId > 0 ? telegramWebDcId : 0,
    telegramWebDcHost: String(authState && authState.telegramWebDcHost ? authState.telegramWebDcHost : "").trim(),
    telegramWebDcPort: isFiniteNumber(telegramWebDcPort) && telegramWebDcPort > 0 ? telegramWebDcPort : 0,
    forceWSS: authState && authState.forceWSS === true,
    authSessionString: String(authState && authState.authSessionString ? authState.authSessionString : ""),
    passwordRequired: authState && authState.passwordRequired === true,
    passwordHint: String(authState && authState.passwordHint ? authState.passwordHint : ""),
    passwordChallenge: passwordChallenge ? {
      srpId: String(passwordChallenge.srpId || ""),
      g: Number(passwordChallenge.g || 0),
      p: String(passwordChallenge.p || ""),
      salt1: String(passwordChallenge.salt1 || ""),
      salt2: String(passwordChallenge.salt2 || ""),
      srpB: String(passwordChallenge.srpB || "")
    } : null
  };
}

function normalizeChatText(value, maxBytes) {
  return truncateUtf8(
    String(value == null ? "" : value)
      .replace(/\r?\n/g, " ")
      .trim(),
    maxBytes
  );
}

function fitChatListWithinBudget(chats) {
  var nextChats = chats.slice();
  var longestPreviewLength;
  var longestPreviewIndex;
  var index;
  var candidateLength;

  while (nextChats.length > 0 && utf8ByteLength(JSON.stringify(nextChats)) > MAX_CACHED_CHAT_LIST_BYTES) {
    longestPreviewLength = 0;
    longestPreviewIndex = -1;

    for (index = 0; index < nextChats.length; index += 1) {
      candidateLength = utf8ByteLength(nextChats[index].preview || "");
      if (candidateLength > longestPreviewLength) {
        longestPreviewLength = candidateLength;
        longestPreviewIndex = index;
      }
    }

    if (longestPreviewIndex >= 0 && longestPreviewLength > 0) {
      nextChats[longestPreviewIndex] = assign({}, nextChats[longestPreviewIndex], {
        preview: truncateUtf8(nextChats[longestPreviewIndex].preview, longestPreviewLength - 1)
      });
      continue;
    }

    nextChats.pop();
  }

  return nextChats;
}

function normalizeChatList(chats) {
  var nextChats = [];
  var index;
  var chat;

  chats = Array.isArray(chats) ? chats : [];

  for (index = 0; index < chats.length; index += 1) {
    chat = chats[index] || {};
    nextChats.push(assign({}, chat, {
      title: normalizeChatText(chat.title, ProtocolByteLimit.chatTitle),
      preview: normalizeChatText(chat.preview, ProtocolByteLimit.chatPreview)
    }));
  }

  return fitChatListWithinBudget(nextChats);
}

function normalizeMessage(message) {
  message = message || {};

  return {
    senderId: message.senderId,
    senderName: normalizeChatText(message.senderName, ProtocolByteLimit.messageSender),
    outgoing: message.outgoing === true,
    text: normalizeChatText(message.text, ProtocolByteLimit.messageText),
    showSender: message.showSender === true
  };
}

function normalizeMessagePages(pages) {
  var nextPages = {};
  var keys;
  var index;
  var key;
  var messages;

  pages = pages && typeof pages === "object" ? pages : {};
  keys = Object.keys(pages);

  for (index = 0; index < keys.length; index += 1) {
    key = keys[index];
    messages = Array.isArray(pages[key]) ? pages[key] : [];
    nextPages[key] = messages
      .slice(-MAX_CACHED_MESSAGES_PER_CHAT)
      .map(normalizeMessage);
  }

  return nextPages;
}

function createCacheStore(storage, options) {
  var prefix = "tg_pebble";

  options = options || {};
  storage = storage || createMemoryStorage();
  if (options.prefix) {
    prefix = options.prefix;
  }

  function getKey(key) {
    return prefix + ":" + key;
  }

  function getJson(key, fallback) {
    var raw;

    if (fallback === undefined) {
      fallback = null;
    }

    raw = storage.getItem(getKey(key));

    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function setJson(key, value) {
    storage.setItem(getKey(key), JSON.stringify(value));
    return value;
  }

  function remove(key) {
    storage.removeItem(getKey(key));
  }

  return {
    getJson: getJson,
    setJson: setJson,
    remove: remove,
    getSession: function() {
      return getJson(CACHE_KEYS.session, null);
    },
    setSession: function(session) {
      return setJson(CACHE_KEYS.session, session);
    },
    getAuthState: function() {
      return normalizeAuthState(getJson(CACHE_KEYS.authState, DEFAULT_AUTH_STATE));
    },
    setAuthState: function(authState) {
      return setJson(CACHE_KEYS.authState, normalizeAuthState(authState));
    },
    clearAuthState: function() {
      remove(CACHE_KEYS.authState);
    },
    getSettings: function() {
      return mergeSettings(getJson(CACHE_KEYS.settings, {}));
    },
    setSettings: function(settings) {
      return setJson(CACHE_KEYS.settings, mergeSettings(assign({}, this.getSettings(), settings)));
    },
    getChatList: function() {
      return getJson(CACHE_KEYS.chatList, []);
    },
    setChatList: function(chats) {
      return setJson(CACHE_KEYS.chatList, normalizeChatList(chats));
    },
    getMessagePages: function() {
      return getJson(CACHE_KEYS.messagePages, {});
    },
    setMessagePages: function(pages) {
      return setJson(CACHE_KEYS.messagePages, normalizeMessagePages(pages));
    },
    getChatRefs: function() {
      return getJson(CACHE_KEYS.chatRefs, {});
    },
    setChatRefs: function(chatRefs) {
      return setJson(CACHE_KEYS.chatRefs, chatRefs);
    },
    clearChatsAndMessages: function() {
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.chatRefs);
      remove(CACHE_KEYS.syncCheckpoint);
    },
    clearAll: function() {
      remove(CACHE_KEYS.session);
      remove(CACHE_KEYS.authState);
      remove(CACHE_KEYS.settings);
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.chatRefs);
      remove(CACHE_KEYS.syncCheckpoint);
    }
  };
}

module.exports = {
  CACHE_KEYS: CACHE_KEYS,
  createCacheStore: createCacheStore
};
