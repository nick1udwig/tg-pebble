var tgprotoClient = require("../tgproto/client");
var tgprotoSender = require("../tgproto/sender");
var tgprotoPassword = require("../tgproto/password");
var tgprotoSession = require("../tgproto/session");
var tl = require("../tgproto/tl");

var NativeTelegramClient = tgprotoClient.NativeTelegramClient;
var NativeMtProtoSender = tgprotoSender.NativeMtProtoSender;
var NativeTelegramSession = tgprotoSession.NativeTelegramSession;
var base64Decode = tgprotoSession.base64Decode;
var base64Encode = tgprotoSession.base64Encode;

function buildApiCredentials(runtimeConfig) {
  return {
    apiId: runtimeConfig.apiId,
    apiHash: runtimeConfig.apiHash
  };
}

function buildTelegramClientParams(runtimeConfig) {
  return {
    connectionRetries: runtimeConfig.connectionRetries == null ? 3 : runtimeConfig.connectionRetries,
    requestRetries: runtimeConfig.requestRetries == null ? 3 : runtimeConfig.requestRetries,
    reconnectRetries: runtimeConfig.reconnectRetries == null ? 0 : runtimeConfig.reconnectRetries,
    // Native tgproto uses Telegram's web WSS endpoint directly from PKJS.
    useWSS: runtimeConfig.forceWSS === true,
    testServers: runtimeConfig.testServers === true,
    deviceModel: String(runtimeConfig.deviceModel || "TG Pebble"),
    systemVersion: String(runtimeConfig.systemVersion || "Pebble PKJS"),
    appVersion: String(runtimeConfig.appVersion || "0.1"),
    langCode: String(runtimeConfig.langCode || "en"),
    systemLangCode: String(runtimeConfig.systemLangCode || "en")
  };
}

function seedTelegramWebDc(session, runtimeConfig) {
  var dcId;
  var host;
  var port;

  if (!session || typeof session.setDC !== "function" || !runtimeConfig) {
    return;
  }

  if (session.serverAddress) {
    return;
  }

  dcId = Number(runtimeConfig.telegramWebDcId);
  host = String(runtimeConfig.telegramWebDcHost || "").trim();
  port = Number(runtimeConfig.telegramWebDcPort);

  if (!Number.isFinite(dcId) || dcId <= 0 || !host || !Number.isFinite(port) || port <= 0) {
    return;
  }

  session.setDC(dcId, host, port);
}

function createTelegramClient(runtimeConfig, sessionString) {
  var client;
  var dcId;
  var host;
  var port;

  if (!runtimeConfig || !Number.isFinite(runtimeConfig.apiId) || !runtimeConfig.apiHash) {
    throw new Error("Telegram runtime config is incomplete.");
  }

  dcId = Number(runtimeConfig.telegramWebDcId || 2);
  host = String(runtimeConfig.telegramWebDcHost || "").trim();
  port = Number(runtimeConfig.telegramWebDcPort || 443);

  client = new NativeTelegramClient({
    apiId: runtimeConfig.apiId,
    apiHash: runtimeConfig.apiHash,
    dcId: dcId,
    host: host,
    port: port,
    sessionString: String(sessionString || ""),
    testServers: runtimeConfig.testServers === true,
    deviceModel: String(runtimeConfig.deviceModel || "TG Pebble"),
    systemVersion: String(runtimeConfig.systemVersion || "Pebble PKJS"),
    appVersion: String(runtimeConfig.appVersion || "0.1"),
    langCode: String(runtimeConfig.langCode || "en"),
    systemLangCode: String(runtimeConfig.systemLangCode || "en"),
    sender: runtimeConfig.sender || new NativeMtProtoSender({
      cryptoProvider: runtimeConfig.cryptoProvider || null
    }),
    passwordSrpProvider: runtimeConfig.passwordSrpProvider || tgprotoPassword.createPasswordSrpProvider({
      cryptoProvider: runtimeConfig.cryptoProvider || null
    })
  });

  seedTelegramWebDc(client.session, runtimeConfig);
  return client;
}

async function ensureTelegramClientConnected(client) {
  if (!client.connected && typeof client.connect === "function") {
    await client.connect();
  }
}

function formatAccountLabel(me) {
  var firstName;
  var lastName;
  var combined;

  if (!me) {
    return "";
  }

  firstName = String(me.firstName || "").trim();
  lastName = String(me.lastName || "").trim();
  combined = (firstName + " " + lastName).trim();

  if (combined) {
    return combined;
  }

  if (me.username) {
    return "@" + String(me.username);
  }

  return String(me.id || "");
}

function readTelegramWebDcFromClient(client, runtimeConfig) {
  var session = client && client.session;
  var dcId = Number(session && session.dcId);
  var host = String(session && session.serverAddress ? session.serverAddress : "").trim();
  var port = Number(session && session.port);

  if (!Number.isFinite(dcId) || dcId <= 0 || !host || !Number.isFinite(port) || port <= 0) {
    return {};
  }

  return {
    telegramWebDcId: dcId,
    telegramWebDcHost: host,
    telegramWebDcPort: port,
    forceWSS: runtimeConfig && runtimeConfig.forceWSS === true
  };
}

function readTelegramSessionString(client) {
  try {
    if (client && client.session && typeof client.session.save === "function") {
      return String(client.session.save() || "");
    }
  } catch (_error) {}

  return "";
}

function createPasswordNeededError(message, details) {
  var error = new Error(message || "2FA password is required for this Telegram account.");
  var key;

  error.name = "TelegramPasswordNeededError";
  error.errorMessage = "SESSION_PASSWORD_NEEDED";
  error.passwordRequired = true;
  details = details || {};
  for (key in details) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      error[key] = details[key];
    }
  }
  return error;
}

function isPasswordNeededError(error) {
  return !!(error && (error.passwordRequired === true || error.errorMessage === "SESSION_PASSWORD_NEEDED"));
}

function nowMs() {
  return Date.now ? Date.now() : new Date().getTime();
}

function emitAuthStage(authState, message, extra) {
  if (authState && typeof authState.authStageLogger === "function") {
    try {
      authState.authStageLogger(message, extra || {});
    } catch (_error) {}
  }
}

function fingerprintText(value) {
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

function describeTelegramSessionString(sessionString) {
  var sessionValue = String(sessionString || "");
  var description = {
    authSessionLength: sessionValue.length,
    authSessionFp: fingerprintText(sessionValue),
    authSessionRestored: false,
    sessionDcId: "",
    sessionHost: "",
    sessionPort: "",
    hasAuthKey: false,
    authKeyLength: 0,
    authKeyIdFp: "",
    serverSaltPresent: false
  };
  var session;

  if (!sessionValue) {
    return description;
  }

  try {
    session = new NativeTelegramSession(sessionValue);
    description.authSessionRestored = true;
    description.sessionDcId = session.dcId || "";
    description.sessionHost = session.serverAddress || "";
    description.sessionPort = session.port || "";
    description.hasAuthKey = !!(session.authKey && session.authKey.length);
    description.authKeyLength = session.authKey ? session.authKey.length : 0;
    description.authKeyIdFp = fingerprintText(session.authKeyId);
    description.serverSaltPresent = !!String(session.serverSalt || "");
  } catch (error) {
    description.authSessionDecodeError = error && error.message ? String(error.message) : "Unable to decode session.";
  }

  return description;
}

function bytesToConfigBase64(value) {
  if (!value) {
    return "";
  }
  return base64Encode(value instanceof Uint8Array ? value : new Uint8Array(value));
}

function encodePasswordChallenge(passwordInfo) {
  var algo = passwordInfo && passwordInfo.currentAlgo;
  var srpB = passwordInfo && (passwordInfo.srpB || passwordInfo.srp_B);

  if (!algo || !algo.p || !algo.salt1 || !algo.salt2 || !srpB || !passwordInfo.srpId) {
    throw new Error("Telegram password SRP data is incomplete.");
  }

  return {
    srpId: String(passwordInfo.srpId),
    hint: String(passwordInfo.hint || ""),
    g: Number(algo.g || 0),
    p: bytesToConfigBase64(algo.p),
    salt1: bytesToConfigBase64(algo.salt1),
    salt2: bytesToConfigBase64(algo.salt2),
    srpB: bytesToConfigBase64(srpB)
  };
}

function decodePasswordProof(passwordProof) {
  passwordProof = passwordProof || {};
  if (!passwordProof.srpId || !passwordProof.A || !passwordProof.M1) {
    throw new Error("Telegram 2FA proof is missing.");
  }

  return tl.Api.InputCheckPasswordSRP({
    srpId: String(passwordProof.srpId),
    A: base64Decode(passwordProof.A),
    M1: base64Decode(passwordProof.M1)
  });
}

function buildSessionResult(client, phoneNumber, me) {
  return {
    sessionString: client.session.save(),
    phoneNumber: phoneNumber,
    accountLabel: formatAccountLabel(me),
    userId: me && me.id != null ? String(me.id) : ""
  };
}

async function requestTelegramLoginCode(runtimeConfig, authState, clientFactory) {
  var nextAuthState = authState || {};
  var phoneNumber = String(nextAuthState.phoneNumber || "").trim();
  var client;
  var sendCodeResult;

  if (!phoneNumber) {
    throw new Error("Phone number is required.");
  }

  client = typeof clientFactory === "function"
    ? clientFactory("")
    : createTelegramClient(runtimeConfig, "");

  try {
    await ensureTelegramClientConnected(client);
    sendCodeResult = await client.sendCode(buildApiCredentials(runtimeConfig), phoneNumber, false);

    if (!sendCodeResult || typeof sendCodeResult.phoneCodeHash !== "string") {
      throw new Error("Failed to retrieve Telegram phone code hash.");
    }

    return Object.assign({
      phoneNumber: phoneNumber,
      phoneCodeHash: sendCodeResult.phoneCodeHash,
      isCodeViaApp: sendCodeResult.isCodeViaApp === true,
      authSessionString: readTelegramSessionString(client)
    }, readTelegramWebDcFromClient(client, runtimeConfig));
  } finally {
    if (client && typeof client.disconnect === "function") {
      await client.disconnect().catch(function() {});
    }
  }
}

async function authorizeTelegramSession(runtimeConfig, authState, clientFactory) {
  var nextAuthState = authState || {};
  var phoneNumber = String(nextAuthState.phoneNumber || "").trim();
  var loginCode = String(nextAuthState.loginCode || "").trim();
  var password = String(nextAuthState.password || "");
  var phoneCodeHash = String(nextAuthState.phoneCodeHash || "").trim();
  var authSessionString = String(nextAuthState.authSessionString || "");
  var client;
  var signInResult;
  var passwordInfo;
  var me;
  var startedAt;

  if (!phoneNumber) {
    throw new Error("Phone number is required.");
  }

  if (!loginCode) {
    throw new Error("Login code is required.");
  }

  client = typeof clientFactory === "function"
    ? clientFactory(authSessionString)
    : createTelegramClient(runtimeConfig, authSessionString);

  try {
    if (phoneCodeHash) {
      emitAuthStage(nextAuthState, "Telegram auth connect started", {});
      await ensureTelegramClientConnected(client);
      emitAuthStage(nextAuthState, "Telegram auth connect done", {});

      try {
        emitAuthStage(nextAuthState, "Telegram auth signIn started", {});
        signInResult = await client.signIn({
          phoneNumber: phoneNumber,
          phoneCodeHash: phoneCodeHash,
          phoneCode: loginCode
        });
        emitAuthStage(nextAuthState, "Telegram auth signIn done", {});
        me = signInResult && signInResult.user ? signInResult.user : signInResult;
      } catch (error) {
        if (!error || error.errorMessage !== "SESSION_PASSWORD_NEEDED") {
          throw error;
        }
        emitAuthStage(nextAuthState, "Telegram auth signIn requires 2FA", {});
        if (!password) {
          emitAuthStage(nextAuthState, "Telegram auth 2FA password info requested", {});
          passwordInfo = await client.getPasswordInfo();
          emitAuthStage(nextAuthState, "Telegram auth 2FA password info received", {});
          throw createPasswordNeededError("2FA password is required for this Telegram account.", {
            phoneNumber: phoneNumber,
            phoneCodeHash: phoneCodeHash,
            authSessionString: readTelegramSessionString(client),
            passwordHint: String(passwordInfo && passwordInfo.hint ? passwordInfo.hint : ""),
            passwordChallenge: encodePasswordChallenge(passwordInfo)
          });
        }
        emitAuthStage(nextAuthState, "Telegram auth 2FA started", {});
        startedAt = nowMs();
        me = await client.signInWithPassword(buildApiCredentials(runtimeConfig), {
          password: async function() {
            return password;
          },
          onPasswordInfo: async function() {
            emitAuthStage(nextAuthState, "Telegram auth 2FA password info received", {});
          },
          onComputeStart: async function() {
            startedAt = nowMs();
            emitAuthStage(nextAuthState, "Telegram auth 2FA SRP compute started", {});
          },
          onComputeDone: async function() {
            emitAuthStage(nextAuthState, "Telegram auth 2FA SRP compute done", {
              elapsedMs: nowMs() - startedAt
            });
          },
          onCheckStart: async function() {
            emitAuthStage(nextAuthState, "Telegram auth 2FA checkPassword started", {});
          },
          onCheckDone: async function() {
            emitAuthStage(nextAuthState, "Telegram auth 2FA checkPassword done", {});
          },
          onError: async function(passwordError) {
            throw passwordError;
          }
        });
        emitAuthStage(nextAuthState, "Telegram auth 2FA done", {});
      }

      if (!me) {
        emitAuthStage(nextAuthState, "Telegram auth getMe started", {});
        me = await client.getMe();
        emitAuthStage(nextAuthState, "Telegram auth getMe done", {});
      }

      return buildSessionResult(client, phoneNumber, me);
    }

    throw new Error("Request a Telegram login code first.");
  } finally {
    if (client && typeof client.disconnect === "function") {
      await client.disconnect().catch(function() {});
    }
  }
}

async function completeTelegramPasswordAuth(runtimeConfig, authState, clientFactory) {
  var nextAuthState = authState || {};
  var phoneNumber = String(nextAuthState.phoneNumber || "").trim();
  var authSessionString = String(nextAuthState.authSessionString || "");
  var passwordProof = nextAuthState.passwordProof || null;
  var client;
  var me;
  var passwordCheck;

  if (!phoneNumber) {
    throw new Error("Phone number is required.");
  }

  if (!authSessionString) {
    throw new Error("Telegram 2FA session is missing.");
  }

  passwordCheck = decodePasswordProof(passwordProof);
  client = typeof clientFactory === "function"
    ? clientFactory(authSessionString)
    : createTelegramClient(runtimeConfig, authSessionString);

  try {
    emitAuthStage(nextAuthState, "Telegram auth 2FA proof connect started", {});
    await ensureTelegramClientConnected(client);
    emitAuthStage(nextAuthState, "Telegram auth 2FA proof connect done", {});
    emitAuthStage(nextAuthState, "Telegram auth 2FA checkPassword started", {});
    me = await client.checkPassword(passwordCheck);
    emitAuthStage(nextAuthState, "Telegram auth 2FA checkPassword done", {});

    if (!me) {
      emitAuthStage(nextAuthState, "Telegram auth getMe started", {});
      me = await client.getMe();
      emitAuthStage(nextAuthState, "Telegram auth getMe done", {});
    }

    return buildSessionResult(client, phoneNumber, me);
  } finally {
    if (client && typeof client.disconnect === "function") {
      await client.disconnect().catch(function() {});
    }
  }
}

async function revokeTelegramSession(runtimeConfig, sessionString, clientFactory) {
  var client = typeof clientFactory === "function"
    ? clientFactory(sessionString)
    : createTelegramClient(runtimeConfig, sessionString);

  try {
    await client.connect();
    if (await client.isUserAuthorized()) {
      await client.logOut();
    }
  } finally {
    if (client && typeof client.disconnect === "function") {
      await client.disconnect().catch(function() {});
    }
  }
}

module.exports = {
  authorizeTelegramSession: authorizeTelegramSession,
  buildTelegramClientParams: buildTelegramClientParams,
  completeTelegramPasswordAuth: completeTelegramPasswordAuth,
  createTelegramClient: createTelegramClient,
  describeTelegramSessionString: describeTelegramSessionString,
  encodePasswordChallenge: encodePasswordChallenge,
  fingerprintText: fingerprintText,
  formatAccountLabel: formatAccountLabel,
  isPasswordNeededError: isPasswordNeededError,
  requestTelegramLoginCode: requestTelegramLoginCode,
  revokeTelegramSession: revokeTelegramSession
};
