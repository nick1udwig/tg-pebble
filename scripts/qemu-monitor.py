#!/usr/bin/env python3
import argparse
import socket
import sys
import time


def send_command(port: int, command: str, delay: float = 0.0) -> str:
    with socket.create_connection(("127.0.0.1", port), timeout=2) as sock:
        try:
            sock.recv(4096)
        except OSError:
            pass
        sock.sendall((command.rstrip() + "\n").encode("utf-8"))
        if delay > 0:
            time.sleep(delay)
        try:
            return sock.recv(4096).decode("utf-8", "ignore")
        except OSError:
            return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Send commands to the QEMU monitor backing the Pebble emulator.")
    parser.add_argument("--port", required=True, type=int, help="QEMU monitor TCP port")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sendkey_parser = subparsers.add_parser("sendkey", help="Inject one or more keyboard events")
    sendkey_parser.add_argument("keys", nargs="+", help="QEMU key names, for example q, w, s, x")
    sendkey_parser.add_argument("--delay-ms", type=int, default=150, help="Delay between keys")

    raw_parser = subparsers.add_parser("raw", help="Send a raw QEMU monitor command")
    raw_parser.add_argument("value", help="Literal QEMU monitor command")

    screendump_parser = subparsers.add_parser("screendump", help="Write a screendump to a PPM file")
    screendump_parser.add_argument("path", help="Absolute or repo-relative output path for the PPM file")

    args = parser.parse_args()

    if args.command == "sendkey":
        for key in args.keys:
            send_command(args.port, f"sendkey {key}", delay=args.delay_ms / 1000.0)
        return 0

    if args.command == "raw":
        response = send_command(args.port, args.value)
        if response:
            sys.stdout.write(response)
        return 0

    if args.command == "screendump":
        response = send_command(args.port, f"screendump {args.path}")
        if response:
            sys.stdout.write(response)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
