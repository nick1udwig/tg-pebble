var telegram = require("telegram");
var messageGroups = require("../message_groups");
var placeholders = require("../placeholders");

var Api = telegram.Api;
var addSenderRunMetadata = messageGroups.addSenderRunMetadata;
var toDisplayText = placeholders.toDisplayText;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function createEmptyResult() {
  return {
    chats: [],
    messagePages: {},
    chatRefs: {}
  };
}

function cloneObject(source) {
  var target = {};
  var key;

  source = source || {};
  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }

  return target;
}

function createRemoteRef(dialog) {
  var inputEntity = dialog && dialog.inputEntity;
  var className = inputEntity && inputEntity.className ? inputEntity.className : "";

  if (className === "InputPeerUser") {
    return {
      peerKey: "user:" + String(inputEntity.userId),
      peerType: "user",
      peerId: String(inputEntity.userId),
      accessHash: String(inputEntity.accessHash || ""),
      title: dialog.name || ""
    };
  }

  if (className === "InputPeerChat") {
    return {
      peerKey: "chat:" + String(inputEntity.chatId),
      peerType: "chat",
      peerId: String(inputEntity.chatId),
      accessHash: "",
      title: dialog.name || ""
    };
  }

  if (className === "InputPeerChannel") {
    return {
      peerKey: "channel:" + String(inputEntity.channelId),
      peerType: "channel",
      peerId: String(inputEntity.channelId),
      accessHash: String(inputEntity.accessHash || ""),
      title: dialog.name || ""
    };
  }

  return null;
}

function buildInputPeer(remoteRef) {
  if (!remoteRef || !remoteRef.peerType || !remoteRef.peerId) {
    return null;
  }

  if (remoteRef.peerType === "user") {
    return new Api.InputPeerUser({
      userId: remoteRef.peerId,
      accessHash: remoteRef.accessHash
    });
  }

  if (remoteRef.peerType === "chat") {
    return new Api.InputPeerChat({
      chatId: remoteRef.peerId
    });
  }

  if (remoteRef.peerType === "channel") {
    return new Api.InputPeerChannel({
      channelId: remoteRef.peerId,
      accessHash: remoteRef.accessHash
    });
  }

  return null;
}

function formatPreviewFromMessage(message) {
  if (!message) {
    return "";
  }

  return toDisplayText({
    text: typeof message.message === "string" ? message.message : "",
    kind: inferMessageKind(message)
  });
}

function inferMessageKind(message) {
  if (!message) {
    return "";
  }

  if (typeof message.message === "string" && message.message.trim().length > 0) {
    return "text";
  }

  if (message.photo) {
    return "photo";
  }

  if (message.voice) {
    return "voice";
  }

  if (message.sticker) {
    return "sticker";
  }

  if (message.document) {
    return "file";
  }

  return "";
}

function formatSenderName(message) {
  var sender;
  var firstName;
  var lastName;
  var title;

  if (!message) {
    return "Unknown";
  }

  if (message.out) {
    return "You";
  }

  sender = message.sender || null;
  if (!sender && typeof message.getSender === "function") {
    sender = message.sender;
  }

  if (!sender) {
    return "Unknown";
  }

  if (sender.firstName || sender.lastName) {
    firstName = String(sender.firstName || "").trim();
    lastName = String(sender.lastName || "").trim();
    return (firstName + " " + lastName).trim() || sender.username || "Unknown";
  }

  title = sender.title || sender.username;
  return title || "Unknown";
}

function mapDialogs(dialogs, cachedRefs, options) {
  var limit = options.limit;
  var chats = [];
  var chatRefs = {};
  var nextWatchId = 1;
  var usedIds = {};
  var reverseByPeerId = {};
  var index;
  var dialog;
  var existingRefKey;
  var watchId;
  var remoteRef;

  cachedRefs = cachedRefs || {};
  for (existingRefKey in cachedRefs) {
    if (Object.prototype.hasOwnProperty.call(cachedRefs, existingRefKey)) {
      reverseByPeerId[String(cachedRefs[existingRefKey].peerKey)] = Number(existingRefKey);
      usedIds[Number(existingRefKey)] = true;
    }
  }

  while (usedIds[nextWatchId]) {
    nextWatchId += 1;
  }

  for (index = 0; index < dialogs.length; index += 1) {
    if (index >= limit) {
      break;
    }

    dialog = dialogs[index];
    remoteRef = createRemoteRef(dialog);
    if (!remoteRef || !remoteRef.peerKey) {
      continue;
    }

    watchId = reverseByPeerId[remoteRef.peerKey];
    if (!Number.isFinite(watchId)) {
      watchId = nextWatchId;
      usedIds[watchId] = true;
      nextWatchId += 1;
      while (usedIds[nextWatchId]) {
        nextWatchId += 1;
      }
    }

    chatRefs[watchId] = remoteRef;
    chats.push({
      id: watchId,
      remoteId: remoteRef.peerKey,
      title: dialog.name || "Chat",
      preview: formatPreviewFromMessage(dialog.message),
      unreadCount: Number(dialog.unreadCount || 0)
    });
  }

  return {
    chats: chats,
    chatRefs: chatRefs
  };
}

function mapMessages(messages) {
  var mapped = [];
  var index;
  var message;
  var senderId;

  for (index = 0; index < messages.length; index += 1) {
    message = messages[index];
    senderId = message.senderId != null ? String(message.senderId) : (message.out ? "self" : "unknown");
    mapped.push({
      senderId: senderId,
      senderName: formatSenderName(message),
      outgoing: !!message.out,
      text: toDisplayText({
        text: typeof message.message === "string" ? message.message : "",
        kind: inferMessageKind(message)
      })
    });
  }

  return addSenderRunMetadata(mapped);
}

function createTelegramAdapter(options) {
  var clientFactory = options.clientFactory;
  var sessionString = String(options.sessionString || "");
  var enabled = parseBoolean(options.enabled, true);

  async function withClient(handler) {
    var client;

    if (!enabled || !sessionString || typeof clientFactory !== "function") {
      throw new Error("Telegram adapter is not configured.");
    }

    client = clientFactory(sessionString);

    try {
      return await handler(client);
    } finally {
      if (client && typeof client.disconnect === "function") {
        await client.disconnect().catch(function() {});
      }
    }
  }

  return {
    isConfigured: function() {
      return enabled && sessionString.length > 0 && typeof clientFactory === "function";
    },
    hydrateChatList: async function(params) {
      params = params || {};
      return withClient(async function(client) {
        var dialogs = await client.getDialogs({ limit: params.limit || 20 });
        return mapDialogs(dialogs, params.cachedRefs || {}, { limit: params.limit || 20 });
      });
    },
    hydrateChatPage: async function(params) {
      params = params || {};
      return withClient(async function(client) {
        var inputPeer = buildInputPeer(params.remoteRef);
        var messages = await client.getMessages(inputPeer, { limit: params.limit || 20 });
        return {
          chatId: params.chatId,
          messages: mapMessages(messages)
        };
      });
    },
    sendTextMessage: async function(params) {
      params = params || {};
      return withClient(async function(client) {
        var inputPeer = buildInputPeer(params.remoteRef);
        var result = await client.sendMessage(inputPeer, { message: params.text });
        return {
          ok: !!result,
          messageId: result && result.id ? result.id : null
        };
      });
    }
  };
}

module.exports = {
  createTelegramAdapter: createTelegramAdapter,
  createEmptyResult: createEmptyResult,
  mapDialogs: mapDialogs,
  mapMessages: mapMessages,
  buildInputPeer: buildInputPeer
};
