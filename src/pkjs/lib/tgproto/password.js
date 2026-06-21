"use strict";

var bigints = require("./bigint");
var bytes = require("./bytes");
var crypto = require("./crypto");
var tl = require("./tl");

var SIZE_FOR_HASH = 256;

function bigNumForHash(value) {
  return bigints.bigIntToBytesBE(value, SIZE_FOR_HASH);
}

function numBytesForHash(value) {
  return bigints.leftPad(value || new Uint8Array(0), SIZE_FOR_HASH);
}

function bitLength(value) {
  value = bigints.toBigInt(value);
  return value === BigInt(0) ? 0 : value.toString(2).length;
}

function isGoodLarge(number, p) {
  number = bigints.toBigInt(number);
  p = bigints.toBigInt(p);
  return number > BigInt(0) && p - number > BigInt(0);
}

function isGoodModExpFirst(value, prime) {
  var diff = bigints.toBigInt(prime) - bigints.toBigInt(value);
  var minDiffBitsCount = 2048 - 64;
  var maxModExpSize = 256;
  var valueBits = bitLength(value);

  return !(diff < BigInt(0) ||
    bitLength(diff) < minDiffBitsCount ||
    valueBits < minDiffBitsCount ||
    Math.floor((valueBits + 7) / 8) > maxModExpSize);
}

function computeHash(algo, password, cryptoProvider) {
  return Promise.resolve(cryptoProvider.sha256(bytes.concatBytes([
    algo.salt1,
    bytes.utf8Encode(password),
    algo.salt1
  ]))).then(function(hash1) {
    return cryptoProvider.sha256(bytes.concatBytes([algo.salt2, hash1, algo.salt2]));
  }).then(function(hash2) {
    return cryptoProvider.pbkdf2HmacSha512(hash2, algo.salt1, 100000, 64);
  }).then(function(hash3) {
    return cryptoProvider.sha256(bytes.concatBytes([algo.salt2, hash3, algo.salt2]));
  });
}

function computeCheck(passwordInfo, password, cryptoProvider) {
  cryptoProvider = cryptoProvider || crypto.createDefaultCryptoProvider();

  var algo = passwordInfo && passwordInfo.currentAlgo;
  var srpB = passwordInfo && (passwordInfo.srpB || passwordInfo.srp_B);
  var srpId = passwordInfo && passwordInfo.srpId;
  var p;
  var g;
  var B;
  var x;
  var pForHash;
  var gForHash;
  var bForHash;
  var gX;
  var k;
  var kgX;
  var a;
  var A;
  var aForHash;
  var u;
  var gB;
  var S;

  if (!algo || !algo.p || !algo.salt1 || !algo.salt2) {
    return Promise.reject(new Error("Unsupported Telegram password algorithm."));
  }
  if (!srpB || !srpId) {
    return Promise.reject(new Error("Telegram password SRP data is incomplete."));
  }
  if (!cryptoProvider || typeof cryptoProvider.pbkdf2HmacSha512 !== "function") {
    return Promise.reject(new Error("PBKDF2-HMAC-SHA512 provider is required for Telegram 2FA."));
  }

  p = bigints.bytesToBigIntBE(algo.p, false);
  g = bigints.toBigInt(algo.g);
  B = bigints.bytesToBigIntBE(srpB, false);
  if (!isGoodLarge(B, p)) {
    return Promise.reject(new Error("Telegram password SRP B value is invalid."));
  }

  return computeHash(algo, password, cryptoProvider).then(function(passwordHash) {
    x = bigints.bytesToBigIntBE(passwordHash, false);
    pForHash = numBytesForHash(algo.p);
    gForHash = bigNumForHash(g);
    bForHash = numBytesForHash(srpB);
    gX = bigints.modPow(g, x, p);

    return cryptoProvider.sha256(bytes.concatBytes([pForHash, gForHash]));
  }).then(function(kHash) {
    k = bigints.bytesToBigIntBE(kHash, false);
    kgX = bigints.mod(k * gX, p);

    function generateRandomA() {
      a = bigints.bytesToBigIntBE(cryptoProvider.randomBytes(256), false);
      A = bigints.modPow(g, a, p);
      if (!isGoodModExpFirst(A, p)) {
        return generateRandomA();
      }
      aForHash = bigNumForHash(A);
      return Promise.resolve(cryptoProvider.sha256(bytes.concatBytes([aForHash, bForHash]))).then(function(uHash) {
        u = bigints.bytesToBigIntBE(uHash, false);
        if (u <= BigInt(0)) {
          return generateRandomA();
        }
        return null;
      });
    }

    return generateRandomA();
  }).then(function() {
    gB = bigints.mod(B - kgX, p);
    if (!isGoodModExpFirst(gB, p)) {
      throw new Error("Telegram password SRP gB value is invalid.");
    }
    S = bigints.modPow(gB, a + (u * x), p);
    return Promise.all([
      cryptoProvider.sha256(bigNumForHash(S)),
      cryptoProvider.sha256(pForHash),
      cryptoProvider.sha256(gForHash),
      cryptoProvider.sha256(algo.salt1),
      cryptoProvider.sha256(algo.salt2)
    ]);
  }).then(function(results) {
    var K = results[0];
    var pSha = results[1];
    var gSha = results[2];
    var salt1Sha = results[3];
    var salt2Sha = results[4];
    var M1;

    return cryptoProvider.sha256(bytes.concatBytes([
      bigints.xorBytes(pSha, gSha),
      salt1Sha,
      salt2Sha,
      aForHash,
      bForHash,
      K
    ])).then(function(hash) {
      M1 = hash;
      return tl.Api.InputCheckPasswordSRP({
        srpId: srpId,
        A: aForHash,
        M1: M1
      });
    });
  });
}

function createPasswordSrpProvider(options) {
  options = options || {};
  var provider = options.cryptoProvider || crypto.createDefaultCryptoProvider();

  return {
    computeCheck: function(passwordInfo, password) {
      return computeCheck(passwordInfo, password, provider);
    }
  };
}

module.exports = {
  computeCheck: computeCheck,
  computeHash: computeHash,
  createPasswordSrpProvider: createPasswordSrpProvider
};
