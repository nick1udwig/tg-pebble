"use strict";

var abridged = require("./abridged");
var authKey = require("./auth_key");
var bytes = require("./bytes");
var crypto = require("./crypto");
var mtproto = require("./mtproto");
var obfuscated = require("./obfuscated");
var tl = require("./tl");
var webSocket = require("./web_socket");

var RPC_RESULT_ID = 0xf35c6d01;
var MSG_CONTAINER_ID = 0x73f1f8dc;
var TRANSPORT_ERROR_DESCRIPTIONS = {
  "-404": "auth key not found",
  "-429": "transport flood",
  "-444": "invalid data center"
};

function createTransportError(packet) {
  var code;
  var description;
  var error;

  if (!packet || packet.length !== 4) {
    return null;
  }

  code = new bytes.ByteReader(packet).readInt32();
  description = TRANSPORT_ERROR_DESCRIPTIONS[String(code)] || "transport rejected";
  error = new Error("Telegram transport error " + code + ": " + description + ".");
  error.name = "TelegramTransportError";
  error.errorCode = code;
  error.transportErrorCode = code;
  return error;
}

function isServiceMessage(result) {
  var name = result && result.tlName;
  return name === "new_session_created" ||
    name === "msgs_ack" ||
    name === "bad_msg_notification" ||
    name === "bad_server_salt";
}

function readRpcResultBody(request, body, expectedRequestMessageId) {
  var reader = new bytes.ByteReader(body);
  var constructorId = reader.readUInt32();
  var count;
  var index;
  var messageBody;
  var nested;
  var requestMessageId;
  var directResult;
  var fallback = null;

  if (constructorId === RPC_RESULT_ID) {
    requestMessageId = reader.readInt64(false);
    if (expectedRequestMessageId && String(requestMessageId) !== String(expectedRequestMessageId)) {
      return null;
    }
    return tl.deserializeResult(request, reader.readRaw(reader.remaining()));
  }

  if (constructorId === MSG_CONTAINER_ID) {
    count = reader.readInt32();
    for (index = 0; index < count; index += 1) {
      reader.readInt64(false);
      reader.readInt32();
      messageBody = reader.readRaw(reader.readInt32());
      nested = readRpcResultBody(request, messageBody, expectedRequestMessageId);
      if (nested !== null && nested !== undefined) {
        if (isServiceMessage(nested)) {
          fallback = nested;
          continue;
        }
        return nested;
      }
    }
    return fallback;
  }

  directResult = tl.deserializeObject(body);
  return isServiceMessage(directResult) ? directResult : null;
}

function updateServerSaltFromService(state, session, result) {
  var salt;

  if (!result) {
    return false;
  }

  if (result.tlName === "new_session_created") {
    salt = result.serverSalt;
  } else if (result.tlName === "bad_server_salt") {
    salt = result.newServerSalt;
  }

  if (salt == null) {
    return result.tlName === "msgs_ack" || result.tlName === "bad_msg_notification";
  }

  if (state) {
    state.serverSalt = String(salt);
  }
  if (session) {
    session.serverSalt = String(salt);
  }
  return true;
}

function NativeMtProtoSender(options) {
  options = options || {};
  this.options = options;
  this.cryptoProvider = options.cryptoProvider || crypto.createDefaultCryptoProvider({
    randomBytes: options.randomBytes || mtproto.defaultRandomBytes
  });
  this.randomBytes = options.randomBytes || this.cryptoProvider.randomBytes || mtproto.defaultRandomBytes;
  this.streamFactory = options.streamFactory || null;
  this.transport = null;
  this.state = null;
}

NativeMtProtoSender.prototype._createStream = function(client) {
  if (typeof this.streamFactory === "function") {
    return this.streamFactory(client);
  }

  return new webSocket.NativeWebSocketStream(client.getWebSocketUrl(), "binary");
};

NativeMtProtoSender.prototype.connect = function(client) {
  var self = this;
  var stream = this._createStream(client);

  this.state = new mtproto.MtProtoState(client.session, {
    randomBytes: this.randomBytes
  });

  return Promise.resolve(stream.connect()).then(function() {
    self.transport = new obfuscated.ObfuscatedAbridgedTransport(stream, {
      randomBytes: self.randomBytes,
      createAesCtr: self.cryptoProvider.createAesCtr
    });
    self.transport.init();
  });
};

NativeMtProtoSender.prototype.disconnect = function() {
  if (this.transport && this.transport.stream && typeof this.transport.stream.close === "function") {
    this.transport.stream.close();
  }
  this.transport = null;
  return Promise.resolve();
};

NativeMtProtoSender.prototype.sendPlain = function(request) {
  var self = this;
  var payload = tl.serializeObject(request);

  if (!this.transport || !this.state) {
    return Promise.reject(new Error("Native Telegram sender is not connected."));
  }

  this.transport.send(this.state.wrapPlain(payload));
  return this.transport.recv().then(function(packet) {
    return tl.deserializeResult(request, self.state.unwrapPlain(packet).body);
  });
};

NativeMtProtoSender.prototype.ensureAuthKey = function(client) {
  var self = this;
  var session = client && client.session;

  if (!session || typeof session.setAuthKey !== "function") {
    return Promise.reject(new Error("Native Telegram session is required for auth key generation."));
  }

  if (session && session.authKey && session.authKey.length) {
    return Promise.resolve();
  }

  return authKey.createAuthKey(this, client, {
    cryptoProvider: this.cryptoProvider,
    randomBytes: this.randomBytes
  }).then(function(result) {
    session.setAuthKey(result.authKey, result.authKeyId);
    session.serverSalt = result.serverSalt;
    session.timeOffset = result.timeOffset;
    if (self.state) {
      self.state.serverSalt = result.serverSalt;
      self.state.timeOffset = result.timeOffset;
    }
  });
};

NativeMtProtoSender.prototype.invoke = function(message) {
  var self = this;
  var request = message.request;
  var payload = message.payload;
  var session = message.client && message.client.session;

  function receiveResult(retriedAfterSalt, requestMessageId) {
    return self.transport.recv().then(function(responsePacket) {
      var transportError = createTransportError(responsePacket);
      if (transportError) {
        throw transportError;
      }
      return self.state.unwrapEncrypted(responsePacket, self.cryptoProvider);
    }).then(function(messageBody) {
      var result = readRpcResultBody(request, messageBody.body, requestMessageId);

      if (result === null || result === undefined) {
        return receiveResult(retriedAfterSalt, requestMessageId);
      }

      if (result && result.tlName === "bad_server_salt" && !retriedAfterSalt) {
        updateServerSaltFromService(self.state, session, result);
        return sendAndReceive(true);
      }

      if (isServiceMessage(result)) {
        updateServerSaltFromService(self.state, session, result);
        return receiveResult(retriedAfterSalt, requestMessageId);
      }

      return result;
    });
  }

  function sendAndReceive(retriedAfterSalt) {
    return self.state.wrapEncrypted(payload, self.cryptoProvider).then(function(packet) {
      var requestMessageId = String(self.state.lastMessageId || "");
      self.transport.send(packet);
      return receiveResult(retriedAfterSalt, requestMessageId);
    });
  }

  if (!this.transport || !this.state) {
    return Promise.reject(new Error("Native Telegram sender is not connected."));
  }

  return this.ensureAuthKey(message.client).then(function() {
    return sendAndReceive(false);
  });
};

module.exports = {
  MSG_CONTAINER_ID: MSG_CONTAINER_ID,
  NativeMtProtoSender: NativeMtProtoSender,
  RPC_RESULT_ID: RPC_RESULT_ID,
  createTransportError: createTransportError,
  isServiceMessage: isServiceMessage,
  readRpcResultBody: readRpcResultBody
};
