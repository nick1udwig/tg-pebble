var appLib = require("./lib/app");
var configPageLib = require("./lib/config_page");
var protocol = require("./lib/protocol");
var runtimeConfigLib = require("./lib/runtime_config");
var syncStateLib = require("./lib/sync_state");
var telegramAdapterLib = require("./lib/telegram/adapter");
var telegramAuthLib = require("./lib/telegram/auth");

var createPkjsApp = appLib.createPkjsApp;
var buildConfigPageUrl = configPageLib.buildConfigPageUrl;
var parseConfigPageResponse = configPageLib.parseConfigPageResponse;
var encodeMessage = protocol.encodeMessage;
var MessageType = protocol.MessageType;
var loadTelegramRuntimeConfig = runtimeConfigLib.loadTelegramRuntimeConfig;
var serializeChatItem = protocol.serializeChatItem;
var serializeMessageItem = protocol.serializeMessageItem;
var serializeSettingsState = protocol.serializeSettingsState;
var serializeSendResult = protocol.serializeSendResult;
var SyncState = syncStateLib.SyncState;
var createTelegramAdapter = telegramAdapterLib.createTelegramAdapter;
var authorizeTelegramSession = telegramAuthLib.authorizeTelegramSession;
var createTelegramClient = telegramAuthLib.createTelegramClient;
var requestTelegramLoginCode = telegramAuthLib.requestTelegramLoginCode;
var revokeTelegramSession = telegramAuthLib.revokeTelegramSession;
var compiledFixtureMode = (typeof __TG_PEBBLE_FIXTURE_MODE__ === "string" ? __TG_PEBBLE_FIXTURE_MODE__ : "false") === "true";

function formatLogExtra(extra) {
  var summary = {};
  var names;
  var index;
  var name;

  if (extra == null) {
    return "";
  }

  if (typeof extra === "string") {
    return extra;
  }

  if (typeof extra !== "object") {
    return String(extra);
  }

  names = Object.getOwnPropertyNames(extra);
  for (index = 0; index < names.length; index += 1) {
    name = names[index];
    if (summary[name] === undefined) {
      try {
        summary[name] = String(extra[name]);
      } catch (_error) {
      }
    }
  }

  if (summary.name === undefined && extra.name != null) {
    summary.name = String(extra.name);
  }

  if (summary.message === undefined && extra.message != null) {
    summary.message = String(extra.message);
  }

  if (summary.stack === undefined && extra.stack != null) {
    summary.stack = String(extra.stack);
  }

  if (summary.stackTrace === undefined && extra.stackTrace != null) {
    summary.stackTrace = String(extra.stackTrace);
  }

  if (summary.stringValue === undefined) {
    try {
      summary.stringValue = String(extra);
    } catch (_error) {
    }
  }

  try {
    return JSON.stringify(summary);
  } catch (_error) {
    return String(extra);
  }
}

function getErrorMessage(error, fallback) {
  if (error && error.message) {
    return String(error.message);
  }

  return String(fallback || "Unknown error.");
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

var pkjsStorage = typeof localStorage !== "undefined" ? localStorage : null;
var telegramRuntimeConfig = loadTelegramRuntimeConfig({ storage: pkjsStorage });
var telegramClientFactory = createTelegramClientFactory(telegramRuntimeConfig);

var app = createPkjsApp({
  storage: pkjsStorage,
  fixtureMode: compiledFixtureMode,
  logger: function(message, extra) {
    log(message, extra);
  },
  initialSession: telegramRuntimeConfig && telegramRuntimeConfig.sessionString
    ? { sessionString: telegramRuntimeConfig.sessionString }
    : null,
  telegramAdapterFactory: telegramRuntimeConfig ? function(session) {
    return createTelegramAdapter({
      enabled: true,
      sessionString: session && session.sessionString ? session.sessionString : "",
      clientFactory: telegramClientFactory
    });
  } : null
});

function log(message, extra) {
  var detail = formatLogExtra(extra);

  if (detail) {
    console.log("[PKJS] " + message + " " + detail);
    return;
  }

  console.log("[PKJS] " + message);
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

function applyConfigSettings(nextState) {
  if (nextState.sendMode) {
    app.setSendMode(nextState.sendMode);
  }
  app.setPreviewChatMessage(nextState.previewChatMessage === true);
  rememberPhoneNumber(nextState.phoneNumber);
}

function failAuthConfiguration(message) {
  app.setAuthError(message);
  app.refreshFailed();
  sendSettingsState(SyncState.desynced);
  sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
}

var TELEGRAM_WEB_DCS = [
  { dcId: 1, host: "pluto.web.telegram.org" },
  { dcId: 2, host: "venus.web.telegram.org" },
  { dcId: 3, host: "aurora.web.telegram.org" },
  { dcId: 4, host: "vesta.web.telegram.org" },
  { dcId: 5, host: "flora.web.telegram.org" }
];

var WEBSOCKET_CONTROL_ENDPOINTS = [
  { label: "cloudpebble", url: "wss://cloudpebble-proxy.repebble.com/tool-v2" },
  { label: "postman-echo", url: "wss://ws.postman-echo.com/raw" }
];

function cloneRuntimeConfigWithTelegramWebDc(runtimeConfig, candidate) {
  var next = {};
  var key;

  for (key in runtimeConfig) {
    if (Object.prototype.hasOwnProperty.call(runtimeConfig, key)) {
      next[key] = runtimeConfig[key];
    }
  }

  next.forceWSS = candidate.useWSS === true;
  next.useWSS = candidate.useWSS === true;
  next.telegramWebDcId = candidate.dcId;
  next.telegramWebDcHost = candidate.host;
  next.telegramWebDcPort = candidate.port;

  return next;
}

function buildTelegramWebSocketProbeUrl(candidate, runtimeConfig) {
  var testSuffix = runtimeConfig && runtimeConfig.testServers === true ? "_test" : "";
  var scheme = candidate.useWSS === true ? "wss" : "ws";

  return scheme + "://" + candidate.host + ":" + candidate.port + "/apiws" + testSuffix;
}

function buildTelegramWebSocketProbeCandidates(runtimeConfig) {
  var preferWSS = runtimeConfig && runtimeConfig.forceWSS === true;
  var schemes = preferWSS ? [true, false] : [false, true];
  var candidates = [];
  var schemeIndex;
  var dcIndex;
  var useWSS;
  var dc;

  for (schemeIndex = 0; schemeIndex < schemes.length; schemeIndex += 1) {
    useWSS = schemes[schemeIndex];
    for (dcIndex = 0; dcIndex < TELEGRAM_WEB_DCS.length; dcIndex += 1) {
      dc = TELEGRAM_WEB_DCS[dcIndex];
      candidates.push({
        dcId: dc.dcId,
        host: dc.host,
        port: useWSS ? 443 : 80,
        useWSS: useWSS
      });
    }
  }

  return candidates;
}

function probeTelegramWebSocket(runtimeConfig) {
  var candidates;

  if (typeof WebSocket !== "function") {
    log("Telegram WebSocket probe skipped", "WebSocket is unavailable.");
    return Promise.resolve(runtimeConfig);
  }

  if (typeof process !== "undefined" && process && process.versions && process.versions.node) {
    log("Telegram WebSocket probe skipped", "Node.js runtime.");
    return Promise.resolve(runtimeConfig);
  }

  candidates = buildTelegramWebSocketProbeCandidates(runtimeConfig);
  startWebSocketControlProbes();
  log("Telegram WebSocket probe started", { candidateCount: candidates.length });

  return new Promise(function(resolve, reject) {
    var settled = false;
    var pending = candidates.length;
    var sockets = [];

    function closeSocket(socket) {
      try {
        if (socket) {
          socket.close();
        }
      } catch (_error) {}
    }

    function closeAll() {
      var index;

      for (index = 0; index < sockets.length; index += 1) {
        closeSocket(sockets[index]);
      }
    }

    function readSocketValue(socket, name) {
      if (!socket) {
        return "";
      }

      try {
        return String(socket[name]);
      } catch (_error) {
        return "unavailable";
      }
    }

    function markCandidateFailed(candidate, reason, socket) {
      if (settled) {
        return;
      }

      log("Telegram WebSocket probe candidate failed", {
        url: candidate.url,
        reason: reason,
        readyState: readSocketValue(socket, "readyState"),
        protocol: readSocketValue(socket, "protocol"),
        binaryType: readSocketValue(socket, "binaryType")
      });
      pending -= 1;

      if (pending > 0) {
        return;
      }

      settled = true;
      closeAll();
      reject(new Error("No Telegram WebSocket endpoint opened."));
    }

    function markCandidateOpened(candidate) {
      if (settled) {
        return;
      }

      settled = true;
      log("Telegram WebSocket probe selected", {
        dcId: candidate.dcId,
        host: candidate.host,
        port: candidate.port,
        url: candidate.url
      });
      closeAll();
      resolve(cloneRuntimeConfigWithTelegramWebDc(runtimeConfig, candidate));
    }

    candidates.forEach(function(candidate) {
      var socket;
      var timeout;
      var done = false;

      function fail(reason) {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timeout);
        markCandidateFailed(candidate, reason, socket);
      }

      function open() {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timeout);
        markCandidateOpened(candidate);
      }

      candidate.url = buildTelegramWebSocketProbeUrl(candidate, runtimeConfig);
      log("Telegram WebSocket probe candidate started", {
        dcId: candidate.dcId,
        host: candidate.host,
        port: candidate.port,
        url: candidate.url,
        subprotocol: "binary"
      });

      timeout = setTimeout(function() {
        fail("timeout");
        closeSocket(socket);
      }, 8000);

      try {
        socket = new WebSocket(candidate.url, "binary");
        try {
          socket.binaryType = "arraybuffer";
        } catch (_binaryTypeError) {}
        log("Telegram WebSocket probe candidate constructed", {
          url: candidate.url,
          readyState: readSocketValue(socket, "readyState"),
          protocol: readSocketValue(socket, "protocol"),
          binaryType: readSocketValue(socket, "binaryType")
        });
        sockets.push(socket);
      } catch (error) {
        fail(getErrorMessage(error, "open threw"));
        return;
      }

      socket.onopen = function() {
        open();
      };
      socket.onerror = function(error) {
        fail(getErrorMessage(error, "error"));
      };
      socket.onclose = function() {
        fail("closed");
      };
    });

    if (pending === 0 && !settled) {
      settled = true;
      reject(new Error("No Telegram WebSocket endpoint opened."));
    }
  });
}

function startWebSocketControlProbes() {
  var index;

  if (typeof WebSocket !== "function") {
    return;
  }

  for (index = 0; index < WEBSOCKET_CONTROL_ENDPOINTS.length; index += 1) {
    startWebSocketControlProbe(WEBSOCKET_CONTROL_ENDPOINTS[index]);
  }
}

function startWebSocketControlProbe(endpoint) {
  var socket;
  var done = false;
  var timeout;

  function readSocketValue(name) {
    if (!socket) {
      return "";
    }

    try {
      return String(socket[name]);
    } catch (_error) {
      return "unavailable";
    }
  }

  function finish(result, detail) {
    if (done) {
      return;
    }

    done = true;
    clearTimeout(timeout);
    log("WebSocket control probe " + result, {
      label: endpoint.label,
      url: endpoint.url,
      detail: String(detail || ""),
      readyState: readSocketValue("readyState"),
      protocol: readSocketValue("protocol"),
      binaryType: readSocketValue("binaryType")
    });
  }

  log("WebSocket control probe started", {
    label: endpoint.label,
    url: endpoint.url
  });

  timeout = setTimeout(function() {
    finish("timeout", "");
    try {
      if (socket) {
        socket.close();
      }
    } catch (_error) {}
  }, 6000);

  try {
    socket = new WebSocket(endpoint.url);
    try {
      socket.binaryType = "arraybuffer";
    } catch (_binaryTypeError) {}
  } catch (error) {
    finish("threw", getErrorMessage(error, "constructor threw"));
    return;
  }

  socket.onopen = function() {
    finish("opened", "");
    try {
      socket.close();
    } catch (_error) {}
  };
  socket.onerror = function(error) {
    finish("errored", getErrorMessage(error, "error"));
  };
  socket.onclose = function() {
    finish("closed", "");
  };
}

async function resolveTelegramRuntimeConfigForConnect(runtimeConfig) {
  var resolvedRuntimeConfig = await probeTelegramWebSocket(runtimeConfig);

  if (resolvedRuntimeConfig && resolvedRuntimeConfig.telegramWebDcHost) {
    log("Telegram runtime endpoint selected", {
      dcId: resolvedRuntimeConfig.telegramWebDcId,
      host: resolvedRuntimeConfig.telegramWebDcHost,
      port: resolvedRuntimeConfig.telegramWebDcPort,
      forceWSS: resolvedRuntimeConfig.forceWSS === true
    });
  }

  return resolvedRuntimeConfig;
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
  var phoneCodeHash;
  var resolvedRuntimeConfig;
  var resolvedTelegramClientFactory;

  applyConfigSettings(nextState);

  if (nextState.phoneNumber && nextState.loginCode) {
    if (!telegramRuntimeConfig || typeof telegramClientFactory !== "function") {
      failAuthConfiguration("Telegram auth is not configured in this build.");
      return;
    }

    phoneCodeHash = app.getPendingAuthCodeHash(nextState.phoneNumber);
    if (!phoneCodeHash) {
      failAuthConfiguration("Request a Telegram login code first.");
      return;
    }

    app.refreshStarted();
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing);

    try {
      resolvedRuntimeConfig = await resolveTelegramRuntimeConfigForConnect(telegramRuntimeConfig);
      resolvedTelegramClientFactory = createTelegramClientFactory(resolvedRuntimeConfig);
      app.setSession(await authorizeTelegramSession(
        resolvedRuntimeConfig,
        Object.assign({}, nextState, { phoneCodeHash: phoneCodeHash }),
        resolvedTelegramClientFactory
      ));
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

async function handleRequestLoginCode(state) {
  var nextState = state || {};
  var codeRequest;
  var resolvedRuntimeConfig;
  var resolvedTelegramClientFactory;

  applyConfigSettings(nextState);

  if (!nextState.phoneNumber) {
    failAuthConfiguration("Phone number is required.");
    return;
  }

  if (!telegramRuntimeConfig || typeof telegramClientFactory !== "function") {
    failAuthConfiguration("Telegram auth is not configured in this build.");
    return;
  }

  app.clearAuthError();
  app.refreshStarted();
  sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing);

  try {
    log("Telegram login code request started", {
      phoneNumberLength: String(nextState.phoneNumber || "").trim().length,
      runtimeConfigSource: telegramRuntimeConfig.source,
      forceWSS: telegramRuntimeConfig.forceWSS,
      testServers: telegramRuntimeConfig.testServers
    });
    resolvedRuntimeConfig = await resolveTelegramRuntimeConfigForConnect(telegramRuntimeConfig);
    resolvedTelegramClientFactory = createTelegramClientFactory(resolvedRuntimeConfig);
    codeRequest = await requestTelegramLoginCode(resolvedRuntimeConfig, nextState, resolvedTelegramClientFactory);
    log("Telegram login code request succeeded", {
      isCodeViaApp: codeRequest.isCodeViaApp === true
    });
    app.setAuthCodeRequest(codeRequest);
    sendSettingsState(SyncState.desynced);
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
  } catch (error) {
    log("Telegram login code request failed", error);
    app.setAuthError(getErrorMessage(error, "Telegram login code request failed."));
    app.refreshFailed();
    sendSettingsState(SyncState.desynced);
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
  }
}

async function handleLogoutAction() {
  var currentSession = app.getSession();

  if (telegramRuntimeConfig && currentSession && currentSession.sessionString) {
    try {
      await revokeTelegramSession(telegramRuntimeConfig, currentSession.sessionString, telegramClientFactory);
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
    case "auth:request-code":
      await handleRequestLoginCode(state);
      break;
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
    log("ready", {
      runtimeConfigSource: telegramRuntimeConfig ? telegramRuntimeConfig.source : "none",
      hasSession: !!(app.getSession() && app.getSession().sessionString)
    });
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
      telegramRuntimeConfig && telegramRuntimeConfig.configUrl ? telegramRuntimeConfig.configUrl : "http://127.0.0.1:4173",
      app.getConfigState(),
      Date.now()
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
