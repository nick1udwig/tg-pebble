#!/usr/bin/env python3
import argparse
import dbm.dumb
import json
from pathlib import Path

PREFIX = "tg_pebble"


def key(name: str) -> bytes:
    return f"{PREFIX}:{name}".encode("utf-8")


def write_json(store, name: str, value) -> None:
    store[key(name)] = json.dumps(value, separators=(",", ":")).encode("utf-8")


def delete_key(store, name: str) -> None:
    raw_key = key(name)
    try:
        del store[raw_key]
    except KeyError:
        pass


def seed_state(store, state_name: str) -> None:
    write_json(store, "settings", {"sendMode": "preview", "previewChatMessage": False})
    write_json(store, "chat_list", [])
    write_json(store, "message_pages", {})
    write_json(store, "chat_refs", {})

    if state_name == "sign-in-required":
        delete_key(store, "session")
        delete_key(store, "auth_state")
        return

    if state_name == "sign-in-failed":
        write_json(store, "session", {
            "sessionString": "",
            "phoneNumber": "+15551234567",
            "accountLabel": "",
            "userId": "",
        })
        write_json(store, "auth_state", {"errorMessage": "Code expired."})
        return

    if state_name == "no-chats-yet":
        write_json(store, "session", {
            "sessionString": "saved-session",
            "phoneNumber": "+15551234567",
            "accountLabel": "Alice Example",
            "userId": "7",
        })
        delete_key(store, "auth_state")
        return

    raise SystemExit(f"Unsupported emulator app state: {state_name}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed TG Pebble PKJS app storage inside an emulator persist dir.")
    parser.add_argument("persist_dir")
    parser.add_argument("app_uuid")
    parser.add_argument("state_name", choices=["sign-in-required", "sign-in-failed", "no-chats-yet"])
    args = parser.parse_args()

    localstorage_dir = Path(args.persist_dir) / "localstorage"
    localstorage_dir.mkdir(parents=True, exist_ok=True)
    store_path = localstorage_dir / args.app_uuid

    store = dbm.dumb.open(str(store_path), "c")
    try:
        seed_state(store, args.state_name)
    finally:
        store.close()

    print(f"Seeded emulator app state '{args.state_name}' at {store_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
