import { describe, expect, it } from "vitest";

import { bytesToHex } from "../../../src/pkjs/lib/tgproto/bytes.js";
import { NativeTelegramClient } from "../../../src/pkjs/lib/tgproto/client.js";
import {
  MtProtoState,
  createMessageId,
  readPlainMessage,
  writePlainMessage,
} from "../../../src/pkjs/lib/tgproto/mtproto.js";
import {
  NativeMtProtoSender,
  createTransportError,
} from "../../../src/pkjs/lib/tgproto/sender.js";

function createIdentityCtr() {
  return {
    encrypt(data) {
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    },
  };
}

function createFakeStream() {
  return {
    writes: [],
    connect() {
      return Promise.resolve();
    },
    write(bytes) {
      this.writes.push(bytes);
    },
    close() {
      this.closed = true;
    },
  };
}

describe("tgproto MTProto state", () => {
  it("creates monotonically shaped Telegram message ids", () => {
    const id = createMessageId(1_781_672_000_123, 0);

    expect(BigInt(id) % 4n).toBe(0n);
    expect(id.length).toBeGreaterThan(12);
  });

  it("round-trips plain MTProto messages", () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const wrapped = writePlainMessage(payload, "72623859790382856");
    const decoded = readPlainMessage(wrapped);

    expect(decoded.authKeyId).toBe("0");
    expect(decoded.messageId).toBe("72623859790382856");
    expect(bytesToHex(decoded.body)).toBe("01020304");
  });

  it("increments content-related sequence numbers", () => {
    const state = new MtProtoState({ serverSalt: "0" }, {
      sessionId: new Uint8Array(8),
    });

    expect(state.nextSeqNo(true)).toBe(1);
    expect(state.nextSeqNo(false)).toBe(2);
    expect(state.nextSeqNo(true)).toBe(3);
  });
});

describe("native MTProto sender", () => {
  it("decodes Telegram's four-byte transport errors before decryption", () => {
    const error = createTransportError(new Uint8Array([0x6c, 0xfe, 0xff, 0xff]));

    expect(error).toMatchObject({
      name: "TelegramTransportError",
      errorCode: -404,
      transportErrorCode: -404,
    });
    expect(error.message).toContain("auth key not found");
    expect(createTransportError(new Uint8Array(8))).toBeNull();
  });

  it("opens the PKJS-compatible obfuscated abridged transport", async () => {
    const stream = createFakeStream();
    const sender = new NativeMtProtoSender({
      streamFactory: () => stream,
      randomBytes(length) {
        const out = new Uint8Array(length);
        let index;
        for (index = 0; index < out.length; index += 1) {
          out[index] = index + 1;
        }
        return out;
      },
      cryptoProvider: {
        createAesCtr: createIdentityCtr,
      },
    });
    const client = new NativeTelegramClient({ sender });

    await client.connect();

    expect(stream.writes).toHaveLength(1);
    expect(stream.writes[0]).toHaveLength(64);
    await client.disconnect();
    expect(stream.closed).toBe(true);
  });

  it("fails clearly when the auth crypto provider is incomplete", async () => {
    const stream = createFakeStream();
    const sender = new NativeMtProtoSender({
      streamFactory: () => stream,
      cryptoProvider: {
        createAesCtr: createIdentityCtr,
      },
    });
    const client = new NativeTelegramClient({ sender });

    await client.connect();
    await expect(client.sendCode({ apiId: 123456, apiHash: "hash" }, "+15551234567"))
      .rejects.toThrow("Native Telegram auth requires SHA1, SHA256, and AES-IGE providers");
  });
});
