"use strict";

var bytes = require("./bytes");
var bigints = require("./bigint");
var secureRandom = require("./secure_random");

var defaultRandomBytes = secureRandom.defaultRandomBytes;

function createMessageId(nowMs, timeOffset) {
  var millis = Number(nowMs == null ? Date.now() : nowMs);
  var seconds = Math.floor(millis / 1000) + Number(timeOffset || 0);
  var fraction = Math.floor((millis % 1000) * 4294967.296);
  var messageId;

  if (typeof BigInt === "function") {
    messageId = (BigInt(seconds) << BigInt(32)) + BigInt(fraction);
    messageId -= messageId % BigInt(4);
    return messageId.toString();
  }

  return String((seconds * 4294967296) + (fraction - (fraction % 4)));
}

function bytesToLongDecimal(value) {
  return bytes.bytesLEToInt64(value, true);
}

function writePlainMessage(body, messageId) {
  var writer = new bytes.ByteWriter();

  writer.writeInt64("0");
  writer.writeInt64(messageId || createMessageId());
  writer.writeInt32(body.length);
  writer.writeRaw(body);
  return writer.result();
}

function readPlainMessage(payload) {
  var reader = new bytes.ByteReader(payload);
  var authKeyId = reader.readInt64(false);
  var messageId = reader.readInt64(false);
  var length = reader.readInt32();
  var body = reader.readRaw(length);

  return {
    authKeyId: authKeyId,
    messageId: messageId,
    body: body
  };
}

function makeAuthKeyId(authKey, cryptoProvider) {
  if (!cryptoProvider || typeof cryptoProvider.sha1 !== "function") {
    throw new Error("SHA1 provider is required to derive Telegram auth key id.");
  }

  return Promise.resolve(cryptoProvider.sha1(authKey)).then(function(hash) {
    return bytes.bytesLEToInt64(hash.slice(12, 20), false);
  });
}

function buildEncryptedMessageData(state, body, messageId, seqNo, padding) {
  var writer = new bytes.ByteWriter();

  writer.writeInt64(state.serverSalt || "0");
  writer.writeRaw(state.sessionId);
  writer.writeInt64(messageId);
  writer.writeInt32(seqNo);
  writer.writeInt32(body.length);
  writer.writeRaw(body);
  writer.writeRaw(padding);
  return writer.result();
}

function createPadding(length, randomBytes) {
  var paddingLength = 16 - (length % 16);

  if (paddingLength < 12) {
    paddingLength += 16;
  }

  return randomBytes(paddingLength);
}

function deriveMessageKey(authKey, data, incoming, cryptoProvider) {
  var offset = incoming === true ? 96 : 88;

  if (!cryptoProvider || typeof cryptoProvider.sha256 !== "function") {
    throw new Error("SHA256 provider is required for encrypted Telegram messages.");
  }

  return Promise.resolve(cryptoProvider.sha256(bytes.concatBytes([
    authKey.slice(offset, offset + 32),
    data
  ]))).then(function(hash) {
    return hash.slice(8, 24);
  });
}

function deriveAesParams(authKey, messageKey, incoming, cryptoProvider) {
  var x = incoming === true ? 8 : 0;

  if (!cryptoProvider || typeof cryptoProvider.sha256 !== "function") {
    throw new Error("SHA256 provider is required for encrypted Telegram messages.");
  }

  return Promise.all([
    cryptoProvider.sha256(bytes.concatBytes([messageKey, authKey.slice(x, x + 36)])),
    cryptoProvider.sha256(bytes.concatBytes([authKey.slice(x + 40, x + 76), messageKey]))
  ]).then(function(results) {
    var a = results[0];
    var b = results[1];

    return {
      key: bytes.concatBytes([a.slice(0, 8), b.slice(8, 24), a.slice(24, 32)]),
      iv: bytes.concatBytes([b.slice(0, 8), a.slice(8, 24), b.slice(24, 32)])
    };
  });
}

function MtProtoState(session, options) {
  options = options || {};
  this.session = session;
  this.sessionId = options.sessionId || defaultRandomBytes(8);
  this.serverSalt = session && session.serverSalt ? session.serverSalt : "0";
  this.timeOffset = session && session.timeOffset ? Number(session.timeOffset) : 0;
  this.sequence = 0;
  this.randomBytes = options.randomBytes || defaultRandomBytes;
}

MtProtoState.prototype.nextSeqNo = function(contentRelated) {
  var seqNo = this.sequence * 2 + (contentRelated ? 1 : 0);

  if (contentRelated) {
    this.sequence += 1;
  }

  return seqNo;
};

MtProtoState.prototype.wrapPlain = function(body) {
  return writePlainMessage(body, createMessageId(null, this.timeOffset));
};

MtProtoState.prototype.unwrapPlain = function(payload) {
  return readPlainMessage(payload);
};

MtProtoState.prototype.wrapEncrypted = function(body, cryptoProvider) {
  var self = this;
  var authKey = this.session && this.session.authKey;
  var authKeyId = this.session && this.session.authKeyId;
  var messageId = createMessageId(null, this.timeOffset);
  var seqNo = this.nextSeqNo(true);
  var padding;
  var data;

  if (!authKey || !authKey.length || !authKeyId) {
    return Promise.reject(new Error("Telegram auth key is required for encrypted MTProto requests."));
  }

  padding = createPadding(8 + 8 + 8 + 4 + 4 + body.length, this.randomBytes);
  data = buildEncryptedMessageData(this, body, messageId, seqNo, padding);

  if (!cryptoProvider || typeof cryptoProvider.aesIgeEncrypt !== "function") {
    return Promise.reject(new Error("AES-IGE provider is required for encrypted Telegram messages."));
  }

  return deriveMessageKey(authKey, data, false, cryptoProvider).then(function(messageKey) {
    return deriveAesParams(authKey, messageKey, false, cryptoProvider).then(function(params) {
      return Promise.resolve(cryptoProvider.aesIgeEncrypt(data, params.key, params.iv)).then(function(encrypted) {
        var writer = new bytes.ByteWriter();
        writer.writeInt64(authKeyId);
        writer.writeRaw(messageKey);
        writer.writeRaw(encrypted);
        return writer.result();
      });
    });
  });
};

MtProtoState.prototype.unwrapEncrypted = function(payload, cryptoProvider) {
  var authKey = this.session && this.session.authKey;
  var reader = new bytes.ByteReader(payload);
  var authKeyId = reader.readInt64(false);
  var messageKey = reader.readRaw(16);
  var encrypted = reader.readRaw(reader.remaining());
  var self = this;

  if (!authKey || !authKey.length) {
    return Promise.reject(new Error("Telegram auth key is required for encrypted MTProto responses."));
  }

  if (!cryptoProvider || typeof cryptoProvider.aesIgeDecrypt !== "function") {
    return Promise.reject(new Error("AES-IGE provider is required for encrypted Telegram messages."));
  }

  return deriveAesParams(authKey, messageKey, true, cryptoProvider).then(function(params) {
    return Promise.resolve(cryptoProvider.aesIgeDecrypt(encrypted, params.key, params.iv)).then(function(data) {
      return deriveMessageKey(authKey, data, true, cryptoProvider).then(function(actualMessageKey) {
        var dataReader;
        var salt;
        var sessionId;
        var messageId;
        var seqNo;
        var length;

        if (!bigints.equalBytes(actualMessageKey, messageKey)) {
          throw new Error("Telegram encrypted response msg_key mismatch.");
        }

        dataReader = new bytes.ByteReader(data);
        salt = dataReader.readInt64(true);
        sessionId = dataReader.readRaw(8);
        messageId = dataReader.readInt64(false);
        seqNo = dataReader.readInt32();
        length = dataReader.readInt32();

        self.serverSalt = salt;
        if (self.session) {
          self.session.serverSalt = salt;
        }

        return {
          authKeyId: authKeyId,
          sessionId: sessionId,
          messageId: messageId,
          seqNo: seqNo,
          body: dataReader.readRaw(length)
        };
      });
    });
  });
};

module.exports = {
  MtProtoState: MtProtoState,
  bytesToLongDecimal: bytesToLongDecimal,
  createMessageId: createMessageId,
  defaultRandomBytes: defaultRandomBytes,
  deriveAesParams: deriveAesParams,
  makeAuthKeyId: makeAuthKeyId,
  readPlainMessage: readPlainMessage,
  writePlainMessage: writePlainMessage
};
