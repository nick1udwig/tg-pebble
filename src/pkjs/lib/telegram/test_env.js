var auth = require("./auth");
var tgprotoClient = require("../tgproto/client");
var tl = require("../tgproto/tl");

var Api = tl.Api;
var createTelegramClient = auth.createTelegramClient;
var createInputPeer = tgprotoClient.createInputPeer;

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
  var allowSend = parseBoolean(source.TG_TEST_ALLOW_SEND, false);
  var targetPeer = String(source.TG_TEST_TARGET_PEER || "");
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

  if (!testServers && allowSend && (!targetPeer || targetPeer === "me")) {
    errors.push("Production send tests require TG_TEST_TARGET_PEER to reference a real dialog; Saved Messages (`me`) is not supported by this Telegram send path.");
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
    allowSend: allowSend,
    targetPeer: targetPeer,
    mutationTextPrefix: String(source.TG_TEST_MUTATION_TEXT_PREFIX || "[TG Pebble Test]"),
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
  var runtimeConfig;

  if (!Number.isFinite(config.apiId)) {
    throw new Error("TG_API_ID must be set to a valid integer.");
  }

  if (!config.apiHash) {
    throw new Error("TG_API_HASH must be set.");
  }

  runtimeConfig = {
    apiId: config.apiId,
    apiHash: config.apiHash,
    connectionRetries: config.connectionRetries,
    requestRetries: config.requestRetries,
    reconnectRetries: config.reconnectRetries,
    forceWSS: config.useWSS,
    testServers: config.testServers
  };
  if (config.forceDcId && config.forceServerAddress && config.forcePort) {
    runtimeConfig.telegramWebDcId = config.forceDcId;
    runtimeConfig.telegramWebDcHost = config.forceServerAddress;
    runtimeConfig.telegramWebDcPort = config.forcePort;
  }

  return createTelegramClient(runtimeConfig, savedSession);
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
  return client.invoke(Api.auth.SignUp({
    phoneNumber: config.phoneNumber,
    phoneCodeHash: phoneCodeHash,
    firstName: config.firstName,
    lastName: config.lastName
  }));
}

async function signInTelegramTestUser(client, config, phoneCodeHash) {
  return client.signIn({
    phoneNumber: config.phoneNumber,
    phoneCodeHash: phoneCodeHash,
    phoneCode: config.phoneCode
  });
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
  if (signInResult && signInResult.tlName === "auth.authorizationSignUpRequired") {
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

async function listTelegramDialogs(client, options) {
  var params = options || {};

  await ensureTelegramTestClientConnected(client);
  return client.getDialogs({
    limit: Number.isFinite(parseInteger(params.limit)) ? parseInteger(params.limit) : 20
  });
}

async function getTelegramDialogMessages(client, entity, options) {
  var params = options || {};

  await ensureTelegramTestClientConnected(client);
  return client.getMessages(entity, {
    limit: Number.isFinite(parseInteger(params.limit)) ? parseInteger(params.limit) : 20
  });
}

async function resolveTelegramPeer(client, peer) {
  var peerValue = peer || "";
  var parsed;

  await ensureTelegramTestClientConnected(client);

  if (peerValue && typeof peerValue === "object") {
    return createInputPeer(peerValue) || peerValue;
  }

  try {
    parsed = JSON.parse(String(peerValue));
    return createInputPeer(parsed) || parsed;
  } catch (_error) {}

  parsed = String(peerValue).match(/^(user|chat|channel):([^:]+)(?::([^:]+))?$/);
  if (parsed) {
    return createInputPeer({
      peerType: parsed[1],
      peerId: parsed[2],
      accessHash: parsed[3] || ""
    });
  }

  throw new Error("Native Telegram peer resolution requires a cached peer ref, JSON peer ref, or user:/chat:/channel: peer id.");
}

async function sendTelegramTextMessage(client, peer, text) {
  await ensureTelegramTestClientConnected(client);
  return client.sendMessage(peer || "me", {
    message: String(text == null ? "" : text)
  });
}

async function logoutTelegramTestUser(client) {
  await client.logOut();
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
  getTelegramDialogMessages: getTelegramDialogMessages,
  loadTelegramTestEnv: loadTelegramTestEnv,
  loginTelegramTestUser: loginTelegramTestUser,
  listTelegramDialogs: listTelegramDialogs,
  logoutTelegramTestUser: logoutTelegramTestUser,
  resolveTelegramPeer: resolveTelegramPeer,
  restoreTelegramTestSession: restoreTelegramTestSession,
  sendTelegramTextMessage: sendTelegramTextMessage
};
