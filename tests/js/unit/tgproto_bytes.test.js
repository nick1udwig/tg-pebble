import { describe, expect, it } from "vitest";

import {
  ByteReader,
  ByteWriter,
  bytesFromHex,
  bytesLEToInt64,
  bytesToHex,
  int64ToBytesLE,
} from "../../../src/pkjs/lib/tgproto/bytes.js";

describe("tgproto byte primitives", () => {
  it("writes and reads little-endian ints and TL strings", () => {
    const writer = new ByteWriter();
    writer.writeInt32(-123);
    writer.writeUInt32(0xfedcba98);
    writer.writeString("hi");

    const reader = new ByteReader(writer.result());

    expect(reader.readInt32()).toBe(-123);
    expect(reader.readUInt32()).toBe(0xfedcba98);
    expect(reader.readString()).toBe("hi");
    expect(reader.remaining()).toBe(0);
  });

  it("round-trips signed 64-bit decimal values", () => {
    expect(bytesLEToInt64(int64ToBytesLE("9223372036854775807"), true)).toBe("9223372036854775807");
    expect(bytesLEToInt64(int64ToBytesLE("-9223372036854775808"), true)).toBe("-9223372036854775808");
    expect(bytesLEToInt64(int64ToBytesLE("-1"), true)).toBe("-1");
    expect(bytesToHex(int64ToBytesLE("72623859790382856"))).toBe("0807060504030201");
  });

  it("round-trips unsigned 64-bit wire values", () => {
    expect(bytesLEToInt64(int64ToBytesLE("18446744073709551615"), false)).toBe("18446744073709551615");
    expect(bytesLEToInt64(int64ToBytesLE("18446744073709551615"), true)).toBe("-1");
  });

  it("rejects 64-bit decimal values outside the wire range", () => {
    expect(() => int64ToBytesLE("18446744073709551616")).toThrow(/64-bit/);
    expect(() => int64ToBytesLE("-9223372036854775809")).toThrow(/64-bit/);
  });

  it("encodes long TL byte arrays with padding", () => {
    const writer = new ByteWriter();
    const payload = new Uint8Array(260);

    payload[0] = 1;
    payload[259] = 2;
    writer.writeTlBytes(payload);

    expect(bytesToHex(writer.result().slice(0, 4))).toBe("fe040100");
    expect(new ByteReader(writer.result()).readTlBytes()).toEqual(payload);
  });

  it("converts hex safely", () => {
    expect(bytesToHex(bytesFromHex("ef ef ef ef"))).toBe("efefefef");
  });

  it("rejects malformed hex input", () => {
    expect(() => bytesFromHex("abc")).toThrow(/even number/);
    expect(() => bytesFromHex("zz")).toThrow(/Invalid hex byte/);
  });

  it("rejects negative raw read lengths without moving the cursor", () => {
    const reader = new ByteReader(new Uint8Array([1, 2, 3]));

    expect(() => reader.readRaw(-1)).toThrow(/non-negative/);
    expect(() => reader.readRaw(Infinity)).toThrow(/non-negative/);
    expect(reader.remaining()).toBe(3);
  });
});
