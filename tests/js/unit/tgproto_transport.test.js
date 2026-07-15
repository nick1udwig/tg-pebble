import { describe, expect, it } from "vitest";

import {
  OBFUSCATED_ABRIDGED_TAG,
  encodeAbridgedPacket,
} from "../../../src/pkjs/lib/tgproto/abridged.js";
import { bytesFromHex, bytesToHex } from "../../../src/pkjs/lib/tgproto/bytes.js";
import {
  buildTelegramWebSocketUrl,
} from "../../../src/pkjs/lib/tgproto/web_socket.js";
import {
  createInputPeer,
  getTelegramWebDc,
} from "../../../src/pkjs/lib/tgproto/client.js";
import {
  createObfuscatedHeader,
} from "../../../src/pkjs/lib/tgproto/obfuscated.js";

function createIdentityCtr() {
  return {
    encrypt(data) {
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    },
  };
}

describe("tgproto transport primitives", () => {
  it("builds Telegram web socket URLs", () => {
    expect(buildTelegramWebSocketUrl(getTelegramWebDc(1), false)).toBe("wss://pluto.web.telegram.org:443/apiws");
    expect(buildTelegramWebSocketUrl(getTelegramWebDc(2), true)).toBe("wss://venus.web.telegram.org:443/apiws_test");
    expect(buildTelegramWebSocketUrl({ host: "venus.web.telegram.org", port: 80 }, false, false))
      .toBe("ws://venus.web.telegram.org:80/apiws");
  });

  it("encodes abridged packets", () => {
    expect(bytesToHex(encodeAbridgedPacket(bytesFromHex("01020304")))).toBe("0101020304");
  });

  it("places the abridged obfuscation tag in generated headers", () => {
    const random = new Uint8Array(64);
    let index;

    for (index = 0; index < random.length; index += 1) {
      random[index] = index + 1;
    }

    const header = createObfuscatedHeader({
      randomBytes() {
        return new Uint8Array(random);
      },
      createAesCtr: createIdentityCtr,
    });

    expect(bytesToHex(header.header.slice(56, 60))).toBe(bytesToHex(OBFUSCATED_ABRIDGED_TAG));
  });

  it("creates plain input peers from cached remote refs", () => {
    expect(createInputPeer({
      peerType: "user",
      peerId: "42",
      accessHash: "123",
    })).toEqual({
      className: "InputPeerUser",
      userId: "42",
      accessHash: "123",
    });
  });
});
