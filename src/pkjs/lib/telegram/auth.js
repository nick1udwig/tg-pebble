var tgprotoClient = require("../tgproto/client");
var tgprotoSender = require("../tgproto/sender");
var tgprotoPassword = require("../tgproto/password");

var NativeTelegramClient = tgprotoClient.NativeTelegramClient;
var NativeMtProtoSender = tgprotoSender.NativeMtProtoSender;

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
  var client;
  var signInResult;
  var me;

  if (!phoneNumber) {
    throw new Error("Phone number is required.");
  }

  if (!loginCode) {
    throw new Error("Login code is required.");
  }

  client = typeof clientFactory === "function"
    ? clientFactory("")
    : createTelegramClient(runtimeConfig, "");

  try {
    if (phoneCodeHash) {
      await ensureTelegramClientConnected(client);

      try {
        signInResult = await client.signIn({
          phoneNumber: phoneNumber,
          phoneCodeHash: phoneCodeHash,
          phoneCode: loginCode
        });
        me = signInResult && signInResult.user ? signInResult.user : signInResult;
      } catch (error) {
        if (!error || error.errorMessage !== "SESSION_PASSWORD_NEEDED") {
          throw error;
        }
        if (!password) {
          throw new Error("2FA password is required for this Telegram account.");
        }
        me = await client.signInWithPassword(buildApiCredentials(runtimeConfig), {
          password: async function() {
            return password;
          },
          onError: async function(passwordError) {
            throw passwordError;
          }
        });
      }

      if (!me) {
        me = await client.getMe();
      }

      return {
        sessionString: client.session.save(),
        phoneNumber: phoneNumber,
        accountLabel: formatAccountLabel(me),
        userId: me && me.id != null ? String(me.id) : ""
      };
    }

    throw new Error("Request a Telegram login code first.");
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
  createTelegramClient: createTelegramClient,
  formatAccountLabel: formatAccountLabel,
  requestTelegramLoginCode: requestTelegramLoginCode,
  revokeTelegramSession: revokeTelegramSession
};
