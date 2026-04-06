var telegram = require("telegram");
var sessions = require("telegram/sessions");

var Api = telegram.Api;
var TelegramClient = telegram.TelegramClient;
var StringSession = sessions.StringSession;

var REQUIRED_ENV_KEYS = Object.freeze([
  "TG_API_ID",
  "TG_API_HASH"
]);

var PLACEHOLDER_PATTERNS = Object.freeze({
  apiHash: /replace-with-api-hash/i,
  phoneNumber: /[XY]/i,
  phoneCode: /X/i
});

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseInteger(value) {
  var parsed = Number.parseInt(String(value == null ? "" : value), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function loadTelegramTestEnv(env) {
  var source = env || process.env;
  var apiId = parseInteger(source.TG_API_ID);
  var forceDcId = parseInteger(source.TG_TEST_FORCE_DC_ID);
  var forcePort = parseInteger(source.TG_TEST_FORCE_PORT);
  var testServers = parseBoolean(source.TG_TEST_SERVERS, true);
  var sessionString = String(source.TG_SESSION_STRING || "");
  var allowSendCode = parseBoolean(source.TG_TEST_ALLOW_SEND_CODE, testServers);
  var allowLogout = parseBoolean(source.TG_TEST_ALLOW_LOGOUT, false);
  var preferSignUp = parseBoolean(source.TG_TEST_PREFER_SIGN_UP, testServers);
  var missing = [];
  var errors = [];
  var key;

  for (key of REQUIRED_ENV_KEYS) {
    if (!source[key]) {
      missing.push(key);
    }
  }

  if (!Number.isFinite(apiId)) {
    missing.push("TG_API_ID");
  }

  if (source.TG_API_HASH && PLACEHOLDER_PATTERNS.apiHash.test(String(source.TG_API_HASH))) {
    errors.push("TG_API_HASH still contains the example placeholder value.");
  }

  if (allowSendCode && source.TG_TEST_PHONE) {
    if (PLACEHOLDER_PATTERNS.phoneNumber.test(String(source.TG_TEST_PHONE))) {
      errors.push("TG_TEST_PHONE still contains X/Y placeholder characters.");
    } else if (!/^\+?\d+$/.test(String(source.TG_TEST_PHONE))) {
      errors.push("TG_TEST_PHONE must contain only digits, optionally prefixed by '+'.");
    }
  }

  if (allowSendCode && source.TG_TEST_CODE) {
    if (PLACEHOLDER_PATTERNS.phoneCode.test(String(source.TG_TEST_CODE))) {
      errors.push("TG_TEST_CODE still contains example placeholder characters.");
    } else if (!/^\d+$/.test(String(source.TG_TEST_CODE))) {
      errors.push("TG_TEST_CODE must contain only digits.");
    }
  }

  if (allowSendCode) {
    if (!source.TG_TEST_PHONE) {
      missing.push("TG_TEST_PHONE");
    }

    if (!source.TG_TEST_CODE) {
      missing.push("TG_TEST_CODE");
    }
  }

  if (!testServers && !sessionString && !allowSendCode) {
    errors.push("Production Telegram tests require TG_SESSION_STRING unless TG_TEST_ALLOW_SEND_CODE=1 is explicitly set.");
  }

  return {
    enabled: parseBoolean(source.TG_TEST_ENABLE, false),
    apiId: apiId,
    apiHash: String(source.TG_API_HASH || ""),
    sessionString: sessionString,
    phoneNumber: String(source.TG_TEST_PHONE || ""),
    phoneCode: String(source.TG_TEST_CODE || ""),
    password: String(source.TG_TEST_PASSWORD || ""),
    firstName: String(source.TG_TEST_FIRST_NAME || "TG"),
    lastName: String(source.TG_TEST_LAST_NAME || "Pebble"),
    useWSS: parseBoolean(source.TG_TEST_USE_WSS, true),
    testServers: testServers,
    allowSendCode: allowSendCode,
    allowLogout: allowLogout,
    preferSignUp: preferSignUp,
    connectionRetries: Number.isFinite(parseInteger(source.TG_TEST_CONNECTION_RETRIES))
      ? parseInteger(source.TG_TEST_CONNECTION_RETRIES)
      : 3,
    requestRetries: Number.isFinite(parseInteger(source.TG_TEST_REQUEST_RETRIES))
      ? parseInteger(source.TG_TEST_REQUEST_RETRIES)
      : 3,
    reconnectRetries: Number.isFinite(parseInteger(source.TG_TEST_RECONNECT_RETRIES))
      ? parseInteger(source.TG_TEST_RECONNECT_RETRIES)
      : 0,
    forceDcId: Number.isFinite(forceDcId) ? forceDcId : null,
    forceServerAddress: String(source.TG_TEST_FORCE_SERVER_ADDRESS || ""),
    forcePort: Number.isFinite(forcePort) ? forcePort : null,
    missing: Array.from(new Set(missing)),
    errors: errors
  };
}

function canRunTelegramTestEnv(config) {
  return config.enabled === true && config.missing.length === 0 && config.errors.length === 0;
}

function createTelegramTestClient(config, sessionString) {
  var savedSession = sessionString || "";
  var client;

  if (!Number.isFinite(config.apiId)) {
    throw new Error("TG_API_ID must be set to a valid integer.");
  }

  if (!config.apiHash) {
    throw new Error("TG_API_HASH must be set.");
  }

  client = new TelegramClient(new StringSession(savedSession), config.apiId, config.apiHash, {
    connectionRetries: config.connectionRetries,
    requestRetries: config.requestRetries,
    reconnectRetries: config.reconnectRetries,
    useWSS: config.useWSS,
    testServers: config.testServers
  });

  if (config.forceDcId && config.forceServerAddress && config.forcePort) {
    var originalGetDc = client.getDC.bind(client);

    client.session.setDC(config.forceDcId, config.forceServerAddress, config.forcePort);
    client.getDC = async function(dcId, downloadDC, web) {
      if (dcId === config.forceDcId && !downloadDC && !web) {
        return {
          id: config.forceDcId,
          ipAddress: config.forceServerAddress,
          port: config.forcePort
        };
      }

      return originalGetDc(dcId, downloadDC, web);
    };
  }

  return client;
}

function isExistingAccountError(error) {
  var errorMessage = error && error.errorMessage;
  return errorMessage === "PHONE_NUMBER_OCCUPIED";
}

async function ensureTelegramTestClientConnected(client) {
  if (!client.connected) {
    await client.connect();
  }
}

async function sendTelegramTestCode(client, config) {
  var sendCodeResult;

  await ensureTelegramTestClientConnected(client);
  sendCodeResult = await client.sendCode({
    apiId: config.apiId,
    apiHash: config.apiHash
  }, config.phoneNumber, false);

  if (!sendCodeResult || typeof sendCodeResult.phoneCodeHash !== "string") {
    throw new Error("Failed to retrieve Telegram phone code hash.");
  }

  return sendCodeResult.phoneCodeHash;
}

async function signUpTelegramTestUser(client, config, phoneCodeHash) {
  return client.invoke(new Api.auth.SignUp({
    phoneNumber: config.phoneNumber,
    phoneCodeHash: phoneCodeHash,
    firstName: config.firstName,
    lastName: config.lastName
  }));
}

async function signInTelegramTestUser(client, config, phoneCodeHash) {
  return client.invoke(new Api.auth.SignIn({
    phoneNumber: config.phoneNumber,
    phoneCodeHash: phoneCodeHash,
    phoneCode: config.phoneCode
  }));
}

async function loginTelegramTestUser(client, config) {
  var phoneCodeHash;
  var signUpError = null;
  var signInResult;

  phoneCodeHash = await sendTelegramTestCode(client, config);

  if (config.preferSignUp) {
    try {
      await signUpTelegramTestUser(client, config, phoneCodeHash);
      return client.session.save();
    } catch (error) {
      signUpError = error;
      if (!isExistingAccountError(error)) {
        // Continue into sign-in anyway, to support cases where sign-up-first
        // touches state but the account already exists or Telegram expects sign-in.
      }
    }
  }

  signInResult = await signInTelegramTestUser(client, config, phoneCodeHash);
  if (signInResult instanceof Api.auth.AuthorizationSignUpRequired) {
    if (signUpError) {
      throw signUpError;
    }

    await signUpTelegramTestUser(client, config, phoneCodeHash);
  }

  return client.session.save();
}

async function restoreTelegramTestSession(client) {
  await client.connect();
  return client.isUserAuthorized();
}

async function logoutTelegramTestUser(client) {
  await client.invoke(new Api.auth.LogOut());
}

async function disconnectTelegramTestClient(client) {
  if (!client) {
    return;
  }

  try {
    await client.disconnect();
  } catch (_error) {
  }
}

module.exports = {
  REQUIRED_ENV_KEYS: REQUIRED_ENV_KEYS,
  canRunTelegramTestEnv: canRunTelegramTestEnv,
  createTelegramTestClient: createTelegramTestClient,
  disconnectTelegramTestClient: disconnectTelegramTestClient,
  loadTelegramTestEnv: loadTelegramTestEnv,
  loginTelegramTestUser: loginTelegramTestUser,
  logoutTelegramTestUser: logoutTelegramTestUser,
  restoreTelegramTestSession: restoreTelegramTestSession
};
