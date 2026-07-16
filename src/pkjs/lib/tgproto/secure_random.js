"use strict";

var MAX_GET_RANDOM_VALUES_LENGTH = 65536;

function getCryptoApi() {
  if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
    return crypto;
  }

  if (typeof window !== "undefined" && window) {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      return window.crypto;
    }
    if (window.msCrypto && typeof window.msCrypto.getRandomValues === "function") {
      return window.msCrypto;
    }
  }

  return null;
}

function defaultRandomBytes(length) {
  var size = Number(length);
  var cryptoApi;
  var out;
  var offset;

  if (!isFinite(size) || size < 0 || Math.floor(size) !== size) {
    throw new Error("Secure random byte length must be a non-negative integer.");
  }

  cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    throw new Error("Secure randomness is unavailable; crypto.getRandomValues is required for Telegram.");
  }

  out = new Uint8Array(size);
  for (offset = 0; offset < out.length; offset += MAX_GET_RANDOM_VALUES_LENGTH) {
    cryptoApi.getRandomValues(out.subarray(offset, offset + MAX_GET_RANDOM_VALUES_LENGTH));
  }
  return out;
}

module.exports = {
  defaultRandomBytes: defaultRandomBytes,
  getCryptoApi: getCryptoApi
};
