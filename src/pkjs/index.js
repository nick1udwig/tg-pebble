var appLib = require("./lib/app");
var configPageLib = require("./lib/config_page");
var protocol = require("./lib/protocol");
var syncStateLib = require("./lib/sync_state");
var telegramAdapterLib = require("./lib/telegram/adapter");
var telegramAuthLib = require("./lib/telegram/auth");

var createPkjsApp = appLib.createPkjsApp;
var buildConfigPageUrl = configPageLib.buildConfigPageUrl;
var parseConfigPageResponse = configPageLib.parseConfigPageResponse;
var encodeMessage = protocol.encodeMessage;
var MessageType = protocol.MessageType;
var serializeChatItem = protocol.serializeChatItem;
var serializeMessageItem = protocol.serializeMessageItem;
var serializeSettingsState = protocol.serializeSettingsState;
var serializeSendResult = protocol.serializeSendResult;
var SyncState = syncStateLib.SyncState;
var createTelegramAdapter = telegramAdapterLib.createTelegramAdapter;
var authorizeTelegramSession = telegramAuthLib.authorizeTelegramSession;
var createTelegramClient = telegramAuthLib.createTelegramClient;
var revokeTelegramSession = telegramAuthLib.revokeTelegramSession;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function getErrorMessage(error, fallback) {
  if (error && error.message) {
    return String(error.message);
  }

  return String(fallback || "Unknown error.");
}

function loadTelegramEnvConfig() {
  var source = typeof process !== "undefined" && process && process.env ? process.env : {};
  var apiId = Number.parseInt(String(source.TG_API_ID || ""), 10);
  var apiHash = String(source.TG_API_HASH || "");
  var sessionString = String(source.TG_SESSION_STRING || "");

  if (!Number.isFinite(apiId) || !apiHash) {
    return null;
  }

  return {
    apiId: apiId,
    apiHash: apiHash,
    sessionString: sessionString,
    useWSS: parseBoolean(source.TG_TEST_USE_WSS, true),
    testServers: parseBoolean(source.TG_TEST_SERVERS, false),
    configUrl: String(source.TG_CONFIG_URL || "http://127.0.0.1:4173")
  };
}

function createTelegramClientFactory(config) {
  if (!config) {
    return null;
  }

  return function(session) {
    var sessionValue = typeof session === "string" ? session : (session && session.sessionString) || "";
    return createTelegramClient(config, sessionValue);
  };
}

function buildSettingsStatePayload() {
  var settingsState = app.getSettingsState();
  var configState = app.getConfigState();

  return {
    sendMode: settingsState.sendMode,
    previewChatMessage: settingsState.previewChatMessage === true,
    hasSession: configState.hasSession === true,
    hasAuthError: !!configState.authError
  };
}

var telegramEnvConfig = loadTelegramEnvConfig();
var telegramClientFactory = createTelegramClientFactory(telegramEnvConfig);

var app = createPkjsApp({
  storage: typeof localStorage !== "undefined" ? localStorage : null,
  fixtureMode: false,
  initialSession: telegramEnvConfig && telegramEnvConfig.sessionString ? { sessionString: telegramEnvConfig.sessionString } : null,
  telegramAdapterFactory: telegramEnvConfig ? function(session) {
    return createTelegramAdapter({
      enabled: true,
      sessionString: session && session.sessionString ? session.sessionString : "",
      clientFactory: telegramClientFactory
    });
  } : null
});

function log(message, extra) {
  console.log("[PKJS] " + message, extra || {});
}

function readPayloadValue(payload, numericKey, namedKey) {
  if (!payload) {
    return null;
  }
  if (payload[namedKey] !== undefined && payload[namedKey] !== null) {
    return payload[namedKey];
  }
  if (payload[numericKey] !== undefined && payload[numericKey] !== null) {
    return payload[numericKey];
  }
  if (payload[String(numericKey)] !== undefined && payload[String(numericKey)] !== null) {
    return payload[String(numericKey)];
  }
  return null;
}

function sendEnvelope(type, payloadString, requestId, syncState, onSuccess, onError) {
  var nextPayload = payloadString == null ? "" : payloadString;
  var nextRequestId = requestId == null ? 0 : requestId;
  var nextSyncState = syncState || app.getSyncState();

  Pebble.sendAppMessage(
    encodeMessage(type, nextPayload, nextRequestId, nextSyncState),
    onSuccess || function() {},
    onError || function(error) {
      log("sendAppMessage failed", error);
    }
  );
}

function sendSettingsState(syncState) {
  sendEnvelope(
    MessageType.settingsState,
    serializeSettingsState(buildSettingsStatePayload()),
    0,
    syncState || app.getSyncState()
  );
}

function rememberPhoneNumber(phoneNumber) {
  var nextPhoneNumber = String(phoneNumber || "").trim();
  var currentSession = app.getSession() || {};

  if (!nextPhoneNumber) {
    return;
  }

  app.setSession({
    sessionString: currentSession.sessionString || "",
    phoneNumber: nextPhoneNumber,
    accountLabel: currentSession.accountLabel || "",
    userId: currentSession.userId || ""
  });
}

function sendChatItems(chats, index, onComplete, onError) {
  if (index >= chats.length) {
    onComplete();
    return;
  }

  sendEnvelope(
    MessageType.chatItem,
    serializeChatItem(chats[index]),
    index,
    SyncState.syncing,
    function() {
      sendChatItems(chats, index + 1, onComplete, onError);
    },
    onError
  );
}

function sendMessageItems(messages, index, onComplete, onError) {
  if (index >= messages.length) {
    onComplete();
    return;
  }

  sendEnvelope(
    MessageType.messageItem,
    serializeMessageItem(messages[index]),
    index,
    SyncState.syncing,
    function() {
      sendMessageItems(messages, index + 1, onComplete, onError);
    },
    onError
  );
}

async function sendChatList() {
  var payload = await app.bootstrap();
  var chats = payload.chats || [];
  var settingsState = buildSettingsStatePayload();

  sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing, function() {
    sendEnvelope(MessageType.settingsState, serializeSettingsState(settingsState), 0, SyncState.syncing, function() {
      sendChatItems(
        chats,
        0,
        function() {
          app.refreshSucceeded();
          sendEnvelope(MessageType.chatListComplete, String(chats.length), chats.length, SyncState.synced);
        },
        function(error) {
          log("chat list send failed", error);
          app.refreshFailed();
        }
      );
    }, function(error) {
      log("settings state send failed", error);
      app.refreshFailed();
    });
  }, function(error) {
    log("sync status send failed", error);
    app.refreshFailed();
  });
}

async function sendChatPage(chatId) {
  var payload = await app.getChatPage(chatId);
  var messages = payload.messages || [];

  sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing, function() {
    sendMessageItems(
      messages,
      0,
      function() {
        app.refreshSucceeded();
        sendEnvelope(MessageType.chatPageComplete, String(payload.chatId), messages.length, SyncState.synced);
      },
      function(error) {
        log("chat page send failed", error);
        app.refreshFailed();
      }
    );
  }, function(error) {
    log("sync status send failed", error);
    app.refreshFailed();
  });
}

async function handleConfigSave(state) {
  var nextState = state || {};

  if (nextState.sendMode) {
    app.setSendMode(nextState.sendMode);
  }
  app.setPreviewChatMessage(nextState.previewChatMessage === true);
  rememberPhoneNumber(nextState.phoneNumber);

  if (nextState.phoneNumber && nextState.loginCode) {
    if (!telegramEnvConfig || typeof telegramClientFactory !== "function") {
      app.setAuthError("Telegram auth is not configured in this build.");
      app.refreshFailed();
      sendSettingsState(SyncState.desynced);
      return;
    }

    app.clearAuthError();
    app.refreshStarted();
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing);

    try {
      app.setSession(await authorizeTelegramSession(telegramEnvConfig, nextState, telegramClientFactory));
      app.clearAuthError();
      app.clearCache();
      await sendChatList();
    } catch (error) {
      log("Telegram config auth failed", error);
      app.setAuthError(getErrorMessage(error, "Telegram sign-in failed."));
      app.refreshFailed();
      sendSettingsState(SyncState.desynced);
      sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
    }
    return;
  }

  sendSettingsState(app.getSyncState());
}

async function handleLogoutAction() {
  var currentSession = app.getSession();

  if (telegramEnvConfig && currentSession && currentSession.sessionString) {
    try {
      await revokeTelegramSession(telegramEnvConfig, currentSession.sessionString, telegramClientFactory);
    } catch (error) {
      log("Telegram logout failed", error);
    }
  }

  app.clearAuthError();
  app.logout();
  sendEnvelope(
    MessageType.settingsState,
    serializeSettingsState({ sendMode: "preview", previewChatMessage: false, hasSession: false, hasAuthError: false }),
    0,
    SyncState.desynced,
    function() {
      sendEnvelope(MessageType.chatListComplete, "0", 0, SyncState.desynced);
    }
  );
}

async function handleConfigAction(actionPayload) {
  var action = actionPayload && actionPayload.action ? String(actionPayload.action) : "";
  var state = actionPayload && actionPayload.state ? actionPayload.state : {};

  switch (action) {
    case "config:save":
    case "auth:save":
      await handleConfigSave(state);
      break;
    case "settings:update":
      await handleConfigSave(state);
      break;
    case "cache:clear":
      app.clearCache();
      app.refreshStarted();
      await sendChatList();
      break;
    case "auth:logout":
      await handleLogoutAction();
      break;
    default:
      break;
  }
}

async function handleRequest(payload) {
  var type = readPayloadValue(payload, 0, "MessageType");
  var payloadString = readPayloadValue(payload, 1, "PayloadJson");

  if (payloadString == null) {
    payloadString = "";
  }

  switch (type) {
    case MessageType.appReady:
      app.refreshStarted();
      setTimeout(function() {
        sendChatList().catch(function(error) {
          log("sendChatList failed", error);
          app.refreshFailed();
        });
      }, 120);
      break;
    case MessageType.openChat:
      app.refreshStarted();
      setTimeout(function() {
        sendChatPage(payloadString).catch(function(error) {
          log("sendChatPage failed", error);
          app.refreshFailed();
        });
      }, 120);
      break;
    case MessageType.sendMessage: {
      var separatorIndex = payloadString.indexOf("|");
      var chatId = separatorIndex >= 0 ? payloadString.slice(0, separatorIndex) : payloadString;
      var text = separatorIndex >= 0 ? payloadString.slice(separatorIndex + 1) : "";
      var result = await app.sendMessage(chatId, text);

      if (result.ok) {
        sendEnvelope(MessageType.sendResult, serializeSendResult({ ok: true }), 0, app.getSyncState());
      } else {
        sendEnvelope(
          MessageType.sendResult,
          serializeSendResult({ ok: false, detail: result.detail }),
          0,
          SyncState.desynced
        );
      }
      break;
    }
    case MessageType.toggleSendMode:
      app.setSendMode(payloadString);
      sendSettingsState(app.getSyncState());
      break;
    case MessageType.toggleChatPreview:
      app.setPreviewChatMessage(payloadString === "1" || payloadString === "true" || payloadString === "on");
      sendSettingsState(app.getSyncState());
      break;
    case MessageType.clearCache:
      app.refreshStarted();
      app.clearCache();
      setTimeout(function() {
        sendChatList().catch(function(error) {
          log("sendChatList failed", error);
          app.refreshFailed();
        });
      }, 120);
      break;
    case MessageType.logout:
      await handleLogoutAction();
      break;
    default:
      log("unhandled request", { type: type, payloadString: payloadString });
      break;
  }
}

if (typeof Pebble !== "undefined" && Pebble.addEventListener) {
  Pebble.addEventListener("ready", function() {
    log("ready");
    app.refreshStarted();
  });

  Pebble.addEventListener("appmessage", function(event) {
    Promise.resolve(handleRequest(event.payload)).catch(function(error) {
      log("appmessage handling failed", error);
      app.refreshFailed();
    });
  });

  Pebble.addEventListener("showConfiguration", function() {
    var configUrl = buildConfigPageUrl(
      telegramEnvConfig && telegramEnvConfig.configUrl ? telegramEnvConfig.configUrl : "http://127.0.0.1:4173",
      app.getConfigState()
    );
    log("showConfiguration", { configUrl: configUrl });
    Pebble.openURL(configUrl);
  });

  Pebble.addEventListener("webviewclosed", function(event) {
    var response = parseConfigPageResponse(event && event.response ? event.response : null);

    log("webviewclosed", { response: response });
    if (!response) {
      return;
    }

    Promise.resolve(handleConfigAction(response)).catch(function(error) {
      log("config action failed", error);
      app.refreshFailed();
    });
  });
}

module.exports = {
  app: app,
  handleRequest: handleRequest
};
