import { describe, expect, it } from "vitest";

import { bytesFromHex, bytesToHex } from "../../../src/pkjs/lib/tgproto/bytes.js";
import {
  aesIgeDecrypt,
  aesIgeEncrypt,
  createAesCtr,
  sha1,
  sha256,
  sha512,
} from "../../../src/pkjs/lib/tgproto/crypto.js";

describe("tgproto crypto primitives", () => {
  it("matches standard hash vectors", () => {
    const empty = new Uint8Array();

    expect(bytesToHex(sha1(empty))).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(bytesToHex(sha256(empty))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(bytesToHex(sha512(empty))).toBe(
      "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
    );
  });

  it("matches AES-256-CTR zero-block encryption", () => {
    const key = new Uint8Array(32);
    const iv = new Uint8Array(16);
    const encrypted = createAesCtr(key, iv).encrypt(new Uint8Array(16));

    expect(bytesToHex(encrypted)).toBe("dc95c078a2408989ad48a21492842087");
  });

  it("round-trips AES-IGE blocks", () => {
    const key = bytesFromHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    const iv = bytesFromHex("202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f");
    const plain = bytesFromHex("00112233445566778899aabbccddeeff0102030405060708090a0b0c0d0e0f10");
    const encrypted = aesIgeEncrypt(plain, key, iv);

    expect(bytesToHex(encrypted)).toBe("7be644f573c33e6818987c4141b0e073c61944bb111c50436ed1ff608cb3255c");
    expect(bytesToHex(aesIgeDecrypt(encrypted, key, iv))).toBe(bytesToHex(plain));
  });
});
