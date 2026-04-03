var appLib = require("./lib/app");
var protocol = require("./lib/protocol");
var syncStateLib = require("./lib/sync_state");

var createPkjsApp = appLib.createPkjsApp;
var encodeMessage = protocol.encodeMessage;
var MessageType = protocol.MessageType;
var serializeChatItem = protocol.serializeChatItem;
var serializeMessageItem = protocol.serializeMessageItem;
var serializeSettingsState = protocol.serializeSettingsState;
var serializeSendResult = protocol.serializeSendResult;
var SyncState = syncStateLib.SyncState;

var app = createPkjsApp({
  storage: typeof localStorage !== "undefined" ? localStorage : null
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

function sendChatList() {
  var payload = app.bootstrap();
  var chats = payload.chats || [];
  var settingsState = app.getSettingsState();

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

function sendChatPage(chatId) {
  var payload = app.getChatPage(chatId);
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

function handleRequest(payload) {
  var type = readPayloadValue(payload, 0, "MessageType");
  var payloadString = readPayloadValue(payload, 1, "PayloadJson");

  if (payloadString == null) {
    payloadString = "";
  }

  switch (type) {
    case MessageType.appReady:
      app.refreshStarted();
      setTimeout(function() {
        sendChatList();
      }, 120);
      break;
    case MessageType.openChat:
      app.refreshStarted();
      setTimeout(function() {
        sendChatPage(payloadString);
      }, 120);
      break;
    case MessageType.sendMessage: {
      var separatorIndex = payloadString.indexOf("|");
      var chatId = separatorIndex >= 0 ? payloadString.slice(0, separatorIndex) : payloadString;
      var text = separatorIndex >= 0 ? payloadString.slice(separatorIndex + 1) : "";
      var result = app.sendMessage(chatId, text);

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
      sendEnvelope(MessageType.settingsState, serializeSettingsState(app.getSettingsState()), 0, app.getSyncState());
      break;
    case MessageType.toggleChatPreview:
      app.setPreviewChatMessage(payloadString === "1" || payloadString === "true" || payloadString === "on");
      sendEnvelope(MessageType.settingsState, serializeSettingsState(app.getSettingsState()), 0, app.getSyncState());
      break;
    case MessageType.clearCache:
      app.refreshStarted();
      app.rehydrateFixtures();
      setTimeout(function() {
        sendChatList();
      }, 120);
      break;
    case MessageType.logout:
      app.logout();
      sendEnvelope(
        MessageType.settingsState,
        serializeSettingsState({ sendMode: "preview", previewChatMessage: false }),
        0,
        SyncState.desynced,
        function() {
        sendEnvelope(MessageType.chatListComplete, "0", 0, SyncState.desynced);
        }
      );
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
    try {
      handleRequest(event.payload);
    } catch (error) {
      log("appmessage handling failed", error);
      app.refreshFailed();
    }
  });

  Pebble.addEventListener("showConfiguration", function() {
    var configUrl = "http://127.0.0.1:4173";
    log("showConfiguration", { configUrl: configUrl });
    Pebble.openURL(configUrl);
  });

  Pebble.addEventListener("webviewclosed", function(event) {
    log("webviewclosed", { response: event && event.response ? event.response : null });
  });
}

module.exports = {
  app: app,
  handleRequest: handleRequest
};
