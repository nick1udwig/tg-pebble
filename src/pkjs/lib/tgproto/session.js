"use strict";

var bytes = require("./bytes");

var SESSION_PREFIX = "TG2.";

function bytesToBinaryString(value) {
  var out = "";
  var index;

  for (index = 0; index < value.length; index += 1) {
    out += String.fromCharCode(value[index]);
  }

  return out;
}

function binaryStringToBytes(value) {
  var out = new Uint8Array(value.length);
  var index;

  for (index = 0; index < value.length; index += 1) {
    out[index] = value.charCodeAt(index) & 255;
  }

  return out;
}

function base64Encode(value) {
  if (typeof btoa === "function") {
    return btoa(bytesToBinaryString(value));
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64");
  }

  throw new Error("No base64 encoder is available.");
}

function base64Decode(value) {
  if (typeof atob === "function") {
    return binaryStringToBytes(atob(value));
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  throw new Error("No base64 decoder is available.");
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
