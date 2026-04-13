var RUNTIME_CONFIG_STORAGE_KEY = "tg_pebble:runtime_config";

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseApiId(value) {
  var parsed = Number.parseInt(String(value == null ? "" : value), 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseRuntimeConfigObject(source, sessionString) {
  var apiIdValue;
  var apiHashValue;
  var useWSSValue;
  var testServersValue;
  var configUrlValue;
  var apiId;
  var apiHash;

  if (!source || typeof source !== "object") {
    return null;
  }

  apiIdValue = source.apiId !== undefined ? source.apiId : source.TG_API_ID;
  apiHashValue = source.apiHash !== undefined ? source.apiHash : source.TG_API_HASH;
  useWSSValue = source.useWSS !== undefined ? source.useWSS : source.TG_TEST_USE_WSS;
  testServersValue = source.testServers !== undefined ? source.testServers : source.TG_TEST_SERVERS;
  configUrlValue = source.configUrl !== undefined ? source.configUrl : source.TG_CONFIG_URL;

  apiId = parseApiId(apiIdValue);
  apiHash = String(apiHashValue == null ? "" : apiHashValue).trim();

  if (apiId === null || !apiHash) {
    return null;
  }

  return {
    apiId: apiId,
    apiHash: apiHash,
    sessionString: String(sessionString == null ? "" : sessionString),
    useWSS: parseBoolean(useWSSValue, true),
    testServers: parseBoolean(testServersValue, false),
    configUrl: String(configUrlValue == null || configUrlValue === "" ? "http://127.0.0.1:4173" : configUrlValue)
  };
}

function getDefaultEnvSource() {
  if (typeof process !== "undefined" && process && process.env) {
    return process.env;
  }

  return null;
}

function readStoredRuntimeConfig(storage) {
  var raw;
  var parsed;
  var config;

  if (!storage || typeof storage.getItem !== "function") {
    return null;
  }

  raw = storage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  try {
    parsed = JSON.parse(String(raw));
  } catch (_error) {
    return null;
  }

  config = parseRuntimeConfigObject(parsed, "");
  if (!config) {
    return null;
  }

  config.source = "storage";
  return config;
}

function loadTelegramRuntimeConfig(options) {
  var envSource;
  var storage;
  var envConfig;
  var storedConfig;

  options = options || {};
  envSource = Object.prototype.hasOwnProperty.call(options, "envSource") ? options.envSource : getDefaultEnvSource();
  storage = options.storage || null;

  envConfig = parseRuntimeConfigObject(
    envSource,
    envSource ? envSource.TG_SESSION_STRING : ""
  );
  if (envConfig) {
    envConfig.source = "env";
    return envConfig;
  }

  storedConfig = readStoredRuntimeConfig(storage);
  if (storedConfig) {
    return storedConfig;
  }

  return null;
}

module.exports = {
  RUNTIME_CONFIG_STORAGE_KEY: RUNTIME_CONFIG_STORAGE_KEY,
  loadTelegramRuntimeConfig: loadTelegramRuntimeConfig,
  readStoredRuntimeConfig: readStoredRuntimeConfig
};
