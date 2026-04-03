var telegram = require("telegram");
var sessions = require("telegram/sessions");

var Api = telegram.Api;
var TelegramClient = telegram.TelegramClient;
var StringSession = sessions.StringSession;

var REQUIRED_ENV_KEYS = Object.freeze([
  "TG_API_ID",
  "TG_API_HASH",
  "TG_TEST_PHONE",
  "TG_TEST_CODE"
]);

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
  var missing = [];
  var key;

  for (key of REQUIRED_ENV_KEYS) {
    if (!source[key]) {
      missing.push(key);
    }
  }

  if (!Number.isFinite(apiId)) {
    missing.push("TG_API_ID");
  }

  return {
    enabled: parseBoolean(source.TG_TEST_ENABLE, false),
    apiId: apiId,
    apiHash: String(source.TG_API_HASH || ""),
    phoneNumber: String(source.TG_TEST_PHONE || ""),
    phoneCode: String(source.TG_TEST_CODE || ""),
    password: String(source.TG_TEST_PASSWORD || ""),
    useWSS: parseBoolean(source.TG_TEST_USE_WSS, true),
    testServers: parseBoolean(source.TG_TEST_SERVERS, true),
    connectionRetries: Number.isFinite(parseInteger(source.TG_TEST_CONNECTION_RETRIES))
      ? parseInteger(source.TG_TEST_CONNECTION_RETRIES)
      : 3,
    requestRetries: Number.isFinite(parseInteger(source.TG_TEST_REQUEST_RETRIES))
      ? parseInteger(source.TG_TEST_REQUEST_RETRIES)
      : 3,
    reconnectRetries: Number.isFinite(parseInteger(source.TG_TEST_RECONNECT_RETRIES))
      ? parseInteger(source.TG_TEST_RECONNECT_RETRIES)
      : 0,
    missing: Array.from(new Set(missing))
  };
}

function canRunTelegramTestEnv(config) {
  return config.enabled === true && config.missing.length === 0;
}

function createTelegramTestClient(config, sessionString) {
  var savedSession = sessionString || "";

  if (!Number.isFinite(config.apiId)) {
    throw new Error("TG_API_ID must be set to a valid integer.");
  }

  if (!config.apiHash) {
    throw new Error("TG_API_HASH must be set.");
  }

  return new TelegramClient(new StringSession(savedSession), config.apiId, config.apiHash, {
    connectionRetries: config.connectionRetries,
    requestRetries: config.requestRetries,
    reconnectRetries: config.reconnectRetries,
    useWSS: config.useWSS,
    testServers: config.testServers
  });
}

async function loginTelegramTestUser(client, config) {
  var authError = null;

  await client.start({
    phoneNumber: async function() {
      return config.phoneNumber;
    },
    password: async function() {
      return config.password;
    },
    phoneCode: async function() {
      return config.phoneCode;
    },
    onError: async function(error) {
      authError = error;
      return true;
    }
  });

  if (authError) {
    throw authError;
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
