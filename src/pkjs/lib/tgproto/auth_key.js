"use strict";

var bigints = require("./bigint");
var bytes = require("./bytes");
var mtproto = require("./mtproto");
var tl = require("./tl");

var RETRIES = 20;
var ZERO_IV = new Uint8Array(32);

var PUBLIC_KEYS = [
  {
    fingerprint: "-3414540481677951611",
    n: "2937959817066933702298617714945612856538843112005886376816255642404751219133084745514657634448776440866" +
      "1701890505066208632169112269581063774293102577308490531282748465986139880977280302242772832972539403531" +
      "3160108704012876427630091361567343395380424193887227773571344877461690935390938502512438971889287359033" +
      "8945177273024525306296338410881284207988753897636046529094613963869149149606209957083647645485599631919" +
      "2747663615955633778034897140982517446405334423701359108810182097749467210509584293428076654573384828809" +
      "574217079944388301239431309115013843331317877374435868468779972014486325557807783825502498215169806323",
    e: "65537"
  },
  {
    fingerprint: "-5595554452916591101",
    n: "2534288944884041556497168959071347320689884775908477905258202659454602246385394058588521595116849196570822" +
      "26493991806038180742006204637761354248846321625124031637930839216416315647409595294193595958529411668489405859523" +
      "37613333022396096584117954892216031229237302943701877588456738335398602461675225081791820393153757504952636234951" +
      "32323782003654358104782690612092797248736680529211579223142368426126233039432475078545094258975175539015664775146" +
      "07193514399690599495696153028090507215003302390050778898553239175099482557220816446894421272976054225797071426466" +
      "60768825302832201908302295573257427896031830742328565032949",
    e: "65537"
  }
];

function getPublicKey(fingerprint) {
  var target = String(fingerprint);
  var index;
  var key;

  for (index = 0; index < PUBLIC_KEYS.length; index += 1) {
    key = PUBLIC_KEYS[index];
    if (key.fingerprint === target) {
      return {
        fingerprint: key.fingerprint,
        n: bigints.toBigInt(key.n),
        e: bigints.toBigInt(key.e)
      };
    }
  }
  return null;
}

function selectPublicKey(fingerprints) {
  var index;
  var key;

  for (index = 0; index < (fingerprints || []).length; index += 1) {
    key = getPublicKey(fingerprints[index]);
    if (key) {
      return key;
    }
  }

  throw new Error("Telegram did not offer a known RSA public key fingerprint.");
}

function padRandom(data, targetLength, randomBytes) {
  if (data.length > targetLength) {
    throw new Error("Telegram auth payload is larger than its padded envelope.");
  }
  return bytes.concatBytes([data, randomBytes(targetLength - data.length)]);
}

function reverseBytes(data) {
  var out = new Uint8Array(data);
  Array.prototype.reverse.call(out);
  return out;
}

function padTo16(data, randomBytes) {
  var extra = data.length % 16;
  if (extra === 0) {
    return data;
  }
  return bytes.concatBytes([data, randomBytes(16 - extra)]);
}

function generateKeyDataFromNonce(serverNonce, newNonce, cryptoProvider) {
  return Promise.all([
    cryptoProvider.sha1(bytes.concatBytes([newNonce, serverNonce])),
    cryptoProvider.sha1(bytes.concatBytes([serverNonce, newNonce])),
    cryptoProvider.sha1(bytes.concatBytes([newNonce, newNonce]))
  ]).then(function(results) {
    var hash1 = results[0];
    var hash2 = results[1];
    var hash3 = results[2];

    return {
      key: bytes.concatBytes([hash1, hash2.slice(0, 12)]),
      iv: bytes.concatBytes([hash2.slice(12, 20), hash3, newNonce.slice(0, 4)])
    };
  });
}

function calculateNewNonceHash(authKey, newNonce, number, cryptoProvider) {
  return Promise.resolve(cryptoProvider.sha1(authKey)).then(function(authKeyHash) {
    var numberBytes = new Uint8Array([number & 255]);
    var data = bytes.concatBytes([newNonce, numberBytes, authKeyHash.slice(0, 8)]);
    return Promise.resolve(cryptoProvider.sha1(data)).then(function(hash) {
      return hash.slice(4, 20);
    });
  });
}

function calculateServerSalt(serverNonce, newNonce) {
  return bytes.bytesLEToInt64(bigints.xorBytes(newNonce.slice(0, 8), serverNonce.slice(0, 8)), true);
}

function encryptPqInnerData(pqInnerData, publicKey, randomBytes, cryptoProvider) {
  var dataWithPadding = padRandom(pqInnerData, 192, randomBytes);
  var dataPadReversed = reverseBytes(dataWithPadding);
  var attempt = 0;

  function tryEncrypt() {
    var tempKey;
    var dataWithHash;
    var aesEncrypted;
    var tempKeyXor;
    var keyAesEncrypted;
    var keyAesEncryptedInt;
    var encryptedInt;

    if (attempt >= RETRIES) {
      throw new Error("Failed to create secure Telegram RSA auth payload.");
    }
    attempt += 1;

    tempKey = randomBytes(32);
    return Promise.resolve(cryptoProvider.sha256(bytes.concatBytes([tempKey, dataWithPadding]))).then(function(hash) {
      dataWithHash = bytes.concatBytes([dataPadReversed, hash]);
      aesEncrypted = cryptoProvider.aesIgeEncrypt(dataWithHash, tempKey, ZERO_IV);
      return Promise.resolve(cryptoProvider.sha256(aesEncrypted));
    }).then(function(encryptedHash) {
      tempKeyXor = bigints.xorBytes(tempKey, encryptedHash);
      keyAesEncrypted = bytes.concatBytes([tempKeyXor, aesEncrypted]);
      keyAesEncryptedInt = bigints.bytesToBigIntBE(keyAesEncrypted, false);
      if (keyAesEncryptedInt >= publicKey.n) {
        return tryEncrypt();
      }
      encryptedInt = bigints.modPow(keyAesEncryptedInt, publicKey.e, publicKey.n);
      return bigints.bigIntToBytesBE(encryptedInt, 256);
    });
  }

  return tryEncrypt();
}

function deserializeHashedObject(data, cryptoProvider) {
  var reader = new bytes.ByteReader(data);
  var expectedHash = reader.readRaw(20);
  var objectStart = reader.offset;
  var object = tl.readObject(reader);
  var objectBytes = data.slice(objectStart, reader.offset);

  return Promise.resolve(cryptoProvider.sha1(objectBytes)).then(function(actualHash) {
    if (!bigints.equalBytes(expectedHash, actualHash)) {
      throw new Error("Telegram DH answer hash mismatch.");
    }
    return object;
  });
}

function createAuthKey(sender, client, options) {
  options = options || {};

  var cryptoProvider = options.cryptoProvider;
  var randomBytes = options.randomBytes;
  var nonce = randomBytes(16);
  var newNonce;
  var resPQ;
  var pq;
  var factors;
  var pBytes;
  var qBytes;
  var publicKey;
  var pqInnerData;
  var dhKeyData;
  var serverDhParams;
  var serverDhInner;
  var dhPrime;
  var gA;
  var b;
  var gB;
  var gAB;
  var authKey;
  var clientDhInner;
  var encryptedClientDhInner;

  if (!cryptoProvider || typeof cryptoProvider.sha1 !== "function" ||
      typeof cryptoProvider.sha256 !== "function" ||
      typeof cryptoProvider.aesIgeEncrypt !== "function" ||
      typeof cryptoProvider.aesIgeDecrypt !== "function") {
    return Promise.reject(new Error("Native Telegram auth requires SHA1, SHA256, and AES-IGE providers."));
  }

  return sender.sendPlain(tl.Api.ReqPqMulti({
    nonce: nonce
  })).then(function(response) {
    resPQ = response;
    if (!resPQ || resPQ.tlName !== "resPQ") {
      throw new Error("Telegram auth step 1 returned " + (resPQ && resPQ.tlName ? resPQ.tlName : "unknown response") + ".");
    }
    if (!bigints.equalBytes(resPQ.nonce, nonce)) {
      throw new Error("Telegram auth step 1 nonce mismatch.");
    }

    pq = bigints.bytesToBigIntBE(resPQ.pq, false);
    factors = bigints.factorize(pq, randomBytes);
    pBytes = bigints.stripLeadingZeros(bigints.bigIntToBytesBE(factors.p));
    qBytes = bigints.stripLeadingZeros(bigints.bigIntToBytesBE(factors.q));
    newNonce = randomBytes(32);
    publicKey = selectPublicKey(resPQ.serverPublicKeyFingerprints);
    pqInnerData = tl.serializeObject(tl.Api.PQInnerData({
      pq: bigints.stripLeadingZeros(bigints.bigIntToBytesBE(pq)),
      p: pBytes,
      q: qBytes,
      nonce: resPQ.nonce,
      serverNonce: resPQ.serverNonce,
      newNonce: newNonce
    }));

    return encryptPqInnerData(pqInnerData, publicKey, randomBytes, cryptoProvider);
  }).then(function(encryptedData) {
    return sender.sendPlain(tl.Api.ReqDHParams({
      nonce: resPQ.nonce,
      serverNonce: resPQ.serverNonce,
      p: pBytes,
      q: qBytes,
      publicKeyFingerprint: publicKey.fingerprint,
      encryptedData: encryptedData
    }));
  }).then(function(response) {
    serverDhParams = response;
    if (!serverDhParams || (serverDhParams.tlName !== "server_DH_params_ok" &&
        serverDhParams.tlName !== "server_DH_params_fail")) {
      throw new Error("Telegram auth step 2 returned " + (serverDhParams && serverDhParams.tlName ? serverDhParams.tlName : "unknown response") + ".");
    }
    if (!bigints.equalBytes(serverDhParams.nonce, resPQ.nonce) ||
        !bigints.equalBytes(serverDhParams.serverNonce, resPQ.serverNonce)) {
      throw new Error("Telegram auth step 2 nonce mismatch.");
    }
    if (serverDhParams.tlName === "server_DH_params_fail") {
      throw new Error("Telegram server rejected DH params.");
    }

    return generateKeyDataFromNonce(resPQ.serverNonce, newNonce, cryptoProvider);
  }).then(function(keyData) {
    dhKeyData = keyData;
    return cryptoProvider.aesIgeDecrypt(serverDhParams.encryptedAnswer, dhKeyData.key, dhKeyData.iv);
  }).then(function(plainAnswer) {
    return deserializeHashedObject(plainAnswer, cryptoProvider);
  }).then(function(inner) {
    serverDhInner = inner;
    if (!serverDhInner || serverDhInner.tlName !== "server_DH_inner_data") {
      throw new Error("Telegram auth step 3 returned " + (serverDhInner && serverDhInner.tlName ? serverDhInner.tlName : "unknown response") + ".");
    }
    if (!bigints.equalBytes(serverDhInner.nonce, resPQ.nonce) ||
        !bigints.equalBytes(serverDhInner.serverNonce, resPQ.serverNonce)) {
      throw new Error("Telegram auth step 3 nonce mismatch.");
    }

    dhPrime = bigints.bytesToBigIntBE(serverDhInner.dhPrime, false);
    gA = bigints.bytesToBigIntBE(serverDhInner.gA, false);
    if (gA <= BigInt(1) || gA >= dhPrime - BigInt(1)) {
      throw new Error("Telegram auth step 3 received an invalid DH value.");
    }

    b = bigints.bytesToBigIntBE(randomBytes(256), false);
    gB = bigints.modPow(bigints.toBigInt(serverDhInner.g), b, dhPrime);
    gAB = bigints.modPow(gA, b, dhPrime);
    authKey = bigints.leftPad(bigints.bigIntToBytesBE(gAB), 256);
    clientDhInner = tl.serializeObject(tl.Api.ClientDHInnerData({
      nonce: resPQ.nonce,
      serverNonce: resPQ.serverNonce,
      retryId: "0",
      gB: bigints.stripLeadingZeros(bigints.bigIntToBytesBE(gB))
    }));

    return Promise.resolve(cryptoProvider.sha1(clientDhInner));
  }).then(function(hash) {
    encryptedClientDhInner = cryptoProvider.aesIgeEncrypt(
      padTo16(bytes.concatBytes([hash, clientDhInner]), randomBytes),
      dhKeyData.key,
      dhKeyData.iv
    );
    return sender.sendPlain(tl.Api.SetClientDHParams({
      nonce: resPQ.nonce,
      serverNonce: resPQ.serverNonce,
      encryptedData: encryptedClientDhInner
    }));
  }).then(function(dhGen) {
    var nonceNumber;
    var expectedHash;
    var actualHash;

    if (!dhGen || (dhGen.tlName !== "dh_gen_ok" && dhGen.tlName !== "dh_gen_retry" &&
        dhGen.tlName !== "dh_gen_fail")) {
      throw new Error("Telegram auth step 4 returned " + (dhGen && dhGen.tlName ? dhGen.tlName : "unknown response") + ".");
    }
    if (!bigints.equalBytes(dhGen.nonce, resPQ.nonce) ||
        !bigints.equalBytes(dhGen.serverNonce, resPQ.serverNonce)) {
      throw new Error("Telegram auth step 4 nonce mismatch.");
    }

    nonceNumber = dhGen.tlName === "dh_gen_ok" ? 1 : (dhGen.tlName === "dh_gen_retry" ? 2 : 3);
    actualHash = nonceNumber === 1 ? dhGen.newNonceHash1 :
      (nonceNumber === 2 ? dhGen.newNonceHash2 : dhGen.newNonceHash3);
    return calculateNewNonceHash(authKey, newNonce, nonceNumber, cryptoProvider).then(function(hash) {
      expectedHash = hash;
      if (!bigints.equalBytes(actualHash, expectedHash)) {
        throw new Error("Telegram auth step 4 nonce hash mismatch.");
      }
      if (dhGen.tlName !== "dh_gen_ok") {
        throw new Error("Telegram auth step 4 requested DH retry/fail.");
      }

      return mtproto.makeAuthKeyId(authKey, cryptoProvider).then(function(authKeyId) {
        var serverTime = Number(serverDhInner.serverTime || Math.floor(Date.now() / 1000));
        var timeOffset = serverTime - Math.floor(Date.now() / 1000);

        return {
          authKey: authKey,
          authKeyId: authKeyId,
          serverSalt: calculateServerSalt(resPQ.serverNonce, newNonce),
          timeOffset: timeOffset,
          dcId: client && client.dc ? client.dc.dcId : null
        };
      });
    });
  });
}

module.exports = {
  PUBLIC_KEYS: PUBLIC_KEYS,
  calculateNewNonceHash: calculateNewNonceHash,
  calculateServerSalt: calculateServerSalt,
  createAuthKey: createAuthKey,
  encryptPqInnerData: encryptPqInnerData,
  generateKeyDataFromNonce: generateKeyDataFromNonce,
  selectPublicKey: selectPublicKey
};
