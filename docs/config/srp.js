"use strict";

const SIZE_FOR_HASH = 256;

function concatBytes(parts) {
  let total = 0;
  let offset = 0;

  for (const part of parts) {
    total += part.length;
  }

  const out = new Uint8Array(total);
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8Encode(value) {
  return new TextEncoder().encode(String(value ?? ""));
}

function base64Decode(value) {
  const raw = atob(String(value || ""));
  const out = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    out[index] = raw.charCodeAt(index);
  }
  return out;
}

function base64Encode(value) {
  let binary = "";
  const data = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  const chunkSize = 0x8000;

  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function bytesToBigIntBE(value) {
  let out = 0n;

  for (const byte of value) {
    out = (out << 8n) + BigInt(byte);
  }
  return out;
}

function bigIntToBytesBE(value, length) {
  let next = BigInt(value);
  const out = new Uint8Array(length);

  for (let index = length - 1; index >= 0; index -= 1) {
    out[index] = Number(next & 255n);
    next >>= 8n;
  }
  return out;
}

function leftPad(value, length) {
  const data = value instanceof Uint8Array ? value : new Uint8Array(value || []);

  if (data.length > length) {
    return data.slice(data.length - length);
  }

  const out = new Uint8Array(length);
  out.set(data, length - data.length);
  return out;
}

function xorBytes(left, right) {
  const length = Math.min(left.length, right.length);
  const out = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    out[index] = left[index] ^ right[index];
  }
  return out;
}

function mod(value, modulus) {
  const result = BigInt(value) % BigInt(modulus);
  return result < 0n ? result + BigInt(modulus) : result;
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  let power = mod(base, modulus);
  let exp = BigInt(exponent);
  const modValue = BigInt(modulus);

  while (exp > 0n) {
    if ((exp & 1n) === 1n) {
      result = (result * power) % modValue;
    }
    exp >>= 1n;
    power = (power * power) % modValue;
  }
  return result;
}

function bitLength(value) {
  const next = BigInt(value);
  return next === 0n ? 0 : next.toString(2).length;
}

function isGoodLarge(number, p) {
  const nextNumber = BigInt(number);
  const nextP = BigInt(p);
  return nextNumber > 0n && nextP - nextNumber > 0n;
}

function isGoodModExpFirst(value, prime) {
  const nextValue = BigInt(value);
  const nextPrime = BigInt(prime);
  const diff = nextPrime - nextValue;
  const minDiffBitsCount = 2048 - 64;
  const maxModExpSize = 256;
  const valueBits = bitLength(nextValue);

  return !(diff < 0n ||
    bitLength(diff) < minDiffBitsCount ||
    valueBits < minDiffBitsCount ||
    Math.floor((valueBits + 7) / 8) > maxModExpSize);
}

function requireBrowserCrypto() {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("This config page needs browser WebCrypto for Telegram 2FA.");
  }
  if (typeof BigInt !== "function") {
    throw new Error("This config page needs BigInt for Telegram 2FA.");
  }
  return cryptoApi;
}

async function sha256(data) {
  const digest = await requireBrowserCrypto().subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

async function pbkdf2HmacSha512(password, salt, iterations, length) {
  const cryptoApi = requireBrowserCrypto();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    password,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await cryptoApi.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-512",
    salt,
    iterations,
  }, key, length * 8);

  return new Uint8Array(bits);
}

async function computeHash(algo, password) {
  const hash1 = await sha256(concatBytes([algo.salt1, utf8Encode(password), algo.salt1]));
  const hash2 = await sha256(concatBytes([algo.salt2, hash1, algo.salt2]));
  const hash3 = await pbkdf2HmacSha512(hash2, algo.salt1, 100000, 64);
  return sha256(concatBytes([algo.salt2, hash3, algo.salt2]));
}

async function generateRandomA(g, p, bForHash) {
  const cryptoApi = requireBrowserCrypto();

  while (true) {
    const random = new Uint8Array(256);
    cryptoApi.getRandomValues(random);
    const a = bytesToBigIntBE(random);
    const A = modPow(g, a, p);

    if (!isGoodModExpFirst(A, p)) {
      continue;
    }

    const aForHash = bigIntToBytesBE(A, SIZE_FOR_HASH);
    const uHash = await sha256(concatBytes([aForHash, bForHash]));
    const u = bytesToBigIntBE(uHash);

    if (u > 0n) {
      return { a, A, aForHash, u };
    }
  }
}

export async function computeTelegramPasswordProof(challenge, password) {
  const algo = {
    salt1: base64Decode(challenge?.salt1),
    salt2: base64Decode(challenge?.salt2),
    g: Number(challenge?.g || 0),
    p: base64Decode(challenge?.p),
  };
  const srpB = base64Decode(challenge?.srpB);
  const srpId = String(challenge?.srpId || "");

  if (!srpId || !algo.g || !algo.p.length || !algo.salt1.length || !algo.salt2.length || !srpB.length) {
    throw new Error("Telegram 2FA challenge is incomplete.");
  }

  const p = bytesToBigIntBE(algo.p);
  const g = BigInt(algo.g);
  const B = bytesToBigIntBE(srpB);

  if (!isGoodLarge(B, p)) {
    throw new Error("Telegram 2FA challenge is invalid.");
  }

  const passwordHash = await computeHash(algo, password);
  const x = bytesToBigIntBE(passwordHash);
  const pForHash = leftPad(algo.p, SIZE_FOR_HASH);
  const gForHash = bigIntToBytesBE(g, SIZE_FOR_HASH);
  const bForHash = leftPad(srpB, SIZE_FOR_HASH);
  const gX = modPow(g, x, p);
  const kHash = await sha256(concatBytes([pForHash, gForHash]));
  const k = bytesToBigIntBE(kHash);
  const kgX = mod(k * gX, p);
  const randomA = await generateRandomA(g, p, bForHash);
  const gB = mod(B - kgX, p);

  if (!isGoodModExpFirst(gB, p)) {
    throw new Error("Telegram 2FA challenge is invalid.");
  }

  const S = modPow(gB, randomA.a + (randomA.u * x), p);
  const [K, pSha, gSha, salt1Sha, salt2Sha] = await Promise.all([
    sha256(bigIntToBytesBE(S, SIZE_FOR_HASH)),
    sha256(pForHash),
    sha256(gForHash),
    sha256(algo.salt1),
    sha256(algo.salt2),
  ]);
  const M1 = await sha256(concatBytes([
    xorBytes(pSha, gSha),
    salt1Sha,
    salt2Sha,
    randomA.aForHash,
    bForHash,
    K,
  ]));

  return {
    srpId,
    A: base64Encode(randomA.aForHash),
    M1: base64Encode(M1),
  };
}
