import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultRandomBytes } from "../../../src/pkjs/lib/tgproto/secure_random.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("secure Telegram randomness", () => {
  it("fills bytes with the platform cryptographic generator", () => {
    const getRandomValues = vi.fn((out) => {
      out.fill(0xa5);
      return out;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(defaultRandomBytes(4)).toEqual(new Uint8Array([0xa5, 0xa5, 0xa5, 0xa5]));
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the platform has no secure generator", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() => defaultRandomBytes(8)).toThrow("Secure randomness is unavailable");
  });

  it("rejects invalid byte lengths", () => {
    expect(() => defaultRandomBytes(-1)).toThrow("non-negative integer");
    expect(() => defaultRandomBytes(1.5)).toThrow("non-negative integer");
  });
});
