"use strict";

var bytes = require("./bytes");
var secureRandom = require("./secure_random");

function toBytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value || []);
}

function rotl32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function rotr32(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function writeUInt32BE(out, offset, value) {
  out[offset] = (value >>> 24) & 255;
  out[offset + 1] = (value >>> 16) & 255;
  out[offset + 2] = (value >>> 8) & 255;
  out[offset + 3] = value & 255;
}

function readUInt32BE(data, offset) {
  return (((data[offset] << 24) | (data[offset + 1] << 16) |
    (data[offset + 2] << 8) | data[offset + 3]) >>> 0);
}

function sha1(data) {
  data = toBytes(data);

  var bitLength = data.length * 8;
  var paddedLength = data.length + 1;
  var message;
  var h0 = 0x67452301;
  var h1 = 0xefcdab89;
  var h2 = 0x98badcfe;
  var h3 = 0x10325476;
  var h4 = 0xc3d2e1f0;
  var w = new Uint32Array(80);
  var offset;
  var index;
  var a;
  var b;
  var c;
  var d;
  var e;
  var f;
  var k;
  var temp;

  while ((paddedLength % 64) !== 56) {
    paddedLength += 1;
  }

  message = new Uint8Array(paddedLength + 8);
  message.set(data);
  message[data.length] = 0x80;
  writeUInt32BE(message, paddedLength, Math.floor(bitLength / 4294967296));
  writeUInt32BE(message, paddedLength + 4, bitLength >>> 0);

  for (offset = 0; offset < message.length; offset += 64) {
    for (index = 0; index < 16; index += 1) {
      w[index] = readUInt32BE(message, offset + index * 4);
    }
    for (index = 16; index < 80; index += 1) {
      w[index] = rotl32(w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16], 1);
    }

    a = h0;
    b = h1;
    c = h2;
    d = h3;
    e = h4;

    for (index = 0; index < 80; index += 1) {
      if (index < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      temp = (rotl32(a, 5) + f + e + k + w[index]) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  var out = new Uint8Array(20);
  writeUInt32BE(out, 0, h0);
  writeUInt32BE(out, 4, h1);
  writeUInt32BE(out, 8, h2);
  writeUInt32BE(out, 12, h3);
  writeUInt32BE(out, 16, h4);
  return out;
}

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(data) {
  data = toBytes(data);

  var bitLength = data.length * 8;
  var paddedLength = data.length + 1;
  var message;
  var h0 = 0x6a09e667;
  var h1 = 0xbb67ae85;
  var h2 = 0x3c6ef372;
  var h3 = 0xa54ff53a;
  var h4 = 0x510e527f;
  var h5 = 0x9b05688c;
  var h6 = 0x1f83d9ab;
  var h7 = 0x5be0cd19;
  var w = new Uint32Array(64);
  var offset;
  var index;
  var a;
  var b;
  var c;
  var d;
  var e;
  var f;
  var g;
  var h;
  var s0;
  var s1;
  var ch;
  var maj;
  var temp1;
  var temp2;

  while ((paddedLength % 64) !== 56) {
    paddedLength += 1;
  }

  message = new Uint8Array(paddedLength + 8);
  message.set(data);
  message[data.length] = 0x80;
  writeUInt32BE(message, paddedLength, Math.floor(bitLength / 4294967296));
  writeUInt32BE(message, paddedLength + 4, bitLength >>> 0);

  for (offset = 0; offset < message.length; offset += 64) {
    for (index = 0; index < 16; index += 1) {
      w[index] = readUInt32BE(message, offset + index * 4);
    }
    for (index = 16; index < 64; index += 1) {
      s0 = rotr32(w[index - 15], 7) ^ rotr32(w[index - 15], 18) ^ (w[index - 15] >>> 3);
      s1 = rotr32(w[index - 2], 17) ^ rotr32(w[index - 2], 19) ^ (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }

    a = h0;
    b = h1;
    c = h2;
    d = h3;
    e = h4;
    f = h5;
    g = h6;
    h = h7;

    for (index = 0; index < 64; index += 1) {
      s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      ch = (e & f) ^ ((~e) & g);
      temp1 = (h + s1 + ch + SHA256_K[index] + w[index]) >>> 0;
      s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      maj = (a & b) ^ (a & c) ^ (b & c);
      temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  var out = new Uint8Array(32);
  writeUInt32BE(out, 0, h0);
  writeUInt32BE(out, 4, h1);
  writeUInt32BE(out, 8, h2);
  writeUInt32BE(out, 12, h3);
  writeUInt32BE(out, 16, h4);
  writeUInt32BE(out, 20, h5);
  writeUInt32BE(out, 24, h6);
  writeUInt32BE(out, 28, h7);
  return out;
}

var MASK_64 = null;
var SHA512_H = null;
var SHA512_K = null;

function initSha512Constants() {
  if (SHA512_K) {
    return;
  }

  MASK_64 = BigInt("0xffffffffffffffff");
  SHA512_H = [
    "0x6a09e667f3bcc908", "0xbb67ae8584caa73b",
    "0x3c6ef372fe94f82b", "0xa54ff53a5f1d36f1",
    "0x510e527fade682d1", "0x9b05688c2b3e6c1f",
    "0x1f83d9abfb41bd6b", "0x5be0cd19137e2179"
  ].map(function(value) { return BigInt(value); });
  SHA512_K = [
    "0x428a2f98d728ae22", "0x7137449123ef65cd", "0xb5c0fbcfec4d3b2f", "0xe9b5dba58189dbbc",
    "0x3956c25bf348b538", "0x59f111f1b605d019", "0x923f82a4af194f9b", "0xab1c5ed5da6d8118",
    "0xd807aa98a3030242", "0x12835b0145706fbe", "0x243185be4ee4b28c", "0x550c7dc3d5ffb4e2",
    "0x72be5d74f27b896f", "0x80deb1fe3b1696b1", "0x9bdc06a725c71235", "0xc19bf174cf692694",
    "0xe49b69c19ef14ad2", "0xefbe4786384f25e3", "0x0fc19dc68b8cd5b5", "0x240ca1cc77ac9c65",
    "0x2de92c6f592b0275", "0x4a7484aa6ea6e483", "0x5cb0a9dcbd41fbd4", "0x76f988da831153b5",
    "0x983e5152ee66dfab", "0xa831c66d2db43210", "0xb00327c898fb213f", "0xbf597fc7beef0ee4",
    "0xc6e00bf33da88fc2", "0xd5a79147930aa725", "0x06ca6351e003826f", "0x142929670a0e6e70",
    "0x27b70a8546d22ffc", "0x2e1b21385c26c926", "0x4d2c6dfc5ac42aed", "0x53380d139d95b3df",
    "0x650a73548baf63de", "0x766a0abb3c77b2a8", "0x81c2c92e47edaee6", "0x92722c851482353b",
    "0xa2bfe8a14cf10364", "0xa81a664bbc423001", "0xc24b8b70d0f89791", "0xc76c51a30654be30",
    "0xd192e819d6ef5218", "0xd69906245565a910", "0xf40e35855771202a", "0x106aa07032bbd1b8",
    "0x19a4c116b8d2d0c8", "0x1e376c085141ab53", "0x2748774cdf8eeb99", "0x34b0bcb5e19b48a8",
    "0x391c0cb3c5c95a63", "0x4ed8aa4ae3418acb", "0x5b9cca4f7763e373", "0x682e6ff3d6b2b8a3",
    "0x748f82ee5defb2fc", "0x78a5636f43172f60", "0x84c87814a1f0ab72", "0x8cc702081a6439ec",
    "0x90befffa23631e28", "0xa4506cebde82bde9", "0xbef9a3f7b2c67915", "0xc67178f2e372532b",
    "0xca273eceea26619c", "0xd186b8c721c0c207", "0xeada7dd6cde0eb1e", "0xf57d4f7fee6ed178",
    "0x06f067aa72176fba", "0x0a637dc5a2c898a6", "0x113f9804bef90dae", "0x1b710b35131c471b",
    "0x28db77f523047d84", "0x32caab7b40c72493", "0x3c9ebe0a15c9bebc", "0x431d67c49c100d4c",
    "0x4cc5d4becb3e42b6", "0x597f299cfc657e2a", "0x5fcb6fab3ad6faec", "0x6c44198c4a475817"
  ].map(function(value) { return BigInt(value); });
}

function rotr64(value, bits) {
  bits = BigInt(bits);
  return ((value >> bits) | (value << (BigInt(64) - bits))) & MASK_64;
}

function shr64(value, bits) {
  return value >> BigInt(bits);
}

function readUInt64BE(data, offset) {
  var out = BigInt(0);
  var index;

  for (index = 0; index < 8; index += 1) {
    out = (out << BigInt(8)) + BigInt(data[offset + index]);
  }
  return out;
}

function writeUInt64BE(out, offset, value) {
  var index;

  value &= MASK_64;
  for (index = 7; index >= 0; index -= 1) {
    out[offset + index] = Number(value & BigInt(255));
    value >>= BigInt(8);
  }
}

function sha512(data) {
  if (typeof BigInt !== "function") {
    throw new Error("SHA512 requires BigInt support in PKJS.");
  }

  data = toBytes(data);
  initSha512Constants();

  var bitLength = BigInt(data.length) * BigInt(8);
  var paddedLength = data.length + 1;
  var message;
  var h = SHA512_H.slice();
  var w = new Array(80);
  var offset;
  var index;
  var a;
  var b;
  var c;
  var d;
  var e;
  var f;
  var g;
  var hh;
  var s0;
  var s1;
  var ch;
  var maj;
  var temp1;
  var temp2;
  var out;

  while ((paddedLength % 128) !== 112) {
    paddedLength += 1;
  }

  message = new Uint8Array(paddedLength + 16);
  message.set(data);
  message[data.length] = 0x80;
  writeUInt64BE(message, paddedLength, BigInt(0));
  writeUInt64BE(message, paddedLength + 8, bitLength);

  for (offset = 0; offset < message.length; offset += 128) {
    for (index = 0; index < 16; index += 1) {
      w[index] = readUInt64BE(message, offset + index * 8);
    }
    for (index = 16; index < 80; index += 1) {
      s0 = rotr64(w[index - 15], 1) ^ rotr64(w[index - 15], 8) ^ shr64(w[index - 15], 7);
      s1 = rotr64(w[index - 2], 19) ^ rotr64(w[index - 2], 61) ^ shr64(w[index - 2], 6);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) & MASK_64;
    }

    a = h[0];
    b = h[1];
    c = h[2];
    d = h[3];
    e = h[4];
    f = h[5];
    g = h[6];
    hh = h[7];

    for (index = 0; index < 80; index += 1) {
      s1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41);
      ch = (e & f) ^ ((~e) & g);
      temp1 = (hh + s1 + ch + SHA512_K[index] + w[index]) & MASK_64;
      s0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39);
      maj = (a & b) ^ (a & c) ^ (b & c);
      temp2 = (s0 + maj) & MASK_64;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) & MASK_64;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) & MASK_64;
    }

    h[0] = (h[0] + a) & MASK_64;
    h[1] = (h[1] + b) & MASK_64;
    h[2] = (h[2] + c) & MASK_64;
    h[3] = (h[3] + d) & MASK_64;
    h[4] = (h[4] + e) & MASK_64;
    h[5] = (h[5] + f) & MASK_64;
    h[6] = (h[6] + g) & MASK_64;
    h[7] = (h[7] + hh) & MASK_64;
  }

  out = new Uint8Array(64);
  for (index = 0; index < 8; index += 1) {
    writeUInt64BE(out, index * 8, h[index]);
  }
  return out;
}

function hmac(hashFn, blockSize, key, data) {
  key = toBytes(key);
  data = toBytes(data);

  var block = new Uint8Array(blockSize);
  var outer = new Uint8Array(blockSize);
  var inner = new Uint8Array(blockSize);
  var index;

  if (key.length > blockSize) {
    key = hashFn(key);
  }
  block.set(key);
  for (index = 0; index < blockSize; index += 1) {
    inner[index] = block[index] ^ 0x36;
    outer[index] = block[index] ^ 0x5c;
  }

  return hashFn(bytes.concatBytes([outer, hashFn(bytes.concatBytes([inner, data]))]));
}

function hmacSha512(key, data) {
  return hmac(sha512, 128, key, data);
}

function pbkdf2HmacSha512(password, salt, iterations, length) {
  password = toBytes(password);
  salt = toBytes(salt);
  iterations = Number(iterations || 1);
  length = Number(length || 64);

  var hashLength = 64;
  var blockCount = Math.ceil(length / hashLength);
  var out = new Uint8Array(blockCount * hashLength);
  var blockIndex;
  var u;
  var t;
  var counter;
  var index;
  var offset = 0;
  var round;

  for (blockIndex = 1; blockIndex <= blockCount; blockIndex += 1) {
    counter = new Uint8Array(4);
    writeUInt32BE(counter, 0, blockIndex);
    u = hmacSha512(password, bytes.concatBytes([salt, counter]));
    t = new Uint8Array(u);
    for (round = 1; round < iterations; round += 1) {
      u = hmacSha512(password, u);
      for (index = 0; index < hashLength; index += 1) {
        t[index] ^= u[index];
      }
    }
    out.set(t, offset);
    offset += hashLength;
  }

  return out.slice(0, length);
}

function gfMul(a, b) {
  var out = 0;
  var index;

  for (index = 0; index < 8; index += 1) {
    if (b & 1) {
      out ^= a;
    }
    a = (a & 0x80) ? ((a << 1) ^ 0x11b) : (a << 1);
    a &= 255;
    b >>= 1;
  }
  return out;
}

function gfPow(a, power) {
  var out = 1;
  var base = a;

  while (power > 0) {
    if (power & 1) {
      out = gfMul(out, base);
    }
    base = gfMul(base, base);
    power >>= 1;
  }
  return out;
}

function rotl8(value, bits) {
  return ((value << bits) | (value >>> (8 - bits))) & 255;
}

var AES_TABLES = null;

function getAesTables() {
  var sbox = new Uint8Array(256);
  var invSbox = new Uint8Array(256);
  var rcon = new Uint8Array(15);
  var index;
  var inv;
  var value;

  if (AES_TABLES) {
    return AES_TABLES;
  }

  for (index = 0; index < 256; index += 1) {
    inv = index === 0 ? 0 : gfPow(index, 254);
    value = inv ^ rotl8(inv, 1) ^ rotl8(inv, 2) ^ rotl8(inv, 3) ^ rotl8(inv, 4) ^ 0x63;
    sbox[index] = value & 255;
    invSbox[value & 255] = index;
  }
  rcon[1] = 1;
  for (index = 2; index < rcon.length; index += 1) {
    rcon[index] = gfMul(rcon[index - 1], 2);
  }

  AES_TABLES = {
    sbox: sbox,
    invSbox: invSbox,
    rcon: rcon
  };
  return AES_TABLES;
}

function expandAes256Key(key) {
  key = toBytes(key);
  if (key.length !== 32) {
    throw new Error("AES-256 requires a 32-byte key.");
  }

  var tables = getAesTables();
  var expanded = new Uint8Array(240);
  var temp = new Uint8Array(4);
  var generated = 32;
  var rconIndex = 1;
  var index;
  var swap;

  expanded.set(key);
  while (generated < expanded.length) {
    temp.set(expanded.slice(generated - 4, generated));

    if (generated % 32 === 0) {
      swap = temp[0];
      temp[0] = temp[1];
      temp[1] = temp[2];
      temp[2] = temp[3];
      temp[3] = swap;
      for (index = 0; index < 4; index += 1) {
        temp[index] = tables.sbox[temp[index]];
      }
      temp[0] ^= tables.rcon[rconIndex];
      rconIndex += 1;
    } else if (generated % 32 === 16) {
      for (index = 0; index < 4; index += 1) {
        temp[index] = tables.sbox[temp[index]];
      }
    }

    for (index = 0; index < 4; index += 1) {
      expanded[generated] = expanded[generated - 32] ^ temp[index];
      generated += 1;
    }
  }

  return expanded;
}

function addRoundKey(state, expanded, round) {
  var offset = round * 16;
  var index;
  for (index = 0; index < 16; index += 1) {
    state[index] ^= expanded[offset + index];
  }
}

function subBytes(state, sbox) {
  var index;
  for (index = 0; index < 16; index += 1) {
    state[index] = sbox[state[index]];
  }
}

function shiftRows(state) {
  var copy = new Uint8Array(state);
  var row;
  var col;

  for (row = 1; row < 4; row += 1) {
    for (col = 0; col < 4; col += 1) {
      state[col * 4 + row] = copy[((col + row) % 4) * 4 + row];
    }
  }
}

function invShiftRows(state) {
  var copy = new Uint8Array(state);
  var row;
  var col;

  for (row = 1; row < 4; row += 1) {
    for (col = 0; col < 4; col += 1) {
      state[col * 4 + row] = copy[((col - row + 4) % 4) * 4 + row];
    }
  }
}

function mixColumns(state) {
  var col;
  var offset;
  var a0;
  var a1;
  var a2;
  var a3;

  for (col = 0; col < 4; col += 1) {
    offset = col * 4;
    a0 = state[offset];
    a1 = state[offset + 1];
    a2 = state[offset + 2];
    a3 = state[offset + 3];
    state[offset] = gfMul(a0, 2) ^ gfMul(a1, 3) ^ a2 ^ a3;
    state[offset + 1] = a0 ^ gfMul(a1, 2) ^ gfMul(a2, 3) ^ a3;
    state[offset + 2] = a0 ^ a1 ^ gfMul(a2, 2) ^ gfMul(a3, 3);
    state[offset + 3] = gfMul(a0, 3) ^ a1 ^ a2 ^ gfMul(a3, 2);
  }
}

function invMixColumns(state) {
  var col;
  var offset;
  var a0;
  var a1;
  var a2;
  var a3;

  for (col = 0; col < 4; col += 1) {
    offset = col * 4;
    a0 = state[offset];
    a1 = state[offset + 1];
    a2 = state[offset + 2];
    a3 = state[offset + 3];
    state[offset] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
    state[offset + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
    state[offset + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
    state[offset + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
  }
}

function aes256EncryptBlock(block, expanded) {
  var tables = getAesTables();
  var state = new Uint8Array(toBytes(block));
  var round;

  if (state.length !== 16) {
    throw new Error("AES block size must be 16 bytes.");
  }

  addRoundKey(state, expanded, 0);
  for (round = 1; round < 14; round += 1) {
    subBytes(state, tables.sbox);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, expanded, round);
  }
  subBytes(state, tables.sbox);
  shiftRows(state);
  addRoundKey(state, expanded, 14);
  return state;
}

function aes256DecryptBlock(block, expanded) {
  var tables = getAesTables();
  var state = new Uint8Array(toBytes(block));
  var round;

  if (state.length !== 16) {
    throw new Error("AES block size must be 16 bytes.");
  }

  addRoundKey(state, expanded, 14);
  for (round = 13; round > 0; round -= 1) {
    invShiftRows(state);
    subBytes(state, tables.invSbox);
    addRoundKey(state, expanded, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  subBytes(state, tables.invSbox);
  addRoundKey(state, expanded, 0);
  return state;
}

function incrementCounter(counter) {
  var index;
  for (index = counter.length - 1; index >= 0; index -= 1) {
    counter[index] = (counter[index] + 1) & 255;
    if (counter[index] !== 0) {
      break;
    }
  }
}

function AesCtr(key, iv) {
  this.expanded = expandAes256Key(key);
  this.counter = new Uint8Array(toBytes(iv));
  this.keystream = new Uint8Array(16);
  this.offset = 16;

  if (this.counter.length !== 16) {
    throw new Error("AES-CTR requires a 16-byte IV.");
  }
}

AesCtr.prototype.encrypt = function(data) {
  data = toBytes(data);

  var out = new Uint8Array(data.length);
  var index;

  for (index = 0; index < data.length; index += 1) {
    if (this.offset >= 16) {
      this.keystream = aes256EncryptBlock(this.counter, this.expanded);
      incrementCounter(this.counter);
      this.offset = 0;
    }
    out[index] = data[index] ^ this.keystream[this.offset];
    this.offset += 1;
  }
  return out;
};

function aesIgeCrypt(data, key, iv, decrypt) {
  data = toBytes(data);
  iv = toBytes(iv);

  if (data.length % 16 !== 0) {
    throw new Error("AES-IGE input length must be a multiple of 16 bytes.");
  }
  if (iv.length !== 32) {
    throw new Error("AES-IGE requires a 32-byte IV.");
  }

  var expanded = expandAes256Key(key);
  var out = new Uint8Array(data.length);
  var prevCipher = iv.slice(0, 16);
  var prevPlain = iv.slice(16, 32);
  var block;
  var work;
  var crypted;
  var index;
  var byteIndex;

  for (index = 0; index < data.length; index += 16) {
    block = data.slice(index, index + 16);
    work = new Uint8Array(16);

    if (decrypt === true) {
      for (byteIndex = 0; byteIndex < 16; byteIndex += 1) {
        work[byteIndex] = block[byteIndex] ^ prevPlain[byteIndex];
      }
      crypted = aes256DecryptBlock(work, expanded);
      for (byteIndex = 0; byteIndex < 16; byteIndex += 1) {
        out[index + byteIndex] = crypted[byteIndex] ^ prevCipher[byteIndex];
      }
      prevPlain = out.slice(index, index + 16);
      prevCipher = block;
    } else {
      for (byteIndex = 0; byteIndex < 16; byteIndex += 1) {
        work[byteIndex] = block[byteIndex] ^ prevCipher[byteIndex];
      }
      crypted = aes256EncryptBlock(work, expanded);
      for (byteIndex = 0; byteIndex < 16; byteIndex += 1) {
        out[index + byteIndex] = crypted[byteIndex] ^ prevPlain[byteIndex];
      }
      prevPlain = block;
      prevCipher = out.slice(index, index + 16);
    }
  }

  return out;
}

function aesIgeEncrypt(data, key, iv) {
  return aesIgeCrypt(data, key, iv, false);
}

function aesIgeDecrypt(data, key, iv) {
  return aesIgeCrypt(data, key, iv, true);
}

var defaultRandomBytes = secureRandom.defaultRandomBytes;

function createAesCtr(key, iv) {
  return new AesCtr(key, iv);
}

function createDefaultCryptoProvider(options) {
  options = options || {};
  return {
    randomBytes: options.randomBytes || defaultRandomBytes,
    sha1: sha1,
    sha256: sha256,
    sha512: sha512,
    hmacSha512: hmacSha512,
    pbkdf2HmacSha512: pbkdf2HmacSha512,
    createAesCtr: createAesCtr,
    aesIgeEncrypt: aesIgeEncrypt,
    aesIgeDecrypt: aesIgeDecrypt
  };
}

module.exports = {
  AesCtr: AesCtr,
  aes256DecryptBlock: aes256DecryptBlock,
  aes256EncryptBlock: aes256EncryptBlock,
  aesIgeDecrypt: aesIgeDecrypt,
  aesIgeEncrypt: aesIgeEncrypt,
  createAesCtr: createAesCtr,
  createDefaultCryptoProvider: createDefaultCryptoProvider,
  defaultRandomBytes: defaultRandomBytes,
  hmacSha512: hmacSha512,
  pbkdf2HmacSha512: pbkdf2HmacSha512,
  sha1: sha1,
  sha256: sha256,
  sha512: sha512
};
