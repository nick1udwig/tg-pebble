var runtime = require("./runtime");

var Api = runtime.Api;
var TelegramClient = runtime.TelegramClient;
var StringSession = runtime.StringSession;

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

    return {
      phoneNumber: phoneNumber,
      phoneCodeHash: sendCodeResult.phoneCodeHash,
      isCodeViaApp: sendCodeResult.isCodeViaApp === true
    };
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
        signInResult = await client.invoke(new Api.auth.SignIn({
          phoneNumber: phoneNumber,
          phoneCodeHash: phoneCodeHash,
          phoneCode: loginCode
        }));
        if (signInResult instanceof Api.auth.AuthorizationSignUpRequired) {
          throw new Error("Telegram sign-up is required. Create the account in Telegram first.");
        }
        me = signInResult && signInResult.user ? signInResult.user : null;
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
  requestTelegramLoginCode: requestTelegramLoginCode,
  revokeTelegramSession: revokeTelegramSession
};
