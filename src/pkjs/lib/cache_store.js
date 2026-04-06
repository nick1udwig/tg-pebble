var CACHE_KEYS = Object.freeze({
  session: "session",
  settings: "settings",
  chatList: "chat_list",
  messagePages: "message_pages",
  chatRefs: "chat_refs",
  syncCheckpoint: "sync_checkpoint"
});

var DEFAULT_SETTINGS = Object.freeze({
  sendMode: "preview",
  previewChatMessage: false
});

function createMemoryStorage() {
  var data = {};

  return {
    getItem: function(key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        return data[key];
      }
      return null;
    },
    setItem: function(key, value) {
      data[key] = String(value);
    },
    removeItem: function(key) {
      delete data[key];
    }
  };
}

function mergeSettings(settings) {
  var merged = {
    sendMode: DEFAULT_SETTINGS.sendMode,
    previewChatMessage: DEFAULT_SETTINGS.previewChatMessage
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

function createCacheStore(storage, options) {
  var prefix = "tg_pebble";

  options = options || {};
  storage = storage || createMemoryStorage();
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
      return setJson(CACHE_KEYS.settings, mergeSettings(Object.assign({}, this.getSettings(), settings)));
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
    getChatRefs: function() {
      return getJson(CACHE_KEYS.chatRefs, {});
    },
    setChatRefs: function(chatRefs) {
      return setJson(CACHE_KEYS.chatRefs, chatRefs);
    },
    clearChatsAndMessages: function() {
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.chatRefs);
      remove(CACHE_KEYS.syncCheckpoint);
    },
    clearAll: function() {
      remove(CACHE_KEYS.session);
      remove(CACHE_KEYS.settings);
      remove(CACHE_KEYS.chatList);
      remove(CACHE_KEYS.messagePages);
      remove(CACHE_KEYS.chatRefs);
      remove(CACHE_KEYS.syncCheckpoint);
    }
  };
}

module.exports = {
  CACHE_KEYS: CACHE_KEYS,
  createCacheStore: createCacheStore
};
