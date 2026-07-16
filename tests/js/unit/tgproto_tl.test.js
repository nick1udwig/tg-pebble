import { describe, expect, it, vi } from "vitest";
import pako from "pako";

import { ByteReader, ByteWriter, bytesFromHex, bytesToHex } from "../../../src/pkjs/lib/tgproto/bytes.js";
import { NativeTelegramClient, TELEGRAM_API_LAYER } from "../../../src/pkjs/lib/tgproto/client.js";
import { apiLayer } from "../../../src/pkjs/lib/tgproto/tl_schema.js";
import { base64Decode, base64Encode, NativeTelegramSession, SESSION_PREFIX } from "../../../src/pkjs/lib/tgproto/session.js";
import {
  Api,
  deserializeObject,
  deserializeResult,
  getDefinition,
  getDefinitionById,
  GZIP_PACKED_CONSTRUCTOR_ID,
  serializeObject,
  VECTOR_CONSTRUCTOR_ID,
} from "../../../src/pkjs/lib/tgproto/tl.js";

describe("tgproto TL codec", () => {
  it("negotiates the same API layer as the bundled schema", () => {
    expect(TELEGRAM_API_LAYER).toBe(apiLayer);
  });

  it("resolves compiled schema names and legacy camel aliases lazily", () => {
    expect(getDefinition("auth.SendCode")).toMatchObject({
      id: 0xa677244f,
      tlName: "auth.sendCode",
    });
    expect(getDefinition("ReqDHParams")).toMatchObject({
      id: 0xd712e4be,
      tlName: "req_DH_params",
    });
    expect(getDefinitionById(0x997275b5).tlName).toBe("boolTrue");
    expect(() => getDefinition("NotARealConstructor")).toThrow("Unknown TL object");
  });

  it("serializes auth.sendCode with CodeSettings", () => {
    const payload = serializeObject(Api.auth.SendCode({
      phoneNumber: "+15551234567",
      apiId: 123456,
      apiHash: "hash",
      settings: Api.CodeSettings({}),
    }));
    const reader = new ByteReader(payload);

    expect(reader.readUInt32()).toBe(0xa677244f);
    expect(reader.readString()).toBe("+15551234567");
    expect(reader.readInt32()).toBe(123456);
    expect(reader.readString()).toBe("hash");
    expect(reader.readUInt32()).toBe(0xad253d78);
    expect(reader.readUInt32()).toBe(0);
    expect(reader.remaining()).toBe(0);
  });

  it("serializes auth.signIn with the phone code flag", () => {
    const payload = serializeObject(Api.auth.SignIn({
      phoneNumber: "+15551234567",
      phoneCodeHash: "hash-123",
      phoneCode: "12345",
    }));
    const reader = new ByteReader(payload);

    expect(reader.readUInt32()).toBe(0x8d52a951);
    expect(reader.readUInt32()).toBe(1);
    expect(reader.readString()).toBe("+15551234567");
    expect(reader.readString()).toBe("hash-123");
    expect(reader.readString()).toBe("12345");
    expect(reader.remaining()).toBe(0);
  });

  it("serializes vectors for users.getUsers", () => {
    const payload = serializeObject(Api.users.GetUsers({
      id: [Api.InputUserSelf({})],
    }));
    const reader = new ByteReader(payload);

    expect(reader.readUInt32()).toBe(0x0d91a548);
    expect(reader.readUInt32()).toBe(0x1cb5c415);
    expect(reader.readInt32()).toBe(1);
    expect(reader.readUInt32()).toBe(0xf7c1b13f);
    expect(reader.remaining()).toBe(0);
  });

  it("round-trips nested constructor responses", () => {
    const sentCode = Api.auth.SentCode({
      type: Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: "phone-hash",
    });
    const decoded = deserializeObject(serializeObject(sentCode));

    expect(decoded).toMatchObject({
      tlName: "auth.sentCode",
      phoneCodeHash: "phone-hash",
      type: {
        tlName: "auth.sentCodeTypeApp",
        length: 5,
      },
    });
  });

  it("unpacks gzip_packed constructor responses", () => {
    const object = Api.auth.SentCode({
      type: Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: "phone-hash",
    });
    const writer = new ByteWriter();

    writer.writeUInt32(GZIP_PACKED_CONSTRUCTOR_ID);
    writer.writeTlBytes(pako.gzip(serializeObject(object)));

    expect(deserializeObject(writer.result())).toMatchObject({
      tlName: "auth.sentCode",
      phoneCodeHash: "phone-hash",
      type: {
        tlName: "auth.sentCodeTypeApp",
        length: 5,
      },
    });
  });

  it("adds TL field paths to truncated response errors", () => {
    const object = Api.auth.SentCode({
      type: Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: "phone-hash",
    });

    expect(() => deserializeObject(serializeObject(object).slice(0, -1))).toThrow(
      /TL read failed at auth\.sentCode\.phoneCodeHash/
    );
  });

  it("rejects trailing bytes after a top-level TL object", () => {
    const object = Api.auth.SentCode({
      type: Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: "phone-hash",
    });
    const payload = new Uint8Array([...serializeObject(object), 0]);

    expect(() => deserializeObject(payload)).toThrow(/Trailing TL bytes after object: 1/);
  });

  it("rejects trailing bytes after an RPC result", () => {
    const request = Api.auth.SendCode({
      phoneNumber: "+15551234567",
      apiId: 123456,
      apiHash: "hash",
      settings: Api.CodeSettings({}),
    });
    const result = Api.auth.SentCode({
      type: Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: "phone-hash",
    });
    const payload = new Uint8Array([...serializeObject(result), 0]);

    expect(() => deserializeResult(request, payload)).toThrow(/Trailing TL bytes after auth.sendCode result: 1/);
  });

  it("rejects negative TL vector counts", () => {
    const request = Api.users.GetUsers({
      id: [Api.InputUserSelf({})],
    });
    const writer = new ByteWriter();

    writer.writeUInt32(VECTOR_CONSTRUCTOR_ID);
    writer.writeInt32(-1);

    expect(() => deserializeResult(request, writer.result())).toThrow(/Negative TL vector count: -1/);
  });

  it("keeps MTProto auth string fields as raw bytes", () => {
    const request = Api.ReqDHParams({
      nonce: new Uint8Array(16),
      serverNonce: new Uint8Array(16),
      p: bytesFromHex("00ff10"),
      q: bytesFromHex("010203"),
      publicKeyFingerprint: "-3414540481677951611",
      encryptedData: bytesFromHex("80ff00"),
    });
    const decoded = deserializeObject(serializeObject(request));

    expect(bytesToHex(decoded.p)).toBe("00ff10");
    expect(bytesToHex(decoded.q)).toBe("010203");
    expect(bytesToHex(decoded.encryptedData)).toBe("80ff00");
  });

  it("encodes base64 without relying on host runtime helpers", () => {
    const input = new Uint8Array([0, 1, 2, 253, 254, 255]);

    expect(base64Encode(input)).toBe("AAEC/f7/");
    expect(bytesToHex(base64Decode("AAEC/f7/"))).toBe("000102fdfeff");
  });

  it("round-trips native TG2 sessions", () => {
    const session = new NativeTelegramSession();
    const authKey = new Uint8Array(256);

    for (let index = 0; index < authKey.length; index += 1) {
      authKey[index] = index & 255;
    }

    session.setDC(1, "pluto.web.telegram.org", 443);
    session.setAuthKey(authKey, "key-id");
    session.serverSalt = "42";
    session.userId = "7";

    const saved = session.save();
    const restored = new NativeTelegramSession(saved);

    expect(saved.startsWith(SESSION_PREFIX)).toBe(true);
    expect(restored.dcId).toBe(1);
    expect(restored.serverAddress).toBe("pluto.web.telegram.org");
    expect(restored.authKeyId).toBe("key-id");
    expect(restored.authKey.length).toBe(256);
    expect(bytesToHex(restored.authKey.slice(0, 4))).toBe("00010203");
    expect(bytesToHex(restored.authKey.slice(-4))).toBe("fcfdfeff");
    expect(restored.serverSalt).toBe("42");
    expect(restored.userId).toBe("7");
  });
});

describe("native Telegram client facade", () => {
  it("uses cryptographically generated message random ids", async () => {
    const sender = {
      invoke: vi.fn(async ({ request }) => {
        expect(request.randomId).toBe("578437695752307201");
        return { id: 7, message: "Sent" };
      }),
    };
    const client = new NativeTelegramClient({
      sender,
      randomBytes: vi.fn(() => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    });

    await client.sendMessage(Api.InputPeerSelf({}), { message: "Sent" });

    expect(client.randomBytes).toHaveBeenCalledWith(8);
  });

  it("requests a login code through the native sender", async () => {
    const sender = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      invoke: vi.fn(async ({ request }) => {
        expect(request).toMatchObject({
          className: "auth.sendCode",
          phoneNumber: "+15551234567",
          apiId: 123456,
          apiHash: "hash",
        });
        return Api.auth.SentCode({
          type: Api.auth.SentCodeTypeApp({ length: 5 }),
          phoneCodeHash: "phone-hash",
        });
      }),
    };
    const client = new NativeTelegramClient({ sender });

    await client.connect();
    await expect(client.sendCode({ apiId: 123456, apiHash: "hash" }, "+15551234567")).resolves.toEqual({
      phoneCodeHash: "phone-hash",
      isCodeViaApp: true,
    });
    await client.disconnect();

    expect(sender.connect).toHaveBeenCalledTimes(1);
    expect(sender.invoke).toHaveBeenCalledTimes(1);
    expect(sender.disconnect).toHaveBeenCalledTimes(1);
  });

  it("switches DC and retries when Telegram returns PHONE_MIGRATE", async () => {
    const sender = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      invoke: vi.fn(async ({ client }) => {
        if (sender.invoke.mock.calls.length === 1) {
          return {
            tlName: "rpc_error",
            errorCode: 303,
            errorMessage: "PHONE_MIGRATE_1",
          };
        }

        expect(client.dc.dcId).toBe(1);
        return Api.auth.SentCode({
          type: Api.auth.SentCodeTypeApp({ length: 5 }),
          phoneCodeHash: "phone-hash",
        });
      }),
    };
    const client = new NativeTelegramClient({ sender });

    await client.connect();
    await expect(client.sendCode({ apiId: 123456, apiHash: "hash" }, "+15551234567")).resolves.toEqual({
      phoneCodeHash: "phone-hash",
      isCodeViaApp: true,
    });

    expect(sender.connect).toHaveBeenCalledTimes(2);
    expect(sender.disconnect).toHaveBeenCalledTimes(1);
    expect(client.session.dcId).toBe(1);
    expect(client.session.serverAddress).toBe("pluto.web.telegram.org");
  });

  it("emits 2FA password hooks around SRP and checkPassword", async () => {
    const hooks = [];
    const passwordCheck = Api.InputCheckPasswordSRP({
      srpId: "42",
      A: new Uint8Array([1]),
      M1: new Uint8Array([2]),
    });
    const sender = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      invoke: vi.fn(async ({ request }) => {
        if (request.className === "account.getPassword") {
          return {
            tlName: "account.password",
            currentAlgo: { hint: "ignored" },
            srpB: new Uint8Array([3]),
            srpId: "42",
          };
        }
        if (request.className === "auth.checkPassword") {
          expect(request.password).toBe(passwordCheck);
          return { user: { id: "7", firstName: "Alice" } };
        }
        throw new Error("Unexpected request: " + request.className);
      }),
    };
    const client = new NativeTelegramClient({
      sender,
      passwordSrpProvider: {
        computeCheck: vi.fn(async () => passwordCheck),
      },
    });

    await expect(client.signInWithPassword({}, {
      password: async () => "secret",
      onPasswordInfo: () => hooks.push("password-info"),
      onComputeStart: () => hooks.push("compute-start"),
      onComputeDone: () => hooks.push("compute-done"),
      onCheckStart: () => hooks.push("check-start"),
      onCheckDone: () => hooks.push("check-done"),
    })).resolves.toMatchObject({
      id: "7",
      firstName: "Alice",
    });

    expect(hooks).toEqual([
      "password-info",
      "compute-start",
      "compute-done",
      "check-start",
      "check-done",
    ]);
  });

  it("normalizes dialogs to the existing adapter shape", async () => {
    const sender = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      invoke: vi.fn(async () => Api.messages.Dialogs({
        dialogs: [
          Api.Dialog({
            peer: Api.PeerUser({ userId: "42" }),
            topMessage: 9,
            readInboxMaxId: 0,
            readOutboxMaxId: 0,
            unreadCount: 2,
            unreadMentionsCount: 0,
            unreadReactionsCount: 0,
            notifySettings: Api.PeerNotifySettings({}),
          }),
        ],
        messages: [
          Api.Message({
            id: 9,
            peerId: Api.PeerUser({ userId: "42" }),
            date: 1,
            message: "Latest hello",
          }),
        ],
        chats: [],
        users: [
          Api.User({
            id: "42",
            accessHash: "99",
            firstName: "Alice",
          }),
        ],
      })),
    };
    const client = new NativeTelegramClient({ sender });

    await expect(client.getDialogs({ limit: 5 })).resolves.toEqual([
      {
        name: "Alice",
        unreadCount: 2,
        message: expect.objectContaining({ message: "Latest hello" }),
        inputEntity: {
          className: "InputPeerUser",
          userId: "42",
          accessHash: "99",
        },
      },
    ]);
  });

  it("skips empty message placeholders when normalizing history", async () => {
    const sender = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      invoke: vi.fn(async () => Api.messages.Messages({
        messages: [
          Api.MessageEmpty({ id: 8 }),
          Api.Message({
            id: 9,
            peerId: Api.PeerUser({ userId: "42" }),
            date: 1,
            message: "Actual hello",
          }),
        ],
        chats: [],
        users: [
          Api.User({
            id: "42",
            accessHash: "99",
            firstName: "Alice",
          }),
        ],
      })),
    };
    const client = new NativeTelegramClient({ sender });

    await expect(client.getMessages({
      className: "InputPeerUser",
      userId: "42",
      accessHash: "99",
    }, { limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        id: 9,
        message: "Actual hello",
        senderId: "42",
      }),
    ]);
  });

  it("normalizes Telegram history from newest-first to watch display order", async () => {
    const sender = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      invoke: vi.fn(async () => Api.messages.Messages({
        messages: [
          Api.Message({
            id: 12,
            peerId: Api.PeerUser({ userId: "42" }),
            date: 2,
            message: "Newest",
          }),
          Api.Message({
            id: 11,
            peerId: Api.PeerUser({ userId: "42" }),
            date: 1,
            message: "Older",
          }),
        ],
        chats: [],
        users: [
          Api.User({
            id: "42",
            accessHash: "99",
            firstName: "Alice",
          }),
        ],
      })),
    };
    const client = new NativeTelegramClient({ sender });

    await expect(client.getMessages({
      className: "InputPeerUser",
      userId: "42",
      accessHash: "99",
    }, { limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        id: 11,
        message: "Older",
      }),
      expect.objectContaining({
        id: 12,
        message: "Newest",
      }),
    ]);
  });

  it("marks Telegram history read through the native client", async () => {
    const sender = {
      invoke: vi.fn(async () => ({})),
    };
    const client = new NativeTelegramClient({ sender });
    const peer = {
      className: "InputPeerUser",
      userId: "42",
      accessHash: "99",
    };

    await client.markRead(peer, 12);

    expect(sender.invoke).toHaveBeenCalledTimes(1);
    expect(sender.invoke.mock.calls[0][0].request).toMatchObject({
      className: "messages.readHistory",
      peer,
      maxId: 12,
    });
  });
});
