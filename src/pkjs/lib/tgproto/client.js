"use strict";

var tl = require("./tl");
var webSocket = require("./web_socket");
var sessionLib = require("./session");
var numberLib = require("../number");

var isFiniteNumber = numberLib.isFiniteNumber;

var TELEGRAM_WEB_DCS = Object.freeze({
  1: { dcId: 1, host: "pluto.web.telegram.org", port: 443 },
  2: { dcId: 2, host: "venus.web.telegram.org", port: 443 },
  3: { dcId: 3, host: "aurora.web.telegram.org", port: 443 },
  4: { dcId: 4, host: "vesta.web.telegram.org", port: 443 },
  5: { dcId: 5, host: "flora.web.telegram.org", port: 443 }
});

var TELEGRAM_API_LAYER = 198;

function getTelegramWebDc(dcId) {
  var dc = TELEGRAM_WEB_DCS[Number(dcId)];

  if (!dc) {
    throw new Error("Unsupported Telegram web DC: " + dcId);
  }

  return dc;
}

function createInputPeer(remoteRef) {
  if (!remoteRef || !remoteRef.peerType || !remoteRef.peerId) {
    return null;
  }

  if (remoteRef.peerType === "user") {
    return {
      className: "InputPeerUser",
      userId: String(remoteRef.peerId),
      accessHash: String(remoteRef.accessHash || "")
    };
  }

  if (remoteRef.peerType === "chat") {
    return {
      className: "InputPeerChat",
      chatId: String(remoteRef.peerId)
    };
  }

  if (remoteRef.peerType === "channel") {
    return {
      className: "InputPeerChannel",
      channelId: String(remoteRef.peerId),
      accessHash: String(remoteRef.accessHash || "")
    };
  }

  return null;
}

function NativeTelegramClient(options) {
  var host;
  var port;

  this.options = options || {};
  this.dc = getTelegramWebDc(this.options.dcId || 2);
  host = String(this.options.host || "").trim();
  port = Number(this.options.port || this.dc.port || 443);
  if (host && isFiniteNumber(port) && port > 0) {
    this.dc = {
      dcId: Number(this.options.dcId || this.dc.dcId),
      host: host,
      port: port
    };
  }
  this.session = new sessionLib.NativeTelegramSession(this.options.sessionString || "");
  this.session.setDC(this.dc.dcId, this.dc.host, this.dc.port);
  this.sender = this.options.sender || null;
  this.connected = false;
  this.didInitConnection = false;
}

NativeTelegramClient.prototype.connect = function() {
  var self = this;

  if (this.connected) {
    return Promise.resolve();
  }

  if (!this.sender || typeof this.sender.connect !== "function") {
    return Promise.reject(new Error("Native Telegram MTProto sender is not wired yet."));
  }

  return Promise.resolve(this.sender.connect(this)).then(function() {
    self.connected = true;
  });
};

NativeTelegramClient.prototype.disconnect = function() {
  this.connected = false;
  if (this.sender && typeof this.sender.disconnect === "function") {
    return Promise.resolve(this.sender.disconnect());
  }

  return Promise.resolve();
};

NativeTelegramClient.prototype.switchDc = function(dcId) {
  var self = this;
  var dc = getTelegramWebDc(dcId);

  return this.disconnect().then(function() {
    self.dc = dc;
    self.session.setDC(dc.dcId, dc.host, dc.port);
    self.session.setAuthKey(null, "");
    self.session.serverSalt = "0";
    self.session.timeOffset = 0;
    self.didInitConnection = false;
    return self.connect();
  });
};

NativeTelegramClient.prototype.getWebSocketUrl = function() {
  return webSocket.buildTelegramWebSocketUrl(this.dc, this.options.testServers === true);
};

function getMigrationDc(result) {
  var message = String(result && (result.errorMessage || result.error_message) || "");
  var match = message.match(/(?:PHONE|NETWORK|USER|FILE)_MIGRATE_(\d+)/);
  var dcId;

  if (!match) {
    return 0;
  }

  dcId = Number(match[1]);
  return isFiniteNumber(dcId) && dcId > 0 ? dcId : 0;
}

function callHook(callback) {
  var args;

  if (typeof callback !== "function") {
    return Promise.resolve();
  }

  args = Array.prototype.slice.call(arguments, 1);
  return Promise.resolve(callback.apply(null, args));
}

NativeTelegramClient.prototype._invoke = function(request, allowMigration) {
  var self = this;
  var wireRequest = request;
  var payload;

  if (!this.sender || typeof this.sender.invoke !== "function") {
    return Promise.reject(new Error("Native Telegram MTProto invoke is not wired yet."));
  }

  if (!this.didInitConnection) {
    wireRequest = tl.Api.InvokeWithLayer({
      layer: TELEGRAM_API_LAYER,
      query: tl.Api.InitConnection({
        apiId: Number(this.options.apiId || 0),
        deviceModel: String(this.options.deviceModel || "TG Pebble"),
        systemVersion: String(this.options.systemVersion || "Pebble PKJS"),
        appVersion: String(this.options.appVersion || "0.1"),
        systemLangCode: String(this.options.systemLangCode || "en"),
        langPack: String(this.options.langPack || ""),
        langCode: String(this.options.langCode || "en"),
        query: request
      })
    });
  }

  payload = tl.serializeObject(wireRequest);
  return Promise.resolve(this.sender.invoke({
    request: request,
    wireRequest: wireRequest,
    payload: payload,
    client: self
  })).then(function(result) {
    if (result instanceof Uint8Array) {
      result = tl.deserializeResult(request, result);
    }

    if (result && result.tlName === "rpc_error") {
      var migrateDc = getMigrationDc(result);
      if (allowMigration !== false && migrateDc) {
        return self.switchDc(migrateDc).then(function() {
          return self._invoke(request, false);
        });
      }

      var error = new Error(result.errorMessage || result.error_message || "Telegram RPC error.");
      error.errorCode = result.errorCode || result.error_code;
      error.errorMessage = result.errorMessage || result.error_message;
      throw error;
    }

    self.didInitConnection = true;
    return result;
  });
};

NativeTelegramClient.prototype.invoke = function(request) {
  return this._invoke(request, true);
};

function getPeerKey(peer) {
  var name = peer && (peer.tlName || peer.className);

  if (!peer) {
    return "";
  }

  if (name === "peerUser" || name === "PeerUser") {
    return "user:" + String(peer.userId || peer.user_id);
  }

  if (name === "peerChat" || name === "PeerChat") {
    return "chat:" + String(peer.chatId || peer.chat_id);
  }

  if (name === "peerChannel" || name === "PeerChannel") {
    return "channel:" + String(peer.channelId || peer.channel_id);
  }

  return "";
}

function getEntityKey(entity) {
  var name = entity && (entity.tlName || entity.className);

  if (!entity) {
    return "";
  }

  if (name === "user" || name === "User" || name === "userEmpty" || name === "UserEmpty") {
    return "user:" + String(entity.id);
  }

  if (name === "chat" || name === "Chat" || name === "chatEmpty" || name === "ChatEmpty" ||
      name === "chatForbidden" || name === "ChatForbidden") {
    return "chat:" + String(entity.id);
  }

  if (name === "channel" || name === "Channel" || name === "channelForbidden" || name === "ChannelForbidden") {
    return "channel:" + String(entity.id);
  }

  return "";
}

function formatEntityName(entity) {
  var firstName;
  var lastName;
  var combined;

  if (!entity) {
    return "";
  }

  if (entity.title) {
    return String(entity.title);
  }

  firstName = String(entity.firstName || entity.first_name || "").trim();
  lastName = String(entity.lastName || entity.last_name || "").trim();
  combined = (firstName + " " + lastName).trim();

  if (combined) {
    return combined;
  }

  if (entity.username) {
    return "@" + String(entity.username);
  }

  return String(entity.id || "");
}

function createInputEntity(entity) {
  var key = getEntityKey(entity);

  if (key.indexOf("user:") === 0) {
    return {
      className: "InputPeerUser",
      userId: String(entity.id),
      accessHash: String(entity.accessHash || entity.access_hash || "")
    };
  }

  if (key.indexOf("chat:") === 0) {
    return {
      className: "InputPeerChat",
      chatId: String(entity.id)
    };
  }

  if (key.indexOf("channel:") === 0) {
    return {
      className: "InputPeerChannel",
      channelId: String(entity.id),
      accessHash: String(entity.accessHash || entity.access_hash || "")
    };
  }

  return null;
}

function indexEntities(result) {
  var entities = {};
  var items = []
    .concat(result && result.users ? result.users : [])
    .concat(result && result.chats ? result.chats : []);
  var index;
  var key;

  for (index = 0; index < items.length; index += 1) {
    key = getEntityKey(items[index]);
    if (key) {
      entities[key] = items[index];
    }
  }

  return entities;
}

function attachMessageSender(message, entities) {
  var senderKey;
  var mediaName;

  if (!message) {
    return message;
  }

  senderKey = getPeerKey(message.fromId || message.from_id || message.peerId || message.peer_id);
  if (senderKey && entities[senderKey]) {
    message.sender = entities[senderKey];
  }
  message.senderId = senderKey ? senderKey.split(":")[1] : "";
  mediaName = message.media && (message.media.tlName || message.media.className);
  if (message.media && (mediaName === "messageMediaPhoto" || mediaName === "MessageMediaPhoto")) {
    message.photo = message.media.photo || {};
  }
  if (message.media && (mediaName === "messageMediaDocument" || mediaName === "MessageMediaDocument")) {
    message.document = message.media.document || {};
    if (message.media.voice === true) {
      message.voice = message.media.document || {};
    }
  }
  return message;
}

function indexMessages(result, entities) {
  var messages = {};
  var list = result && result.messages ? result.messages : [];
  var index;
  var message;
  var key;

  for (index = 0; index < list.length; index += 1) {
    message = attachMessageSender(list[index], entities);
    key = getPeerKey(message.peerId || message.peer_id) + ":" + String(message.id);
    messages[key] = message;
  }

  return messages;
}

function getDialogMessage(dialog, messages) {
  var key = getPeerKey(dialog.peer) + ":" + String(dialog.topMessage || dialog.top_message);
  return messages[key] || null;
}

function normalizeDialogs(result) {
  var entities = indexEntities(result);
  var messages = indexMessages(result, entities);
  var dialogs = result && result.dialogs ? result.dialogs : [];
  var out = [];
  var index;
  var dialog;
  var entity;
  var peerKey;

  for (index = 0; index < dialogs.length; index += 1) {
    dialog = dialogs[index];
    peerKey = getPeerKey(dialog.peer);
    entity = entities[peerKey];
    if (!entity) {
      continue;
    }
    out.push({
      name: formatEntityName(entity),
      unreadCount: Number(dialog.unreadCount || dialog.unread_count || 0),
      message: getDialogMessage(dialog, messages),
      inputEntity: createInputEntity(entity)
    });
  }

  return out;
}

function normalizeMessages(result) {
  var entities = indexEntities(result);
  var list = result && result.messages ? result.messages : [];
  var out = [];
  var index;

  for (index = 0; index < list.length; index += 1) {
    out.push(attachMessageSender(list[index], entities));
  }

  return out;
}

function normalizeAuthorization(result) {
  if (result && result.tlName === "auth.authorization") {
    return result.user || null;
  }

  if (result && result.tlName === "auth.authorizationSignUpRequired") {
    var error = new Error("Telegram sign-up is required. Create the account in Telegram first.");
    error.errorMessage = "SIGN_UP_REQUIRED";
    throw error;
  }

  return result && result.user ? result.user : result;
}

function normalizeSentMessage(result) {
  if (!result) {
    return null;
  }

  if (result.tlName === "updateShortSentMessage") {
    return {
      id: result.id,
      out: result.out === true,
      date: result.date,
      message: ""
    };
  }

  return result;
}

NativeTelegramClient.prototype.getDialogs = function(params) {
  params = params || {};
  return this.invoke(tl.Api.messages.GetDialogs({
    offsetDate: 0,
    offsetId: 0,
    offsetPeer: tl.Api.InputPeerEmpty(),
    limit: params.limit || 20,
    hash: "0"
  })).then(normalizeDialogs);
};

NativeTelegramClient.prototype.getMessages = function(inputPeer, params) {
  params = params || {};
  return this.invoke(tl.Api.messages.GetHistory({
    peer: inputPeer,
    offsetId: 0,
    offsetDate: 0,
    addOffset: 0,
    limit: params.limit || 20,
    maxId: 0,
    minId: 0,
    hash: "0"
  })).then(normalizeMessages);
};

NativeTelegramClient.prototype.sendMessage = function(inputPeer, params) {
  params = params || {};
  return this.invoke(tl.Api.messages.SendMessage({
    noWebpage: true,
    peer: inputPeer,
    message: String(params.message || ""),
    randomId: params.randomId || String(Date.now()) + String(Math.floor(Math.random() * 1000000))
  })).then(normalizeSentMessage);
};

NativeTelegramClient.prototype.sendCode = function(apiCredentials, phoneNumber) {
  return this.invoke(tl.Api.auth.SendCode({
    phoneNumber: phoneNumber,
    apiId: Number(apiCredentials.apiId),
    apiHash: String(apiCredentials.apiHash),
    settings: tl.Api.CodeSettings({})
  })).then(function(result) {
    var resultName = result && (result.tlName || result.className);
    var typeName = result && result.type && (result.type.tlName || result.type.className);

    if (resultName === "auth.sentCodeSuccess" || resultName === "auth.SentCodeSuccess") {
      throw new Error("Already authorized after sending the code.");
    }

    return {
      phoneCodeHash: String(result && result.phoneCodeHash ? result.phoneCodeHash : ""),
      isCodeViaApp: typeName === "auth.sentCodeTypeApp" || typeName === "auth.SentCodeTypeApp"
    };
  });
};

NativeTelegramClient.prototype.signIn = function(params) {
  params = params || {};
  return this.invoke(tl.Api.auth.SignIn({
    phoneNumber: params.phoneNumber,
    phoneCodeHash: params.phoneCodeHash,
    phoneCode: params.phoneCode
  })).then(normalizeAuthorization);
};

NativeTelegramClient.prototype.getPasswordInfo = function() {
  return this.invoke(tl.Api.account.GetPassword({}));
};

NativeTelegramClient.prototype.checkPassword = function(passwordCheck) {
  return this.invoke(tl.Api.auth.CheckPassword({
    password: passwordCheck
  })).then(normalizeAuthorization);
};

NativeTelegramClient.prototype.signInWithPassword = function(_apiCredentials, authParams) {
  var self = this;
  var provider = this.options.passwordSrpProvider;
  authParams = authParams || {};

  return this.getPasswordInfo().then(function(passwordInfo) {
    if (!provider || typeof provider.computeCheck !== "function") {
      throw new Error("Native Telegram 2FA SRP provider is not wired yet.");
    }

    return callHook(authParams.onPasswordInfo, passwordInfo).then(function() {
      return passwordInfo;
    });
  }).then(function(passwordInfo) {
    return authParams.password(passwordInfo.hint).then(function(password) {
      return callHook(authParams.onComputeStart).then(function() {
        return password;
      });
    }).then(function(password) {
      return provider.computeCheck(passwordInfo, password);
    }).then(function(passwordCheck) {
      return callHook(authParams.onComputeDone, passwordCheck).then(function() {
        return passwordCheck;
      });
    });
  }).then(function(passwordCheck) {
    return callHook(authParams.onCheckStart, passwordCheck).then(function() {
      return passwordCheck;
    });
  }).then(function(passwordCheck) {
    return self.checkPassword(passwordCheck).then(function(result) {
      return callHook(authParams.onCheckDone, result).then(function() {
        return result;
      });
    });
  });
};

NativeTelegramClient.prototype.getMe = function() {
  return this.invoke(tl.Api.users.GetUsers({
    id: [tl.Api.InputUserSelf({})]
  })).then(function(users) {
    return users && users.length ? users[0] : null;
  });
};

NativeTelegramClient.prototype.isUserAuthorized = function() {
  return this.getMe().then(function(user) {
    return !!user;
  }, function() {
    return false;
  });
};

NativeTelegramClient.prototype.logOut = function() {
  return this.invoke(tl.Api.auth.LogOut({}));
};

module.exports = {
  NativeTelegramClient: NativeTelegramClient,
  TELEGRAM_WEB_DCS: TELEGRAM_WEB_DCS,
  TELEGRAM_API_LAYER: TELEGRAM_API_LAYER,
  createInputPeer: createInputPeer,
  getTelegramWebDc: getTelegramWebDc
};
