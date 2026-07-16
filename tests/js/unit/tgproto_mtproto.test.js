import { describe, expect, it, vi } from "vitest";

import { ByteWriter, bytesToHex } from "../../../src/pkjs/lib/tgproto/bytes.js";
import { NativeTelegramClient } from "../../../src/pkjs/lib/tgproto/client.js";
import {
  MtProtoState,
  createMessageId,
  readPlainMessage,
  writePlainMessage,
} from "../../../src/pkjs/lib/tgproto/mtproto.js";
import {
  NativeMtProtoSender,
  RPC_RESULT_ID,
  createTransportError,
} from "../../../src/pkjs/lib/tgproto/sender.js";
import { Api, serializeObject } from "../../../src/pkjs/lib/tgproto/tl.js";

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

function createRpcResult(requestMessageId, result) {
  const writer = new ByteWriter();
  writer.writeUInt32(RPC_RESULT_ID);
  writer.writeInt64(requestMessageId);
  writer.writeRaw(serializeObject(result));
  return writer.result();
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

  it("ignores unsolicited updates and unrelated RPC results", async () => {
    const request = Api.messages.GetHistory({
      peer: Api.InputPeerSelf({}),
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      limit: 20,
      maxId: 0,
      minId: 0,
      hash: "0",
    });
    const expectedResult = Api.messages.Messages({
      messages: [],
      chats: [],
      users: [],
    });
    const packets = [
      { body: serializeObject(Api.UpdatesTooLong({})) },
      { body: createRpcResult("122", expectedResult) },
      { body: createRpcResult("123", expectedResult) },
    ];
    const sender = new NativeMtProtoSender({});
    sender.transport = {
      send: vi.fn(),
      recv: vi.fn(async () => packets.shift()),
    };
    sender.state = {
      lastMessageId: "",
      wrapEncrypted: vi.fn(async () => {
        sender.state.lastMessageId = "123";
        return new Uint8Array([1, 2, 3, 4]);
      }),
      unwrapEncrypted: vi.fn(async (packet) => ({ body: packet.body })),
    };
    sender.ensureAuthKey = vi.fn(async () => {});

    await expect(sender.invoke({
      request,
      payload: new Uint8Array([1, 2, 3, 4]),
      client: { session: {} },
    })).resolves.toMatchObject({
      tlName: "messages.messages",
      messages: [],
    });

    expect(sender.transport.recv).toHaveBeenCalledTimes(3);
    expect(sender.transport.send).toHaveBeenCalledTimes(1);
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
