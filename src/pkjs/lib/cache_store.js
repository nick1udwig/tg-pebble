export var CACHE_KEYS = Object.freeze({
  session: "session",
  settings: "settings",
  chatList: "chat_list",
  messagePages: "message_pages",
  syncCheckpoint: "sync_checkpoint"
});

var DEFAULT_SETTINGS = Object.freeze({
  sendMode: "preview"
});

function mergeSettings(settings) {
  var merged = {
    sendMode: DEFAULT_SETTINGS.sendMode
  };
  var key;

  settings = settings || {};

  for (key in settings) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      merged[key] = settings[key];
    }
  }

  return merged;
}

export function createCacheStore(storage, options) {
  var prefix = "tg_pebble";

  options = options || {};
  if (options.prefix) {
    prefix = options.prefix;
  }

  function getKey(key) {
    return prefix + ":" + key;
  }

  function getJson(key, fallback) {
    var raw;

    if (fallback === undefined) {
      fallback = null;
    }

    raw = storage.getItem(getKey(key));

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
    getJson: getJson,
    setJson: setJson,
    remove: remove,
    getSession: function() {
      return getJson(CACHE_KEYS.session, null);
    },
    setSession: function(session) {
      return setJson(CACHE_KEYS.session, session);
    },
    getSettings: function() {
      return mergeSettings(getJson(CACHE_KEYS.settings, {}));
    },
    setSettings: function(settings) {
      return setJson(CACHE_KEYS.settings, mergeSettings(settings));
    },
    getChatList: function() {
      return getJson(CACHE_KEYS.chatList, []);
    },
    setChatList: function(chats) {
      return setJson(CACHE_KEYS.chatList, chats);
    },
    getMessagePages: function() {
      return getJson(CACHE_KEYS.messagePages, {});
    },
    setMessagePages: function(pages) {
      return setJson(CACHE_KEYS.messagePages, pages);
    },
    clearChatsAndMessages: function() {
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.syncCheckpoint);
    },
    clearAll: function() {
      remove(CACHE_KEYS.session);
      remove(CACHE_KEYS.settings);
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.syncCheckpoint);
    }
  };
}
