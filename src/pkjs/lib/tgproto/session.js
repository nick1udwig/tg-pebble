"use strict";

var bytes = require("./bytes");

var SESSION_PREFIX = "TG2.";
var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(value) {
  var input = value || new Uint8Array(0);
  var out = "";
  var index;
  var first;
  var second;
  var third;
  var hasSecond;
  var hasThird;

  for (index = 0; index < input.length; index += 3) {
    first = input[index];
    hasSecond = index + 1 < input.length;
    hasThird = index + 2 < input.length;
    second = hasSecond ? input[index + 1] : 0;
    third = hasThird ? input[index + 2] : 0;

    out += BASE64_ALPHABET.charAt(first >> 2);
    out += BASE64_ALPHABET.charAt(((first & 3) << 4) | (second >> 4));
    out += hasSecond ? BASE64_ALPHABET.charAt(((second & 15) << 2) | (third >> 6)) : "=";
    out += hasThird ? BASE64_ALPHABET.charAt(third & 63) : "=";
  }

  return out;
}

function decodeBase64Char(value) {
  var index = BASE64_ALPHABET.indexOf(value);

  if (index < 0) {
    throw new Error("Invalid base64 character.");
  }

  return index;
}

function base64Decode(value) {
  var text = String(value || "").replace(/\s+/g, "");
  var out = [];
  var index;
  var first;
  var second;
  var third;
  var fourth;
  var thirdChar;
  var fourthChar;
  var lastBlock;

  if (!text) {
    return new Uint8Array(0);
  }

  if (text.length % 4 !== 0) {
    throw new Error("Invalid base64 length.");
  }

  for (index = 0; index < text.length; index += 4) {
    thirdChar = text.charAt(index + 2);
    fourthChar = text.charAt(index + 3);
    lastBlock = index + 4 === text.length;

    if ((thirdChar === "=" || fourthChar === "=") && !lastBlock) {
      throw new Error("Invalid base64 padding.");
    }
    if (thirdChar === "=" && fourthChar !== "=") {
      throw new Error("Invalid base64 padding.");
    }

    first = decodeBase64Char(text.charAt(index));
    second = decodeBase64Char(text.charAt(index + 1));
    third = thirdChar === "=" ? 0 : decodeBase64Char(thirdChar);
    fourth = fourthChar === "=" ? 0 : decodeBase64Char(fourthChar);

    out.push(((first << 2) | (second >> 4)) & 255);
    if (thirdChar !== "=") {
      out.push((((second & 15) << 4) | (third >> 2)) & 255);
    }
    if (fourthChar !== "=") {
      out.push((((third & 3) << 6) | fourth) & 255);
    }
  }

  return new Uint8Array(out);
}

function encodeJson(value) {
  return base64Encode(bytes.utf8Encode(JSON.stringify(value)));
}

function decodeJson(value) {
  return JSON.parse(bytes.utf8Decode(base64Decode(value)));
}

function NativeTelegramSession(sessionString) {
  var data;

  this.dcId = 2;
  this.serverAddress = "venus.web.telegram.org";
  this.port = 443;
  this.authKey = null;
  this.authKeyId = "";
  this.serverSalt = "0";
  this.timeOffset = 0;
  this.userId = "";

  if (!sessionString) {
    return;
  }

  if (String(sessionString).indexOf(SESSION_PREFIX) !== 0) {
    throw new Error("Unsupported native Telegram session format.");
  }

  data = decodeJson(String(sessionString).slice(SESSION_PREFIX.length));
  this.dcId = Number(data.dcId || this.dcId);
  this.serverAddress = String(data.serverAddress || this.serverAddress);
  this.port = Number(data.port || this.port);
  this.authKey = data.authKey ? base64Decode(data.authKey) : null;
  this.authKeyId = String(data.authKeyId || "");
  this.serverSalt = String(data.serverSalt || "0");
  this.timeOffset = Number(data.timeOffset || 0);
  this.userId = String(data.userId || "");
}

NativeTelegramSession.prototype.setDC = function(dcId, serverAddress, port) {
  this.dcId = Number(dcId || this.dcId);
  this.serverAddress = String(serverAddress || this.serverAddress);
  this.port = Number(port || this.port);
};

NativeTelegramSession.prototype.setAuthKey = function(authKey, authKeyId) {
  this.authKey = authKey ? new Uint8Array(authKey) : null;
  this.authKeyId = this.authKey ? String(authKeyId || this.authKeyId || "") : String(authKeyId || "");
};

NativeTelegramSession.prototype.save = function() {
  if (!this.authKey || !this.authKey.length) {
    return "";
  }

  return SESSION_PREFIX + encodeJson({
    version: 1,
    dcId: this.dcId,
    serverAddress: this.serverAddress,
    port: this.port,
    authKey: base64Encode(this.authKey),
    authKeyId: this.authKeyId,
    serverSalt: this.serverSalt,
    timeOffset: this.timeOffset,
    userId: this.userId
  });
};

module.exports = {
  NativeTelegramSession: NativeTelegramSession,
  SESSION_PREFIX: SESSION_PREFIX,
  base64Decode: base64Decode,
  base64Encode: base64Encode
};
