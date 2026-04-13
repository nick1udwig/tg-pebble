#!/usr/bin/env python3
import dbm.dumb
import json
import os
import sys
from pathlib import Path


RUNTIME_CONFIG_KEY = "tg_pebble:runtime_config"
SESSION_KEY = "tg_pebble:session"


def parse_bool(value, fallback):
    if value is None or value == "":
        return fallback

    return value.lower() in ("1", "true", "yes", "on")


def load_json(value):
    if not value:
        return None

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def read_store_json(store, key):
    if key not in store:
        return None

    value = store[key]
    if isinstance(value, bytes):
        value = value.decode("utf-8")

    return load_json(value)


def get_persist_dir(platform):
    sdk_root = Path(os.environ.get("TG_PEBBLE_SDK_ROOT", Path.home() / ".pebble-sdk" / "SDKs" / "current")).resolve()
    sdk_version = sdk_root.name
    return Path.home() / ".pebble-sdk" / sdk_version / platform


def main():
    project_root = Path(__file__).resolve().parent.parent
    app_info = json.loads((project_root / "appinfo.json").read_text(encoding="utf-8"))
    app_uuid = app_info["uuid"]
    platform = sys.argv[1] if len(sys.argv) > 1 else "basalt"
    persist_dir = get_persist_dir(platform)
    storage_dir = persist_dir / "localstorage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    api_id_raw = os.environ.get("TG_API_ID", "").strip()
    api_hash = os.environ.get("TG_API_HASH", "").strip()
    session_string = os.environ.get("TG_SESSION_STRING", "").strip()
    phone_number = os.environ.get("TG_TEST_PHONE", "").strip()
    runtime_config = None

    if api_id_raw and api_hash:
        try:
            api_id = int(api_id_raw)
        except ValueError:
            print("TG_API_ID must be an integer for live emulator runs.", file=sys.stderr)
            return 2

        runtime_config = {
            "apiId": api_id,
            "apiHash": api_hash,
            "useWSS": parse_bool(os.environ.get("TG_TEST_USE_WSS"), True),
            "testServers": parse_bool(os.environ.get("TG_TEST_SERVERS"), False),
            "configUrl": os.environ.get("TG_CONFIG_URL", "http://127.0.0.1:4173"),
        }

    with dbm.dumb.open(str(storage_dir / app_uuid), "c") as store:
        existing_runtime_config = read_store_json(store, RUNTIME_CONFIG_KEY)
        existing_session = read_store_json(store, SESSION_KEY)

        if runtime_config is not None:
            store[RUNTIME_CONFIG_KEY] = json.dumps(runtime_config)
            print(f"Seeded emulator runtime config for {platform}.")
        elif existing_runtime_config is not None:
            print(f"Using existing emulator runtime config for {platform}.")
        else:
            print(
                "Live emulator requires TG_API_ID and TG_API_HASH, or an existing seeded runtime config in emulator storage.",
                file=sys.stderr,
            )
            return 2

        if "TG_SESSION_STRING" in os.environ:
            if session_string:
                next_session = existing_session if isinstance(existing_session, dict) else {}
                next_session["sessionString"] = session_string
                if phone_number:
                    next_session["phoneNumber"] = phone_number
                store[SESSION_KEY] = json.dumps(next_session)
                print(f"Seeded emulator session for {platform}.")
            elif SESSION_KEY in store:
                del store[SESSION_KEY]
                print(f"Cleared emulator session for {platform}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
