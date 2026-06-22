"use strict";

var bytes = require("./bytes");

var ABRIDGED_TAG = bytes.bytesFromHex("ef");
var OBFUSCATED_ABRIDGED_TAG = bytes.bytesFromHex("efefefef");

function encodeAbridgedPacket(payload) {
  var length = payload.length >>> 2;
  var header;

  if (payload.length % 4 !== 0) {
    throw new Error("Abridged MTProto payload length must be divisible by 4.");
  }

  if (length < 127) {
    header = new Uint8Array([length]);
  } else {
    header = new Uint8Array([
      127,
      length & 255,
      (length >>> 8) & 255,
      (length >>> 16) & 255
    ]);
  }

  return bytes.concatBytes([header, payload]);
}

function readAbridgedPacket(reader) {
  return reader.readExactly(1).then(function(firstBytes) {
    var first = firstBytes[0];

    if (first < 127) {
      return reader.readExactly(first << 2);
    }

    return reader.readExactly(3).then(function(lengthBytes) {
      var length = lengthBytes[0] | (lengthBytes[1] << 8) | (lengthBytes[2] << 16);
      return reader.readExactly(length << 2);
    });
  });
}

module.exports = {
  ABRIDGED_TAG: ABRIDGED_TAG,
  OBFUSCATED_ABRIDGED_TAG: OBFUSCATED_ABRIDGED_TAG,
  encodeAbridgedPacket: encodeAbridgedPacket,
  readAbridgedPacket: readAbridgedPacket
};
