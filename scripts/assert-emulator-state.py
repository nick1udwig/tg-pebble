#!/usr/bin/env python3
import argparse
import dbm.dumb
import json
import re
import time
from pathlib import Path

PREFIX = "tg_pebble"


def key(name: str) -> bytes:
    return f"{PREFIX}:{name}".encode("utf-8")


def load_first_json(store, name: str):
    decoder = json.JSONDecoder()
    text = store[key(name)].decode("utf-8")
    value, _ = decoder.raw_decode(text)
    return value


def maybe_load_json(store, name: str, fallback):
    raw_key = key(name)
    if raw_key not in store:
        return fallback
    return load_first_json(store, name)


def extract_chat_2001_messages(message_pages_text: str) -> str:
    match = re.search(r'"2001":\[(?P<messages>.*?)\],"3001":\[', message_pages_text, re.DOTALL)
    if not match:
        raise SystemExit("Could not isolate fixture message page 2001 from emulator storage.")
    return match.group("messages")


def assert_zero_state(store, state_name: str) -> None:
    chats = maybe_load_json(store, "chat_list", [])
    pages = maybe_load_json(store, "message_pages", {})
    session = maybe_load_json(store, "session", None)
    auth_state = maybe_load_json(store, "auth_state", {"errorMessage": ""})

    if chats != []:
        raise SystemExit(f"Expected no chats for {state_name}, got {chats!r}")
    if pages != {}:
        raise SystemExit(f"Expected no message pages for {state_name}, got {pages!r}")

    if state_name == "sign-in-required":
        if session not in (None, {}):
            raise SystemExit(f"Expected no session for sign-in-required, got {session!r}")
        if auth_state.get("errorMessage"):
            raise SystemExit(f"Expected no auth error for sign-in-required, got {auth_state!r}")
        return

    if state_name == "sign-in-failed":
        if not session or session.get("sessionString"):
            raise SystemExit(f"Expected empty stored session for sign-in-failed, got {session!r}")
        if auth_state.get("errorMessage") != "Code expired.":
            raise SystemExit(f"Expected Code expired auth error, got {auth_state!r}")
        return

    if state_name == "no-chats-yet":
        if not session or session.get("sessionString") != "saved-session":
            raise SystemExit(f"Expected saved-session for no-chats-yet, got {session!r}")
        if auth_state.get("errorMessage"):
            raise SystemExit(f"Expected no auth error for no-chats-yet, got {auth_state!r}")
        return

    raise SystemExit(f"Unhandled zero state: {state_name}")


def assert_read_only(store, expected_preview: str, expected_message_text: str | None) -> None:
    chats = load_first_json(store, "chat_list")
    message_pages_text = store[key("message_pages")].decode("utf-8")
    chat = next((entry for entry in chats if entry.get("id") == 2001), None)
    if not chat:
        raise SystemExit("Missing fixture chat 2001 after emulator smoke test.")
    if chat.get("preview") != expected_preview:
        raise SystemExit(f"Expected preview {expected_preview!r}, got {chat.get('preview')!r}")

    if expected_message_text:
        messages_blob = extract_chat_2001_messages(message_pages_text)
        if f'"text":"{expected_message_text}"' not in messages_blob:
            raise SystemExit(f"Expected message {expected_message_text!r} in fixture page 2001.")


def assert_send_success(store, expected_text: str, expected_preview: str | None) -> None:
    message_pages_text = store[key("message_pages")].decode("utf-8")
    messages_blob = extract_chat_2001_messages(message_pages_text)
    if f'"text":"{expected_text}"' not in messages_blob or '"outgoing":true' not in messages_blob:
        raise SystemExit("Expected outgoing dictation message in fixture message page 2001 after send.")

    if expected_preview is None:
        return

    chats = load_first_json(store, "chat_list")
    chat = next((entry for entry in chats if entry.get("id") == 2001), None)
    if not chat:
        raise SystemExit("Missing fixture chat 2001 after emulator smoke test.")
    if chat.get("preview") != expected_preview:
        raise SystemExit(f"Expected updated preview {expected_preview!r}, got {chat.get('preview')!r}")


def assert_send_failure(store, expected_preview: str, rejected_text: str) -> None:
    chats = load_first_json(store, "chat_list")
    message_pages_text = store[key("message_pages")].decode("utf-8")
    chat = next((entry for entry in chats if entry.get("id") == 2001), None)
    if not chat:
        raise SystemExit("Missing fixture chat 2001 after emulator smoke test.")
    if chat.get("preview") != expected_preview:
        raise SystemExit(f"Expected preview {expected_preview!r}, got {chat.get('preview')!r}")

    messages_blob = extract_chat_2001_messages(message_pages_text)
    if f'"text":"{rejected_text}"' in messages_blob:
        raise SystemExit(f"Unexpectedly found rejected text {rejected_text!r} in fixture page 2001.")


def run_assertion(store, args) -> None:
    if args.command == "zero-state":
        assert_zero_state(store, args.state_name)
    elif args.command == "read-only":
        assert_read_only(store, args.expected_preview, args.expected_message_text)
    elif args.command == "send-success":
        assert_send_success(store, args.expected_text, args.expected_preview)
    elif args.command == "send-failure":
        assert_send_failure(store, args.expected_preview, args.rejected_text)
    else:
        raise SystemExit(f"Unhandled command: {args.command}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Assert TG Pebble emulator PKJS storage for a scenario.")
    parser.add_argument("persist_dir")
    parser.add_argument("app_uuid")
    subparsers = parser.add_subparsers(dest="command", required=True)

    zero = subparsers.add_parser("zero-state")
    zero.add_argument("state_name", choices=["sign-in-required", "sign-in-failed", "no-chats-yet"])

    read_only = subparsers.add_parser("read-only")
    read_only.add_argument("expected_preview")
    read_only.add_argument("expected_message_text", nargs="?", default=None)

    send_success = subparsers.add_parser("send-success")
    send_success.add_argument("expected_text")
    send_success.add_argument("expected_preview", nargs="?", default=None)

    send_failure = subparsers.add_parser("send-failure")
    send_failure.add_argument("expected_preview")
    send_failure.add_argument("rejected_text")

    args = parser.parse_args()
    store_path = Path(args.persist_dir) / "localstorage" / args.app_uuid
    last_retryable = None

    for _attempt in range(10):
        store = dbm.dumb.open(str(store_path), "r")
        try:
            run_assertion(store, args)
            print(f"Emulator storage assertions passed for {args.command}.")
            return 0
        except (json.JSONDecodeError, KeyError) as error:
            last_retryable = error
            time.sleep(0.25)
        finally:
            store.close()

    if last_retryable is not None:
        raise SystemExit(f"Emulator storage never stabilized for {args.command}: {last_retryable}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
