var messageGroups = require("../message_groups");
var placeholders = require("../placeholders");
var tgprotoClient = require("../tgproto/client");

var addSenderRunMetadata = messageGroups.addSenderRunMetadata;
var toDisplayText = placeholders.toDisplayText;
var createInputPeer = tgprotoClient.createInputPeer;

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
  return createInputPeer(remoteRef);
}

function describeRemoteRef(remoteRef, inputPeer) {
  var peerId = String(remoteRef && remoteRef.peerId || "");
  var accessHash = String(remoteRef && remoteRef.accessHash || "");

  return {
    peerType: String(remoteRef && remoteRef.peerType || ""),
    peerIdLength: String(peerId.length),
    hasAccessHash: accessHash.length > 0,
    accessHashLength: String(accessHash.length),
    inputPeerClassName: String(inputPeer && inputPeer.className || "")
  };
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
  options = options || {};
  var clientFactory = options.clientFactory;
  var sessionString = String(options.sessionString || "");
  var enabled = parseBoolean(options.enabled, true);
  var logger = typeof options.logger === "function" ? options.logger : function() {};

  async function withClient(handler) {
    var client;

    if (!enabled || !sessionString || typeof clientFactory !== "function") {
      throw new Error("Telegram adapter is not configured.");
    }

    client = clientFactory(sessionString);

    try {
      if (client && typeof client.connect === "function") {
        await client.connect();
      }
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
        var dialogs;

        dialogs = await client.getDialogs({ limit: params.limit || 20 });
        return mapDialogs(dialogs, params.cachedRefs || {}, { limit: params.limit || 20 });
      });
    },
    hydrateChatPage: async function(params) {
      params = params || {};
      return withClient(async function(client) {
        var inputPeer = buildInputPeer(params.remoteRef);
        var refSummary = describeRemoteRef(params.remoteRef, inputPeer);
        var messages;

        refSummary.chatId = String(params.chatId || "");
        logger("Telegram chat page hydrate started", refSummary);
        if (!inputPeer) {
          throw new Error("Missing Telegram peer for chat.");
        }

        messages = await client.getMessages(inputPeer, { limit: params.limit || 20 });
        logger("Telegram chat page hydrate succeeded", {
          chatId: String(params.chatId || ""),
          peerType: refSummary.peerType,
          hasAccessHash: refSummary.hasAccessHash,
          messageCount: String(messages && messages.length || 0)
        });
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
