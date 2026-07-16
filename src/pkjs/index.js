var appLib = require("./lib/app");
var configPageLib = require("./lib/config_page");
var numberLib = require("./lib/number");
var objectLib = require("./lib/object");
var protocol = require("./lib/protocol");
var runtimeConfigLib = require("./lib/runtime_config");
var syncStateLib = require("./lib/sync_state");

var createPkjsApp = appLib.createPkjsApp;
var buildConfigPageUrl = configPageLib.buildConfigPageUrl;
var parseConfigPageResponse = configPageLib.parseConfigPageResponse;
var encodeMessage = protocol.encodeMessage;
var MessageType = protocol.MessageType;
var loadTelegramRuntimeConfig = runtimeConfigLib.loadTelegramRuntimeConfig;
var isFiniteNumber = numberLib.isFiniteNumber;
var assign = objectLib.assign;
var propertyNames = objectLib.propertyNames;
var serializeChatItem = protocol.serializeChatItem;
var serializeChatPageError = protocol.serializeChatPageError;
var serializeMessageItem = protocol.serializeMessageItem;
var serializeSettingsState = protocol.serializeSettingsState;
var serializeSendResult = protocol.serializeSendResult;
var SyncState = syncStateLib.SyncState;
var compiledFixtureMode = (typeof __TG_PEBBLE_FIXTURE_MODE__ === "string" ? __TG_PEBBLE_FIXTURE_MODE__ : "false") === "true";
var telegramAdapterLib = null;
var telegramAuthLib = null;

function getTelegramAdapterLib() {
  if (!telegramAdapterLib) {
    telegramAdapterLib = require("./lib/telegram/adapter");
  }

  return telegramAdapterLib;
}

function getTelegramAuthLib() {
  if (!telegramAuthLib) {
    telegramAuthLib = require("./lib/telegram/auth");
  }

  return telegramAuthLib;
}

function createTelegramAdapter(options) {
  return getTelegramAdapterLib().createTelegramAdapter(options);
}

function authorizeTelegramSession() {
  return getTelegramAuthLib().authorizeTelegramSession.apply(null, arguments);
}

function completeTelegramPasswordAuth() {
  return getTelegramAuthLib().completeTelegramPasswordAuth.apply(null, arguments);
}

function createTelegramClient() {
  return getTelegramAuthLib().createTelegramClient.apply(null, arguments);
}

function requestTelegramLoginCode() {
  return getTelegramAuthLib().requestTelegramLoginCode.apply(null, arguments);
}

function revokeTelegramSession() {
  return getTelegramAuthLib().revokeTelegramSession.apply(null, arguments);
}

function isPasswordNeededError(error) {
  try {
    if (typeof getTelegramAuthLib().isPasswordNeededError === "function") {
      return getTelegramAuthLib().isPasswordNeededError(error);
    }
  } catch (_error) {}

  return !!(error && (error.passwordRequired === true || error.errorMessage === "SESSION_PASSWORD_NEEDED"));
}

function fallbackFingerprintText(value) {
  var text = String(value || "");
  var hash = 5381;
  var index;

  if (!text) {
    return "";
  }

  for (index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) >>> 0;
  }

  return String(text.length) + ":" + ("00000000" + hash.toString(16)).slice(-8);
}

function fingerprintText(value) {
  try {
    if (typeof getTelegramAuthLib().fingerprintText === "function") {
      return getTelegramAuthLib().fingerprintText(value);
    }
  } catch (_error) {}

  return fallbackFingerprintText(value);
}

function describeTelegramSessionString(sessionString) {
  var sessionValue = String(sessionString || "");

  try {
    if (typeof getTelegramAuthLib().describeTelegramSessionString === "function") {
      return getTelegramAuthLib().describeTelegramSessionString(sessionValue);
    }
  } catch (_error) {}

  return {
    authSessionLength: sessionValue.length,
    authSessionFp: fallbackFingerprintText(sessionValue),
    authSessionRestored: false,
    sessionDcId: "",
    sessionHost: "",
    sessionPort: "",
    hasAuthKey: false,
    authKeyLength: 0,
    authKeyIdFp: "",
    serverSaltPresent: false
  };
}

function buildAuthRequestDebug(authRequest) {
  var request = authRequest || {};
  var phoneCodeHash = String(request.phoneCodeHash || "");
  var codeRequestedAt = Number(request.codeRequestedAt || 0);
  var details = {
    codeRequestedAt: isFiniteNumber(codeRequestedAt) && codeRequestedAt > 0 ? codeRequestedAt : "",
    requestAgeMs: isFiniteNumber(codeRequestedAt) && codeRequestedAt > 0 ? Date.now() - codeRequestedAt : "",
    dcId: request.telegramWebDcId || "",
    host: request.telegramWebDcHost || "",
    port: request.telegramWebDcPort || "",
    forceWSS: request.forceWSS === true,
    phoneCodeHashLength: phoneCodeHash.length,
    phoneCodeHashFp: fingerprintText(phoneCodeHash)
  };

  return assign(details, describeTelegramSessionString(request.authSessionString));
}

function buildAuthAttemptDebug(authRequest, state) {
  var nextState = state || {};
  var loginCode = String(nextState.loginCode || "").trim();
  var passwordProof = nextState.passwordProof || {};

  return assign(buildAuthRequestDebug(authRequest), {
    loginCodeLength: loginCode.length,
    loginCodeNumeric: /^[0-9]+$/.test(loginCode),
    hasPassword: String(nextState.password || "").length > 0,
    hasPasswordProof: !!(passwordProof.srpId && passwordProof.A && passwordProof.M1),
    passwordProofAFp: passwordProof.A ? fingerprintText(passwordProof.A) : "",
    passwordProofM1Fp: passwordProof.M1 ? fingerprintText(passwordProof.M1) : ""
  });
}

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

  names = propertyNames(extra);
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

function getTelegramErrorCode(error) {
  return String(error && (error.errorMessage || error.error_message || error.message) || "").trim();
}

function isTerminalLoginCodeError(error) {
  var code = getTelegramErrorCode(error);
  return code === "PHONE_CODE_EXPIRED" || code === "PHONE_CODE_INVALID";
}

function createTelegramClientFactory(config, defaultSessionString) {
  if (!config) {
    return null;
  }

  return function(session) {
    var sessionValue = typeof session === "string" ? session : (session && session.sessionString) || "";
    if (!sessionValue && defaultSessionString) {
      sessionValue = String(defaultSessionString || "");
    }
    return createTelegramClient(config, sessionValue);
  };
}

function getAuthStep(configState) {
  if (configState.hasSession === true) {
    return "signed_in";
  }

  if (configState.authError) {
    return "error";
  }

  if (configState.passwordRequired === true) {
    return "password";
  }

  if (configState.codeRequested === true) {
    return "code";
  }

  return "phone";
}

function buildSettingsStatePayload() {
  var settingsState = app.getSettingsState();
  var configState = app.getConfigState();

  return {
    sendMode: settingsState.sendMode,
    previewChatMessage: settingsState.previewChatMessage === true,
    hasSession: configState.hasSession === true,
    hasAuthError: !!configState.authError,
    authStep: getAuthStep(configState)
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
      clientFactory: telegramClientFactory,
      logger: function(message, extra) {
        log(message, extra);
      }
    });
  } : null
});
var latestChatPageRequestId = 0;
var chatListSendPromise = null;
var chatListScheduleTimer = null;
var configActionPromise = null;

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

function summarizeConfigUrl(configUrl) {
  var value = String(configUrl || "");
  var queryIndex = value.indexOf("?");
  var fragmentIndex = value.indexOf("#");
  var endIndex = value.length;

  if (queryIndex >= 0 && queryIndex < endIndex) {
    endIndex = queryIndex;
  }
  if (fragmentIndex >= 0 && fragmentIndex < endIndex) {
    endIndex = fragmentIndex;
  }

  return {
    configUrlBase: value.slice(0, endIndex),
    hasState: value.indexOf("state=") >= 0
  };
}

function openConfiguration() {
  var configUrl = buildConfigPageUrl(
    telegramRuntimeConfig && telegramRuntimeConfig.configUrl ? telegramRuntimeConfig.configUrl : "http://127.0.0.1:4173",
    app.getConfigState(),
    Date.now()
  );
  log("showConfiguration", summarizeConfigUrl(configUrl));
  Pebble.openURL(configUrl);
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

var DIRECT_TELEGRAM_WEB_DC = {
  dcId: 2,
  host: "venus.web.telegram.org"
};

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

function buildTelegramWebDcCandidateFromAuthRequest(authRequest) {
  var dcId = Number(authRequest && authRequest.telegramWebDcId);
  var host = String(authRequest && authRequest.telegramWebDcHost ? authRequest.telegramWebDcHost : "").trim();
  var port = Number(authRequest && authRequest.telegramWebDcPort);

  if (!isFiniteNumber(dcId) || dcId <= 0 || !host || !isFiniteNumber(port) || port <= 0) {
    return null;
  }

  return {
    dcId: dcId,
    host: host,
    port: port,
    useWSS: authRequest.forceWSS === true || port === 443
  };
}

async function resolveTelegramRuntimeConfigForConnect(runtimeConfig) {
  var useWSS = runtimeConfig && runtimeConfig.forceWSS === true;
  var resolvedRuntimeConfig = cloneRuntimeConfigWithTelegramWebDc(runtimeConfig, {
    dcId: DIRECT_TELEGRAM_WEB_DC.dcId,
    host: DIRECT_TELEGRAM_WEB_DC.host,
    port: useWSS ? 443 : 80,
    useWSS: useWSS
  });

  if (resolvedRuntimeConfig && resolvedRuntimeConfig.telegramWebDcHost) {
    log("Telegram runtime endpoint selected", {
      dcId: resolvedRuntimeConfig.telegramWebDcId,
      host: resolvedRuntimeConfig.telegramWebDcHost,
      port: resolvedRuntimeConfig.telegramWebDcPort,
      forceWSS: resolvedRuntimeConfig.forceWSS === true,
      direct: true,
      webSocketWrapped: typeof WebSocket === "function" && WebSocket.__tgPebbleWrapped === true
    });
  }

  return resolvedRuntimeConfig;
}

async function resolveTelegramRuntimeConfigForAuthRequest(runtimeConfig, authRequest) {
  var candidate = buildTelegramWebDcCandidateFromAuthRequest(authRequest);
  var resolvedRuntimeConfig;

  if (!candidate) {
    return resolveTelegramRuntimeConfigForConnect(runtimeConfig);
  }

  resolvedRuntimeConfig = cloneRuntimeConfigWithTelegramWebDc(runtimeConfig, candidate);
  log("Telegram auth endpoint restored", {
    dcId: resolvedRuntimeConfig.telegramWebDcId,
    host: resolvedRuntimeConfig.telegramWebDcHost,
    port: resolvedRuntimeConfig.telegramWebDcPort,
    forceWSS: resolvedRuntimeConfig.forceWSS === true
  });
  return resolvedRuntimeConfig;
}

function applyTelegramRuntimeConfig(runtimeConfig) {
  telegramRuntimeConfig = runtimeConfig;
  telegramClientFactory = createTelegramClientFactory(telegramRuntimeConfig);
  return telegramClientFactory;
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

function sendMessageItems(messages, index, requestId, onComplete, onError) {
  if (requestId !== latestChatPageRequestId) {
    return;
  }

  if (index >= messages.length) {
    onComplete();
    return;
  }

  sendEnvelope(
    MessageType.messageItem,
    serializeMessageItem(messages[index], index),
    requestId,
    SyncState.syncing,
    function() {
      sendMessageItems(messages, index + 1, requestId, onComplete, onError);
    },
    onError
  );
}

function sendChatListPayload(payload, completionSyncState) {
  var chats = payload.chats || [];
  var settingsState = buildSettingsStatePayload();

  return new Promise(function(resolve, reject) {
    var settled = false;

    function fail(message, error) {
      if (settled) {
        return;
      }
      settled = true;
      log(message, error);
      reject(error || new Error(message));
    }

    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing, function() {
      sendEnvelope(MessageType.settingsState, serializeSettingsState(settingsState), 0, SyncState.syncing, function() {
        sendChatItems(
          chats,
          0,
          function() {
            sendEnvelope(
              MessageType.chatListComplete,
              String(chats.length),
              chats.length,
              completionSyncState,
              function() {
                if (settled) {
                  return;
                }
                settled = true;
                resolve(payload);
              },
              function(error) {
                fail("chat list completion send failed", error);
              }
            );
          },
          function(error) {
            fail("chat list send failed", error);
          }
        );
      }, function(error) {
        fail("settings state send failed", error);
      });
    }, function(error) {
      fail("sync status send failed", error);
    });
  });
}

async function sendChatListOnce() {
  var canRefresh;
  var cachedPayload;
  var refreshedPayload;

  try {
    canRefresh = app.canRefreshChatList();
    cachedPayload = app.getChatListSnapshot();
    await sendChatListPayload(cachedPayload, canRefresh ? SyncState.syncing : SyncState.synced);

    if (!canRefresh) {
      app.refreshSucceeded();
      return cachedPayload;
    }

    refreshedPayload = await app.refreshChatList();
    await sendChatListPayload(refreshedPayload, SyncState.synced);
    app.refreshSucceeded();
    return refreshedPayload;
  } catch (error) {
    app.refreshFailed();
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
    throw error;
  }
}

function sendChatList() {
  var pending;

  if (chatListSendPromise) {
    return chatListSendPromise;
  }

  pending = sendChatListOnce();
  chatListSendPromise = pending;
  pending.then(function() {
    if (chatListSendPromise === pending) {
      chatListSendPromise = null;
    }
  }, function() {
    if (chatListSendPromise === pending) {
      chatListSendPromise = null;
    }
  });
  return pending;
}

function scheduleChatListSend() {
  if (chatListScheduleTimer !== null) {
    return;
  }

  chatListScheduleTimer = setTimeout(function() {
    chatListScheduleTimer = null;
    sendChatList().catch(function(error) {
      log("sendChatList failed", error);
    });
  }, 120);
}

async function sendChatPage(chatId, requestId) {
  var payload = await app.getChatPage(chatId);
  var messages = payload.messages || [];

  if (requestId !== latestChatPageRequestId) {
    return;
  }

  sendEnvelope(MessageType.syncStatus, "", requestId, SyncState.syncing, function() {
    if (requestId !== latestChatPageRequestId) {
      return;
    }

    if (payload.errorMessage) {
      app.refreshFailed();
      sendEnvelope(
        MessageType.chatPageError,
        serializeChatPageError({ detail: payload.errorMessage }),
        requestId,
        SyncState.desynced
      );
      return;
    }

    sendMessageItems(
      messages,
      0,
      requestId,
      function() {
        if (requestId !== latestChatPageRequestId) {
          return;
        }
        app.refreshSucceeded();
        sendEnvelope(MessageType.chatPageComplete, String(messages.length), requestId, SyncState.synced);
      },
      function(error) {
        if (requestId !== latestChatPageRequestId) {
          return;
        }
        log("chat page send failed", error);
        app.refreshFailed();
      }
    );
  }, function(error) {
    if (requestId !== latestChatPageRequestId) {
      return;
    }
    log("sync status send failed", error);
    app.refreshFailed();
  });
}

async function handleConfigSave(state) {
  var nextState = state || {};
  var pendingAuthRequest;
  var resolvedRuntimeConfig;
  var resolvedTelegramClientFactory;
  var authErrorMessage;

  applyConfigSettings(nextState);

  if (nextState.phoneNumber && nextState.loginCode) {
    if (!telegramRuntimeConfig || typeof telegramClientFactory !== "function") {
      failAuthConfiguration("Telegram auth is not configured in this build.");
      return;
    }

    pendingAuthRequest = app.getPendingAuthRequest(nextState.phoneNumber);
    if (!pendingAuthRequest || !pendingAuthRequest.phoneCodeHash) {
      failAuthConfiguration("Request a Telegram login code first.");
      return;
    }

    app.refreshStarted();
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing);

    try {
      resolvedRuntimeConfig = await resolveTelegramRuntimeConfigForAuthRequest(telegramRuntimeConfig, pendingAuthRequest);
      resolvedTelegramClientFactory = createTelegramClientFactory(
        resolvedRuntimeConfig,
        pendingAuthRequest.authSessionString
      );
      applyTelegramRuntimeConfig(resolvedRuntimeConfig);
      log("Telegram config auth attempt", buildAuthAttemptDebug(pendingAuthRequest, nextState));
      app.setSession(await authorizeTelegramSession(
        resolvedRuntimeConfig,
        assign({}, nextState, {
          phoneCodeHash: pendingAuthRequest.phoneCodeHash,
          authSessionString: pendingAuthRequest.authSessionString,
          authStageLogger: function(message, extra) {
            log(message, extra);
          }
        }),
        resolvedTelegramClientFactory
      ));
      app.clearAuthError();
      app.clearCache();
      await sendChatList();
    } catch (error) {
      if (isPasswordNeededError(error) && error.passwordChallenge) {
        log("Telegram config auth requires 2FA", assign(
          buildAuthRequestDebug(pendingAuthRequest),
          {
            passwordHintPresent: !!error.passwordHint,
            passwordChallengePresent: true,
            passwordChallengeSrpId: error.passwordChallenge.srpId || "",
            passwordChallengePFp: fingerprintText(error.passwordChallenge.p || ""),
            passwordChallengeBFp: fingerprintText(error.passwordChallenge.srpB || "")
          }
        ));
        app.setAuthPasswordRequired(assign({}, pendingAuthRequest, {
          phoneNumber: nextState.phoneNumber,
          authSessionString: error.authSessionString || pendingAuthRequest.authSessionString,
          passwordHint: error.passwordHint || "",
          passwordChallenge: error.passwordChallenge
        }));
        app.refreshFailed();
        sendSettingsState(SyncState.desynced);
        sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
        setTimeout(function() {
          try {
            openConfiguration();
          } catch (openError) {
            log("Telegram 2FA config reopen failed", openError);
          }
        }, 250);
        return;
      }
      log("Telegram config auth failed", error);
      authErrorMessage = getErrorMessage(error, "Telegram sign-in failed.");
      app.setAuthError(authErrorMessage, {
        clearPendingAuth: isTerminalLoginCodeError(error)
      });
      app.refreshFailed();
      sendSettingsState(SyncState.desynced);
      sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
    }
    return;
  }

  sendSettingsState(app.getSyncState());
}

async function handleSubmitPasswordProof(state) {
  var nextState = state || {};
  var pendingAuthRequest;
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

  pendingAuthRequest = app.getPendingAuthRequest(nextState.phoneNumber);
  if (!pendingAuthRequest || !pendingAuthRequest.passwordRequired || !pendingAuthRequest.authSessionString) {
    failAuthConfiguration("Enter the login code before submitting 2FA.");
    return;
  }

  if (!nextState.passwordProof || !nextState.passwordProof.srpId || !nextState.passwordProof.A || !nextState.passwordProof.M1) {
    failAuthConfiguration("Telegram 2FA proof is missing.");
    return;
  }

  app.refreshStarted();
  sendEnvelope(MessageType.syncStatus, "", 0, SyncState.syncing);

  try {
    resolvedRuntimeConfig = await resolveTelegramRuntimeConfigForAuthRequest(telegramRuntimeConfig, pendingAuthRequest);
    resolvedTelegramClientFactory = createTelegramClientFactory(
      resolvedRuntimeConfig,
      pendingAuthRequest.authSessionString
    );
    applyTelegramRuntimeConfig(resolvedRuntimeConfig);
    log("Telegram config 2FA auth attempt", buildAuthAttemptDebug(pendingAuthRequest, nextState));
    app.setSession(await completeTelegramPasswordAuth(
      resolvedRuntimeConfig,
      assign({}, nextState, {
        phoneCodeHash: pendingAuthRequest.phoneCodeHash,
        authSessionString: pendingAuthRequest.authSessionString,
        authStageLogger: function(message, extra) {
          log(message, extra);
        }
      }),
      resolvedTelegramClientFactory
    ));
    app.clearAuthError();
    app.clearCache();
    await sendChatList();
  } catch (error) {
    log("Telegram config 2FA auth failed", error);
    app.setAuthError(getErrorMessage(error, "Telegram 2FA sign-in failed."));
    app.refreshFailed();
    sendSettingsState(SyncState.desynced);
    sendEnvelope(MessageType.syncStatus, "", 0, SyncState.desynced);
  }
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
    resolvedTelegramClientFactory = applyTelegramRuntimeConfig(resolvedRuntimeConfig);
    codeRequest = await requestTelegramLoginCode(resolvedRuntimeConfig, nextState, resolvedTelegramClientFactory);
    codeRequest.codeRequestedAt = Date.now();
    resolvedRuntimeConfig = await resolveTelegramRuntimeConfigForAuthRequest(resolvedRuntimeConfig, codeRequest);
    applyTelegramRuntimeConfig(resolvedRuntimeConfig);
    log("Telegram login code request succeeded", assign({
      isCodeViaApp: codeRequest.isCodeViaApp === true
    }, buildAuthRequestDebug(codeRequest)));
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
    serializeSettingsState({
      sendMode: "preview",
      previewChatMessage: false,
      hasSession: false,
      hasAuthError: false,
      authStep: "phone"
    }),
    0,
    SyncState.desynced,
    function() {
      sendEnvelope(MessageType.chatListComplete, "0", 0, SyncState.desynced);
    }
  );
}

async function handleConfigActionOnce(actionPayload) {
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
    case "auth:submit-password":
      await handleSubmitPasswordProof(state);
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

async function handleConfigAction(actionPayload) {
  var action = actionPayload && actionPayload.action ? String(actionPayload.action) : "";

  if (configActionPromise) {
    log("Telegram config action coalesced", { action: action, inFlight: true });
    return configActionPromise;
  }

  configActionPromise = handleConfigActionOnce(actionPayload);
  try {
    return await configActionPromise;
  } finally {
    configActionPromise = null;
  }
}

async function handleRequest(payload) {
  var type = readPayloadValue(payload, 0, "MessageType");
  var payloadString = readPayloadValue(payload, 1, "PayloadJson");
  var requestId = Number(readPayloadValue(payload, 2, "RequestId"));

  if (payloadString == null) {
    payloadString = "";
  }
  if (!isFiniteNumber(requestId) || requestId < 0) {
    requestId = 0;
  } else {
    requestId = requestId >>> 0;
  }

  switch (type) {
    case MessageType.appReady:
      app.refreshStarted();
      scheduleChatListSend();
      break;
    case MessageType.openChat:
      latestChatPageRequestId = requestId;
      app.refreshStarted();
      setTimeout(function() {
        sendChatPage(payloadString, requestId).catch(function(error) {
          if (requestId !== latestChatPageRequestId) {
            return;
          }
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
        sendEnvelope(MessageType.sendResult, serializeSendResult({ ok: true }), requestId, app.getSyncState());
      } else {
        sendEnvelope(
          MessageType.sendResult,
          serializeSendResult({ ok: false, detail: result.detail }),
          requestId,
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
      scheduleChatListSend();
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
    openConfiguration();
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
