var cacheStoreLib = require("./cache_store");
var fixturesLib = require("./fixtures");
var protocol = require("./protocol");
var syncStateLib = require("./sync_state");

var createCacheStore = cacheStoreLib.createCacheStore;
var createFixtureState = fixturesLib.createFixtureState;
var buildChatListPagePayload = protocol.buildChatListPagePayload;
var buildChatPagePayload = protocol.buildChatPagePayload;
var SyncEvent = syncStateLib.SyncEvent;
var SyncState = syncStateLib.SyncState;
var reduceSyncState = syncStateLib.reduceSyncState;

function createPkjsApp(options) {
  var storage = options.storage;
  var transport = options.transport || null;
  var cache = createCacheStore(storage);
  var syncState = SyncState.desynced;

  function ensureFixtureCache() {
    var fixtureState;

    if (cache.getChatList().length > 0) {
      return;
    }

    fixtureState = createFixtureState();
    cache.setSession(fixtureState.session);
    cache.setChatList(fixtureState.chats);
    cache.setMessagePages(fixtureState.messagePages);
  }

  function findChat(chatId) {
    var chats = cache.getChatList();
    var index;

    for (index = 0; index < chats.length; index += 1) {
      if (Number(chats[index].id) === Number(chatId)) {
        return chats[index];
      }
    }

    return null;
  }

  ensureFixtureCache();

  return {
    cache: cache,
    getSyncState: function() {
      return syncState;
    },
    setSyncState: function(eventType) {
      syncState = reduceSyncState(syncState, { type: eventType });
      return syncState;
    },
    bootstrap: function() {
      var chats;

      ensureFixtureCache();
      chats = cache.getChatList();
      return buildChatListPagePayload({ chats: chats, syncState: syncState });
    },
    getChatPage: function(chatId) {
      var pages;
      var messages;

      ensureFixtureCache();
      pages = cache.getMessagePages();
      messages = pages[chatId] || [];
      return buildChatPagePayload({ chatId: chatId, messages: messages, syncState: syncState });
    },
    refreshStarted: function() {
      return this.setSyncState(SyncEvent.refreshStart);
    },
    refreshSucceeded: function() {
      return this.setSyncState(SyncEvent.refreshSuccess);
    },
    refreshFailed: function() {
      return this.setSyncState(SyncEvent.refreshError);
    },
    rehydrateFixtures: function() {
      cache.clearChatsAndMessages();
      ensureFixtureCache();
      return this.bootstrap();
    },
    getSettingsState: function() {
      return cache.getSettings();
    },
    setSendMode: function(sendMode) {
      return cache.setSettings({ sendMode: sendMode });
    },
    sendMessage: function(chatId, text) {
      var chatList;
      var messagePages;
      var nextText;
      var chat;
      var existingMessages;
      var nextMessage;
      var nextMessages;
      var nextPages;
      var nextChats;
      var index;

      ensureFixtureCache();
      chatList = cache.getChatList();
      messagePages = cache.getMessagePages();
      nextText = String(text == null ? "" : text).trim();

      if (nextText.length === 0) {
        return { ok: false, detail: "Message cannot be empty." };
      }

      if (nextText.toLowerCase().indexOf("fail") >= 0) {
        return { ok: false, detail: "Fixture transport rejected the message." };
      }

      chat = findChat(chatId);
      if (!chat) {
        return { ok: false, detail: "Chat not found." };
      }

      existingMessages = messagePages[chatId] || [];
      nextMessage = {
        senderId: 1,
        senderName: "You",
        outgoing: true,
        text: nextText,
        showSender: existingMessages.length === 0 || existingMessages[existingMessages.length - 1].senderName !== "You"
      };

      nextMessages = existingMessages.slice();
      nextMessages.push(nextMessage);

      nextPages = {};
      for (index in messagePages) {
        if (Object.prototype.hasOwnProperty.call(messagePages, index)) {
          nextPages[index] = messagePages[index];
        }
      }
      nextPages[chatId] = nextMessages;

      nextChats = [];
      for (index = 0; index < chatList.length; index += 1) {
        if (Number(chatList[index].id) === Number(chatId)) {
          nextChats.push({
            id: chatList[index].id,
            title: chatList[index].title,
            preview: nextText,
            unreadCount: 0
          });
        } else {
          nextChats.push(chatList[index]);
        }
      }

      cache.setMessagePages(nextPages);
      cache.setChatList(nextChats);

      return { ok: true };
    },
    logout: function() {
      cache.clearAll();
      syncState = SyncState.desynced;
    },
    getTransport: function() {
      return transport;
    }
  };
}

module.exports = {
  createPkjsApp: createPkjsApp
};
