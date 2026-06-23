var cacheStoreLib = require("./cache_store");
var fixturesLib = require("./fixtures");
var numberLib = require("./number");
var objectLib = require("./object");
var protocol = require("./protocol");
var syncStateLib = require("./sync_state");

var createCacheStore = cacheStoreLib.createCacheStore;
var createFixtureState = fixturesLib.createFixtureState;
var buildChatListPagePayload = protocol.buildChatListPagePayload;
var buildChatPagePayload = protocol.buildChatPagePayload;
var assign = objectLib.assign;
var isFiniteNumber = numberLib.isFiniteNumber;
var SyncEvent = syncStateLib.SyncEvent;
var SyncState = syncStateLib.SyncState;
var reduceSyncState = syncStateLib.reduceSyncState;

function getErrorMessage(error, fallback) {
  return String(error && (error.errorMessage || error.message) || fallback || "Telegram request failed.");
}

function createPkjsApp(options) {
  var storage = options.storage;
  var transport = options.transport || null;
  var telegramAdapterFactory = options.telegramAdapterFactory || null;
  var fixtureMode = options.fixtureMode !== false;
  var logger = typeof options.logger === "function" ? options.logger : function() {};
  var cache = createCacheStore(storage);
  var syncState = SyncState.desynced;
  var existingSession = cache.getSession();
  var incomingSessionString = options.initialSession && options.initialSession.sessionString
    ? String(options.initialSession.sessionString)
    : "";
  var existingSessionString = existingSession && existingSession.sessionString
    ? String(existingSession.sessionString)
    : "";

  if (incomingSessionString && existingSessionString !== incomingSessionString) {
    cache.clearAuthState();
    cache.setSession(options.initialSession);
    cache.clearChatsAndMessages();
  } else if (options.initialSession && !existingSession) {
    cache.setSession(options.initialSession);
  }

  function hasLiveSession() {
    var session = cache.getSession();
    return !!(session && session.sessionString);
  }

  function ensureFixtureCache() {
    var fixtureState;

    if (!fixtureMode || cache.getChatList().length > 0 || hasLiveSession()) {
      return;
    }

    fixtureState = createFixtureState();
    if (!cache.getSession()) {
      cache.setSession(fixtureState.session);
    }
    cache.setChatList(fixtureState.chats);
    cache.setMessagePages(fixtureState.messagePages);
    cache.setChatRefs({});
  }

  function findChat(chatId) {
    var chats = cache.getChatList();
    var index;

    for (index = 0; index < chats.length; index += 1) {
      if (String(chats[index].id) === String(chatId)) {
        return chats[index];
      }
    }

    return null;
  }

  function getChatRef(chatId) {
    var refs = cache.getChatRefs();
    return refs[String(chatId)] || null;
  }

  function getTelegramAdapter() {
    var session = cache.getSession();

    if (!telegramAdapterFactory || !session || !session.sessionString) {
      return null;
    }

    return telegramAdapterFactory(session);
  }

  function getConfigState() {
    var settings = cache.getSettings();
    var session = cache.getSession() || {};
    var authState = cache.getAuthState();
    var pendingPhoneNumber = String(authState.phoneNumber || "").trim();
    var sessionPhoneNumber = String(session.phoneNumber || "").trim();

    return {
      phoneNumber: sessionPhoneNumber,
      sendMode: settings.sendMode,
      previewChatMessage: settings.previewChatMessage === true,
      hasSession: !!session.sessionString,
      accountLabel: String(session.accountLabel || ""),
      authError: String(authState.errorMessage || ""),
      codeRequested: !!authState.phoneCodeHash && !!pendingPhoneNumber && pendingPhoneNumber === sessionPhoneNumber,
      codeDelivery: String(authState.codeDelivery || ""),
      passwordRequired: authState.passwordRequired === true,
      passwordHint: String(authState.passwordHint || ""),
      passwordChallenge: authState.passwordChallenge || null
    };
  }

  function buildCurrentChatListPayload() {
    return buildChatListPagePayload({
      chats: cache.getChatList(),
      syncState: syncState
    });
  }

  function buildCurrentChatPagePayload(chatId) {
    var pages = cache.getMessagePages();

    return buildChatPagePayload({
      chatId: chatId,
      messages: pages[chatId] || [],
      syncState: syncState
    });
  }

  function updateMessagePage(chatId, messages) {
    var pages = cache.getMessagePages();
    var nextPages = {};
    var key;

    for (key in pages) {
      if (Object.prototype.hasOwnProperty.call(pages, key)) {
        nextPages[key] = pages[key];
      }
    }

    nextPages[chatId] = messages;
    cache.setMessagePages(nextPages);
  }

  function messagesMatch(left, right) {
    if (!left || !right) {
      return false;
    }

    return !!left.outgoing === !!right.outgoing &&
      String(left.senderName || "") === String(right.senderName || "") &&
      String(left.text || "") === String(right.text || "");
  }

  function mergeOptimisticTail(cachedMessages, fetchedMessages) {
    var optimisticTail = [];
    var index;
    var compareStart;

    cachedMessages = cachedMessages || [];
    fetchedMessages = fetchedMessages || [];

    for (index = cachedMessages.length - 1; index >= 0; index -= 1) {
      if (!cachedMessages[index].outgoing) {
        break;
      }

      optimisticTail.unshift(cachedMessages[index]);
    }

    if (optimisticTail.length === 0) {
      return fetchedMessages;
    }

    compareStart = fetchedMessages.length - optimisticTail.length;
    if (compareStart >= 0) {
      for (index = 0; index < optimisticTail.length; index += 1) {
        if (!messagesMatch(fetchedMessages[compareStart + index], optimisticTail[index])) {
          compareStart = -1;
          break;
        }
      }
    }

    if (compareStart >= 0) {
      return fetchedMessages;
    }

    return fetchedMessages.concat(optimisticTail);
  }

  function updateChatPreview(chatId, previewText) {
    var chats = cache.getChatList();
    var nextChats = [];
    var index;

    for (index = 0; index < chats.length; index += 1) {
      if (String(chats[index].id) === String(chatId)) {
        nextChats.push({
          id: chats[index].id,
          remoteId: chats[index].remoteId,
          title: chats[index].title,
          preview: previewText,
          unreadCount: 0
        });
      } else {
        nextChats.push(chats[index]);
      }
    }

    cache.setChatList(nextChats);
  }

  function appendOutgoingMessageToCache(chatId, text) {
    var existingMessages = cache.getMessagePages()[chatId] || [];
    var nextMessages = existingMessages.slice();

    nextMessages.push({
      senderId: "self",
      senderName: "You",
      outgoing: true,
      text: text,
      showSender: existingMessages.length === 0 || String(existingMessages[existingMessages.length - 1].senderId) !== "self"
    });

    updateMessagePage(chatId, nextMessages);
    updateChatPreview(chatId, text);
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
    bootstrap: async function() {
      var adapter = getTelegramAdapter();
      var result;

      ensureFixtureCache();

      if (!adapter || !adapter.isConfigured || !adapter.isConfigured()) {
        return buildCurrentChatListPayload();
      }

      try {
        result = await adapter.hydrateChatList({
          limit: 20,
          cachedRefs: cache.getChatRefs()
        });
        cache.setChatList(result.chats || []);
        cache.setChatRefs(result.chatRefs || {});
      } catch (error) {
        logger("hydrateChatList failed", error);
      }

      return buildCurrentChatListPayload();
    },
    getChatPage: async function(chatId) {
      var adapter = getTelegramAdapter();
      var ref = getChatRef(chatId);
      var result;
      var errorMessage = "";
      var payload;

      ensureFixtureCache();

      if (adapter && adapter.isConfigured && adapter.isConfigured() && ref) {
        try {
          var cachedMessages = cache.getMessagePages()[chatId] || [];
          result = await adapter.hydrateChatPage({
            chatId: chatId,
            remoteRef: ref,
            limit: 20
          });
          updateMessagePage(chatId, mergeOptimisticTail(cachedMessages, result.messages || []));
        } catch (error) {
          errorMessage = getErrorMessage(error, "Chat load failed.");
          logger("hydrateChatPage failed", error);
        }
      }

      payload = buildCurrentChatPagePayload(chatId);
      if (errorMessage) {
        payload.errorMessage = errorMessage;
      }
      return payload;
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
    clearCache: function() {
      cache.clearChatsAndMessages();
      syncState = SyncState.desynced;
    },
    rehydrateFixtures: async function() {
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
    setPreviewChatMessage: function(previewChatMessage) {
      return cache.setSettings({ previewChatMessage: previewChatMessage === true });
    },
    getSession: function() {
      return cache.getSession();
    },
    setSession: function(session) {
      if (session && session.sessionString) {
        cache.clearAuthState();
      }
      return cache.setSession(session);
    },
    setAuthError: function(message, options) {
      var nextMessage = String(message || "").trim();
      var currentAuthState = cache.getAuthState();

      if (!nextMessage) {
        cache.clearAuthState();
        return {
          errorMessage: ""
        };
      }

      if (options && options.clearPendingAuth === true) {
        return cache.setAuthState({
          errorMessage: nextMessage,
          phoneNumber: currentAuthState.phoneNumber
        });
      }

      return cache.setAuthState(assign({}, currentAuthState, {
        errorMessage: nextMessage
      }));
    },
    setAuthCodeRequest: function(request) {
      request = request || {};
      var codeRequestedAt = Number(request.codeRequestedAt || 0);

      return cache.setAuthState({
        errorMessage: "",
        phoneNumber: String(request.phoneNumber || "").trim(),
        phoneCodeHash: String(request.phoneCodeHash || ""),
        codeDelivery: request.isCodeViaApp === true ? "app" : "sms",
        codeRequestedAt: isFiniteNumber(codeRequestedAt) && codeRequestedAt > 0 ? codeRequestedAt : Date.now(),
        telegramWebDcId: request.telegramWebDcId,
        telegramWebDcHost: request.telegramWebDcHost,
        telegramWebDcPort: request.telegramWebDcPort,
        forceWSS: request.forceWSS === true,
        authSessionString: request.authSessionString,
        passwordRequired: false,
        passwordHint: "",
        passwordChallenge: null
      });
    },
    setAuthPasswordRequired: function(request) {
      request = request || {};
      var currentAuthState = cache.getAuthState();
      var codeRequestedAt = Number(request.codeRequestedAt || currentAuthState.codeRequestedAt || 0);

      return cache.setAuthState(assign({}, currentAuthState, {
        errorMessage: "",
        phoneNumber: String(request.phoneNumber || currentAuthState.phoneNumber || "").trim(),
        phoneCodeHash: String(request.phoneCodeHash || currentAuthState.phoneCodeHash || ""),
        codeDelivery: request.codeDelivery || currentAuthState.codeDelivery || "",
        codeRequestedAt: isFiniteNumber(codeRequestedAt) && codeRequestedAt > 0 ? codeRequestedAt : Date.now(),
        telegramWebDcId: request.telegramWebDcId || currentAuthState.telegramWebDcId,
        telegramWebDcHost: request.telegramWebDcHost || currentAuthState.telegramWebDcHost,
        telegramWebDcPort: request.telegramWebDcPort || currentAuthState.telegramWebDcPort,
        forceWSS: request.forceWSS === true || currentAuthState.forceWSS === true,
        authSessionString: request.authSessionString || currentAuthState.authSessionString,
        passwordRequired: true,
        passwordHint: String(request.passwordHint || ""),
        passwordChallenge: request.passwordChallenge || null
      }));
    },
    getAuthState: function() {
      return cache.getAuthState();
    },
    getPendingAuthRequest: function(phoneNumber) {
      var authState = cache.getAuthState();
      var requestedPhoneNumber = String(authState.phoneNumber || "").trim();
      var nextPhoneNumber = String(phoneNumber || "").trim();

      if (!authState.phoneCodeHash || requestedPhoneNumber !== nextPhoneNumber) {
        return null;
      }

      return assign({}, authState);
    },
    getPendingAuthCodeHash: function(phoneNumber) {
      var authState = this.getPendingAuthRequest(phoneNumber);

      return authState ? String(authState.phoneCodeHash || "") : "";
    },
    clearAuthError: function() {
      cache.clearAuthState();
    },
    getConfigState: function() {
      return getConfigState();
    },
    sendMessage: async function(chatId, text) {
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
      var adapter = getTelegramAdapter();
      var ref = getChatRef(chatId);
      var sendResult;

      ensureFixtureCache();
      chatList = cache.getChatList();
      messagePages = cache.getMessagePages();
      nextText = String(text == null ? "" : text).trim();

      if (nextText.length === 0) {
        return { ok: false, detail: "Message cannot be empty." };
      }

      chat = findChat(chatId);
      if (!chat) {
        return { ok: false, detail: "Chat not found." };
      }

      if (adapter && adapter.isConfigured && adapter.isConfigured() && ref) {
        try {
          sendResult = await adapter.sendTextMessage({
            chatId: chatId,
            remoteRef: ref,
            text: nextText
          });

          if (!sendResult || sendResult.ok !== true) {
            return { ok: false, detail: "Telegram send failed." };
          }

          appendOutgoingMessageToCache(chatId, nextText);
          return { ok: true };
        } catch (error) {
          logger("sendTextMessage failed", error);
          return {
            ok: false,
            detail: error && error.message ? error.message : "Telegram send failed."
          };
        }
      }

      if (nextText.toLowerCase().indexOf("fail") >= 0) {
        return { ok: false, detail: "Fixture transport rejected the message." };
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
        if (String(chatList[index].id) === String(chatId)) {
          nextChats.push({
            id: chatList[index].id,
            remoteId: chatList[index].remoteId,
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
