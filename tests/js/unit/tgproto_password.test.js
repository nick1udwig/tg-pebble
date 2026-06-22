import { describe, expect, it } from "vitest";

import { computeCheck } from "../../../src/pkjs/lib/tgproto/password.js";

function bytes(value, length) {
  const out = new Uint8Array(length);
  let next = BigInt(value);

  for (let index = length - 1; index >= 0; index -= 1) {
    out[index] = Number(next & BigInt(255));
    next >>= BigInt(8);
  }

  return out;
}

function repeatedByte(value, length) {
  const out = new Uint8Array(length);
  out.fill(value);
  return out;
}

describe("tgproto password SRP", () => {
  it("accepts synchronous crypto-provider hashes when computing the SRP proof", async () => {
    let shaCalls = 0;
    const p = repeatedByte(255, 256);
    const largeValue = new Uint8Array(256);
    largeValue[0] = 0x80;

    const cryptoProvider = {
      sha256() {
        shaCalls += 1;
        if (shaCalls === 4) {
          return new Uint8Array(32);
        }
        if (shaCalls === 5) {
          return bytes(1, 32);
        }
        return repeatedByte(shaCalls, 32);
      },
      pbkdf2HmacSha512() {
        return new Uint8Array(64);
      },
      randomBytes(length) {
        const out = new Uint8Array(length);
        out[length - 2] = 0x07;
        out[length - 1] = 0xff;
        return out;
      },
    };

    await expect(computeCheck({
      currentAlgo: {
        salt1: new Uint8Array([1, 2, 3]),
        salt2: new Uint8Array([4, 5, 6]),
        g: 2,
        p,
      },
      srpB: largeValue,
      srpId: "42",
    }, "secret", cryptoProvider)).resolves.toMatchObject({
      className: "inputCheckPasswordSRP",
      srpId: "42",
      A: largeValue,
    });
  });
});
