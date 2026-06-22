"use strict";

var bytes = require("./bytes");

function requireBigInt() {
  if (typeof BigInt !== "function") {
    throw new Error("Native Telegram MTProto requires BigInt support in PKJS.");
  }
}

function toBigInt(value) {
  requireBigInt();
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  return BigInt(String(value == null ? "0" : value));
}

function mod(value, modulus) {
  var result = toBigInt(value) % toBigInt(modulus);
  return result < BigInt(0) ? result + toBigInt(modulus) : result;
}

function abs(value) {
  value = toBigInt(value);
  return value < BigInt(0) ? -value : value;
}

function gcd(left, right) {
  left = abs(left);
  right = abs(right);
  while (right !== BigInt(0)) {
    var next = left % right;
    left = right;
    right = next;
  }
  return left;
}

function modPow(base, exponent, modulus) {
  var result = BigInt(1);
  var power = mod(base, modulus);
  var exp = toBigInt(exponent);
  var modValue = toBigInt(modulus);

  requireBigInt();
  while (exp > BigInt(0)) {
    if ((exp & BigInt(1)) === BigInt(1)) {
      result = (result * power) % modValue;
    }
    exp >>= BigInt(1);
    power = (power * power) % modValue;
  }

  return result;
}

function bytesToBigIntBE(value, signed) {
  var out = BigInt(0);
  var index;
  var data = value instanceof Uint8Array ? value : new Uint8Array(value || []);

  requireBigInt();
  for (index = 0; index < data.length; index += 1) {
    out = (out << BigInt(8)) + BigInt(data[index]);
  }

  if (signed === true && data.length > 0 && (data[0] & 0x80) !== 0) {
    out -= BigInt(1) << BigInt(data.length * 8);
  }

  return out;
}

function bytesToBigIntLE(value, signed) {
  var out = BigInt(0);
  var index;
  var data = value instanceof Uint8Array ? value : new Uint8Array(value || []);

  requireBigInt();
  for (index = data.length - 1; index >= 0; index -= 1) {
    out = (out << BigInt(8)) + BigInt(data[index]);
  }

  if (signed === true && data.length > 0 && (data[data.length - 1] & 0x80) !== 0) {
    out -= BigInt(1) << BigInt(data.length * 8);
  }

  return out;
}

function bigIntToBytesBE(value, length) {
  var big = toBigInt(value);
  var dynamic = [];
  var out;
  var index;

  if (big < BigInt(0)) {
    if (!length) {
      throw new Error("Cannot encode negative BigInt without a fixed byte length.");
    }
    big = (BigInt(1) << BigInt(length * 8)) + big;
  }

  if (length != null) {
    out = new Uint8Array(length);
    for (index = length - 1; index >= 0; index -= 1) {
      out[index] = Number(big & BigInt(255));
      big >>= BigInt(8);
    }
    return out;
  }

  if (big === BigInt(0)) {
    return new Uint8Array([0]);
  }

  while (big > BigInt(0)) {
    dynamic.unshift(Number(big & BigInt(255)));
    big >>= BigInt(8);
  }
  return new Uint8Array(dynamic);
}

function bigIntToBytesLE(value, length) {
  var be = bigIntToBytesBE(value, length);
  var out = new Uint8Array(be.length);
  var index;

  for (index = 0; index < be.length; index += 1) {
    out[index] = be[be.length - 1 - index];
  }
  return out;
}

function stripLeadingZeros(value) {
  var data = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  var offset = 0;

  while (offset < data.length - 1 && data[offset] === 0) {
    offset += 1;
  }
  return data.slice(offset);
}

function leftPad(value, length) {
  var data = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  var out;

  if (data.length > length) {
    return data.slice(data.length - length);
  }

  out = new Uint8Array(length);
  out.set(data, length - data.length);
  return out;
}

function xorBytes(left, right) {
  var length = Math.min(left.length, right.length);
  var out = new Uint8Array(length);
  var index;

  for (index = 0; index < length; index += 1) {
    out[index] = left[index] ^ right[index];
  }
  return out;
}

function randomBigIntBelow(limit, randomBytes) {
  var byteLength;
  var value;

  limit = toBigInt(limit);
  byteLength = bigIntToBytesBE(limit).length;
  do {
    value = bytesToBigIntBE(randomBytes(byteLength), false);
  } while (value <= BigInt(1) || value >= limit);
  return value;
}

function factorize(pq, randomBytes) {
  var n = toBigInt(pq);
  var cSeed = BigInt(1);
  var x;
  var y;
  var c;
  var d;
  var attempts = 0;

  if (n % BigInt(2) === BigInt(0)) {
    return { p: BigInt(2), q: n / BigInt(2) };
  }

  while (attempts < 32) {
    attempts += 1;
    c = cSeed;
    cSeed += BigInt(1);
    x = randomBytes ? randomBigIntBelow(n - BigInt(2), randomBytes) + BigInt(2) : BigInt(2 + attempts);
    y = x;
    d = BigInt(1);

    while (d === BigInt(1)) {
      x = (modPow(x, BigInt(2), n) + c) % n;
      y = (modPow(y, BigInt(2), n) + c) % n;
      y = (modPow(y, BigInt(2), n) + c) % n;
      d = gcd(abs(x - y), n);
    }

    if (d > BigInt(1) && d < n) {
      return d < n / d ? { p: d, q: n / d } : { p: n / d, q: d };
    }
  }

  throw new Error("Failed to factor Telegram pq value.");
}

function equalBytes(left, right) {
  var index;
  var diff = 0;

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  for (index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

module.exports = {
  abs: abs,
  bigIntToBytesBE: bigIntToBytesBE,
  bigIntToBytesLE: bigIntToBytesLE,
  bytesToBigIntBE: bytesToBigIntBE,
  bytesToBigIntLE: bytesToBigIntLE,
  equalBytes: equalBytes,
  factorize: factorize,
  gcd: gcd,
  leftPad: leftPad,
  mod: mod,
  modPow: modPow,
  requireBigInt: requireBigInt,
  stripLeadingZeros: stripLeadingZeros,
  toBigInt: toBigInt,
  xorBytes: xorBytes
};
