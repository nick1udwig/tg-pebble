export const CACHE_KEYS = Object.freeze({
  session: "session",
  settings: "settings",
  chatList: "chat_list",
  messagePages: "message_pages",
  syncCheckpoint: "sync_checkpoint",
});

const DEFAULT_SETTINGS = Object.freeze({
  sendMode: "preview",
});

export function createCacheStore(storage, options = {}) {
  const prefix = options.prefix ?? "tg_pebble";

  function getKey(key) {
    return `${prefix}:${key}`;
  }

  function getJson(key, fallback = null) {
    const raw = storage.getItem(getKey(key));

    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function setJson(key, value) {
    storage.setItem(getKey(key), JSON.stringify(value));
    return value;
  }

  function remove(key) {
    storage.removeItem(getKey(key));
  }

  return {
    getJson,
    setJson,
    remove,
    getSession() {
      return getJson(CACHE_KEYS.session, null);
    },
    setSession(session) {
      return setJson(CACHE_KEYS.session, session);
    },
    getSettings() {
      return {
        ...DEFAULT_SETTINGS,
        ...getJson(CACHE_KEYS.settings, {}),
      };
    },
    setSettings(settings) {
      return setJson(CACHE_KEYS.settings, {
        ...DEFAULT_SETTINGS,
        ...settings,
      });
    },
    getChatList() {
      return getJson(CACHE_KEYS.chatList, []);
    },
    setChatList(chats) {
      return setJson(CACHE_KEYS.chatList, chats);
    },
    getMessagePages() {
      return getJson(CACHE_KEYS.messagePages, {});
    },
    setMessagePages(pages) {
      return setJson(CACHE_KEYS.messagePages, pages);
    },
    clearChatsAndMessages() {
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.syncCheckpoint);
    },
    clearAll() {
      Object.values(CACHE_KEYS).forEach(remove);
    },
  };
}

