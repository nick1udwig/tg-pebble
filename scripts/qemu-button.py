#!/usr/bin/env python3
"""Send a complete Pebble emulator button click through the pypkjs relay."""

from __future__ import annotations

import argparse
import time

from libpebble2.communication.transports.qemu.protocol import QemuButton, QemuPacket
from libpebble2.communication.transports.websocket import MessageTargetPhone, WebsocketTransport
from libpebble2.communication.transports.websocket.protocol import WebSocketRelayQemu


BUTTONS = {
    "back": QemuButton.Button.Back,
    "up": QemuButton.Button.Up,
    "select": QemuButton.Button.Select,
    "down": QemuButton.Button.Down,
}


def send_button_state(transport: WebsocketTransport, state: int) -> None:
    data = QemuButton(state=state)
    packet = QemuPacket(data=data)
    packet.serialise()
    transport.send_packet(
        WebSocketRelayQemu(protocol=packet.protocol, data=data.serialise()),
        target=MessageTargetPhone(),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True, help="pypkjs WebSocket port")
    parser.add_argument("--duration-ms", type=int, default=200, help="button hold duration")
    parser.add_argument("--settle-ms", type=int, default=300, help="post-release delay")
    parser.add_argument("button", choices=BUTTONS)
    args = parser.parse_args()

    if args.duration_ms < 1:
        parser.error("--duration-ms must be positive")
    if args.settle_ms < 0:
        parser.error("--settle-ms must not be negative")

    transport = WebsocketTransport(f"ws://127.0.0.1:{args.port}/")
    transport.connect()
    try:
        # Begin from a known state in case a previous one-shot client closed
        # before its release packet was processed.
        send_button_state(transport, 0)
        time.sleep(0.05)
        send_button_state(transport, int(BUTTONS[args.button]))
        time.sleep(args.duration_ms / 1000.0)
        send_button_state(transport, 0)
        time.sleep(args.settle_ms / 1000.0)
    finally:
        if transport.ws is not None:
            transport.ws.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
