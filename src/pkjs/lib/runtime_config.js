var RUNTIME_CONFIG_STORAGE_KEY = "tg_pebble:runtime_config";
var DEFAULT_CONFIG_URL = "http://127.0.0.1:4173";
var numberLib = require("./number");
var isFiniteNumber = numberLib.isFiniteNumber;
var parseInteger = numberLib.parseInteger;

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseApiId(value) {
  var parsed = parseInteger(value);

  if (!isFiniteNumber(parsed)) {
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
  var useWSS;

  if (!source || typeof source !== "object") {
    return null;
  }

  apiIdValue = source.apiId !== undefined ? source.apiId : source.TG_API_ID;
  apiHashValue = source.apiHash !== undefined ? source.apiHash : source.TG_API_HASH;
  useWSSValue = source.forceWSS !== undefined
    ? source.forceWSS
    : (source.useWSS !== undefined ? source.useWSS : source.TG_TEST_USE_WSS);
  testServersValue = source.testServers !== undefined ? source.testServers : source.TG_TEST_SERVERS;
  configUrlValue = source.configUrl !== undefined ? source.configUrl : source.TG_CONFIG_URL;

  apiId = parseApiId(apiIdValue);
  apiHash = String(apiHashValue == null ? "" : apiHashValue).trim();

  if (apiId === null || !apiHash) {
    return null;
  }

  useWSS = parseBoolean(useWSSValue, true);

  return {
    apiId: apiId,
    apiHash: apiHash,
    sessionString: String(sessionString == null ? "" : sessionString),
    useWSS: useWSS,
    forceWSS: useWSS,
    testServers: parseBoolean(testServersValue, false),
    configUrl: String(configUrlValue == null || configUrlValue === "" ? DEFAULT_CONFIG_URL : configUrlValue)
  };
}

function getDefaultEnvSource() {
  if (typeof process !== "undefined" && process && process.env) {
    return process.env;
  }

  return null;
}

function getCompiledRuntimeConfig() {
  if (typeof __TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__ !== "undefined") {
    return __TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__;
  }

  return null;
}

function getDefaultEmbeddedSource() {
  if (typeof globalThis !== "undefined" && globalThis && globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__) {
    return globalThis.__TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__;
  }

  return getCompiledRuntimeConfig();
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
  var embeddedSource;
  var envConfig;
  var storedConfig;
  var embeddedConfig;
  var embeddedSessionString;

  options = options || {};
  envSource = Object.prototype.hasOwnProperty.call(options, "envSource") ? options.envSource : getDefaultEnvSource();
  storage = options.storage || null;
  embeddedSource = Object.prototype.hasOwnProperty.call(options, "embeddedSource")
    ? options.embeddedSource
    : getDefaultEmbeddedSource();

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

  embeddedSessionString = embeddedSource && embeddedSource.sessionString
    ? embeddedSource.sessionString
    : (embeddedSource ? embeddedSource.TG_SESSION_STRING : "");
  embeddedConfig = parseRuntimeConfigObject(embeddedSource, embeddedSessionString);
  if (embeddedConfig) {
    embeddedConfig.source = "embedded";
    return embeddedConfig;
  }

  return null;
}

module.exports = {
  DEFAULT_CONFIG_URL: DEFAULT_CONFIG_URL,
  RUNTIME_CONFIG_STORAGE_KEY: RUNTIME_CONFIG_STORAGE_KEY,
  loadTelegramRuntimeConfig: loadTelegramRuntimeConfig,
  parseRuntimeConfigObject: parseRuntimeConfigObject,
  readStoredRuntimeConfig: readStoredRuntimeConfig
};
