var runtime = require("./runtime");

var Api = runtime.Api;
var TelegramClient = runtime.TelegramClient;
var StringSession = runtime.StringSession;

function buildTelegramClientParams(runtimeConfig) {
  return {
    connectionRetries: runtimeConfig.connectionRetries == null ? 3 : runtimeConfig.connectionRetries,
    requestRetries: runtimeConfig.requestRetries == null ? 3 : runtimeConfig.requestRetries,
    reconnectRetries: runtimeConfig.reconnectRetries == null ? 0 : runtimeConfig.reconnectRetries,
    // The bundled PKJS runtime can complete plain WebSocket MTProto today.
    // WSS still fails in this environment, so only allow it when explicitly forced.
    useWSS: runtimeConfig.forceWSS === true,
    testServers: runtimeConfig.testServers === true,
    deviceModel: String(runtimeConfig.deviceModel || "TG Pebble"),
    systemVersion: String(runtimeConfig.systemVersion || "Pebble PKJS"),
    appVersion: String(runtimeConfig.appVersion || "0.1"),
    langCode: String(runtimeConfig.langCode || "en"),
    systemLangCode: String(runtimeConfig.systemLangCode || "en")
  };
}

function createTelegramClient(runtimeConfig, sessionString) {
  if (!runtimeConfig || !Number.isFinite(runtimeConfig.apiId) || !runtimeConfig.apiHash) {
    throw new Error("Telegram runtime config is incomplete.");
  }

  return new TelegramClient(
    new StringSession(String(sessionString || "")),
    runtimeConfig.apiId,
    runtimeConfig.apiHash,
    buildTelegramClientParams(runtimeConfig)
  );
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

async function authorizeTelegramSession(runtimeConfig, authState, clientFactory) {
  var nextAuthState = authState || {};
  var phoneNumber = String(nextAuthState.phoneNumber || "").trim();
  var loginCode = String(nextAuthState.loginCode || "").trim();
  var password = String(nextAuthState.password || "");
  var client = typeof clientFactory === "function"
    ? clientFactory("")
    : createTelegramClient(runtimeConfig, "");
  var me;

  if (!phoneNumber) {
    throw new Error("Phone number is required.");
  }

  if (!loginCode) {
    throw new Error("Login code is required.");
  }

  try {
    await client.start({
      phoneNumber: async function() {
        return phoneNumber;
      },
      phoneCode: async function() {
        return loginCode;
      },
      password: async function() {
        return password;
      },
      onError: async function(error) {
        throw error;
      }
    });

    me = await client.getMe();

    return {
      sessionString: client.session.save(),
      phoneNumber: phoneNumber,
      accountLabel: formatAccountLabel(me),
      userId: me && me.id != null ? String(me.id) : ""
    };
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
      await client.invoke(new Api.auth.LogOut());
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
  revokeTelegramSession: revokeTelegramSession
};
