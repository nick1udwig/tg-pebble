"use strict";

var bytes = require("./bytes");
var abridged = require("./abridged");

var BAD_HEADER_PREFIXES = [
  "50567247",
  "47455400",
  "504f5354",
  "eeeeeeee"
];

function defaultRandomBytes(length) {
  var out = new Uint8Array(length);
  var index;

  if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(out);
  }

  for (index = 0; index < out.length; index += 1) {
    out[index] = Math.floor(Math.random() * 256);
  }

  return out;
}

function isBadHeaderRandom(random) {
  var prefix = bytes.bytesToHex(random.slice(0, 4));

  if (random[0] === 0xef) {
    return true;
  }

  if (random[4] === 0 && random[5] === 0 && random[6] === 0 && random[7] === 0) {
    return true;
  }

  return BAD_HEADER_PREFIXES.indexOf(prefix) >= 0;
}

function createObfuscatedHeader(options) {
  var randomBytes = options && options.randomBytes ? options.randomBytes : defaultRandomBytes;
  var createAesCtr = options && options.createAesCtr;
  var random = randomBytes(64);
  var reversed;
  var encryptKey;
  var encryptIv;
  var decryptKey;
  var decryptIv;
  var encryptor;
  var decryptor;
  var encryptedTail;

  while (isBadHeaderRandom(random)) {
    random = randomBytes(64);
  }

  if (typeof createAesCtr !== "function") {
    throw new Error("AES-CTR provider is required for obfuscated MTProto transport.");
  }

  random.set(abridged.OBFUSCATED_ABRIDGED_TAG, 56);
  reversed = random.slice(8, 56);
  Array.prototype.reverse.call(reversed);

  encryptKey = random.slice(8, 40);
  encryptIv = random.slice(40, 56);
  decryptKey = reversed.slice(0, 32);
  decryptIv = reversed.slice(32, 48);

  encryptor = createAesCtr(encryptKey, encryptIv);
  decryptor = createAesCtr(decryptKey, decryptIv);
  encryptedTail = encryptor.encrypt(random).slice(56, 64);
  random.set(encryptedTail, 56);

  return {
    header: random,
    encryptor: encryptor,
    decryptor: decryptor
  };
}

function ObfuscatedAbridgedTransport(stream, options) {
  this.stream = stream;
  this.options = options || {};
  this.encryptor = null;
  this.decryptor = null;
}

ObfuscatedAbridgedTransport.prototype.init = function() {
  var header = createObfuscatedHeader(this.options);

  this.encryptor = header.encryptor;
  this.decryptor = header.decryptor;
  this.stream.write(header.header);
};

ObfuscatedAbridgedTransport.prototype.send = function(payload) {
  this.stream.write(this.encryptor.encrypt(abridged.encodeAbridgedPacket(payload)));
};

ObfuscatedAbridgedTransport.prototype.recv = function() {
  var self = this;
  var decryptingReader = {
    readExactly: function(size) {
      return self.stream.readExactly(size).then(function(data) {
        return self.decryptor.encrypt(data);
      });
    }
  };

  return abridged.readAbridgedPacket(decryptingReader);
};

module.exports = {
  ObfuscatedAbridgedTransport: ObfuscatedAbridgedTransport,
  createObfuscatedHeader: createObfuscatedHeader,
  isBadHeaderRandom: isBadHeaderRandom
};
