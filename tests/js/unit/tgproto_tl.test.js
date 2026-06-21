import { describe, expect, it, vi } from "vitest";

import { ByteReader, bytesFromHex, bytesToHex } from "../../../src/pkjs/lib/tgproto/bytes.js";
import { NativeTelegramClient } from "../../../src/pkjs/lib/tgproto/client.js";
import { NativeTelegramSession, SESSION_PREFIX } from "../../../src/pkjs/lib/tgproto/session.js";
import { Api, deserializeObject, serializeObject } from "../../../src/pkjs/lib/tgproto/tl.js";

describe("tgproto TL codec", () => {
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

  it("round-trips native TG2 sessions", () => {
    const session = new NativeTelegramSession();
    session.setDC(1, "pluto.web.telegram.org", 443);
    session.setAuthKey(new Uint8Array([1, 2, 3, 4]), "key-id");
    session.serverSalt = "42";
    session.userId = "7";

    const saved = session.save();
    const restored = new NativeTelegramSession(saved);

    expect(saved.startsWith(SESSION_PREFIX)).toBe(true);
    expect(restored.dcId).toBe(1);
    expect(restored.serverAddress).toBe("pluto.web.telegram.org");
    expect(restored.authKeyId).toBe("key-id");
    expect(bytesToHex(restored.authKey)).toBe("01020304");
    expect(restored.serverSalt).toBe("42");
    expect(restored.userId).toBe("7");
  });
});

describe("native Telegram client facade", () => {
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
});
