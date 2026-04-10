function decodeStateValue(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(String(rawValue)));
  } catch (_error) {
    return null;
  }
}

function buildConfigPageUrl(baseUrl, state) {
  var separator = baseUrl.indexOf("?") >= 0 ? "&" : "?";
  var encodedState = encodeURIComponent(JSON.stringify(state || {}));

  return String(baseUrl || "") + separator + "state=" + encodedState;
}

function parseConfigPageResponse(response) {
  if (!response || response === "CANCELLED") {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(String(response)));
  } catch (_error) {
    return null;
  }
}

function readConfigPageState(search) {
  var query = String(search || "");
  var parts;
  var index;
  var keyValue;
  var key;
  var value;

  if (query.indexOf("?") === 0) {
    query = query.slice(1);
  }

  if (!query) {
    return null;
  }

  parts = query.split("&");
  for (index = 0; index < parts.length; index += 1) {
    keyValue = parts[index].split("=");
    key = decodeURIComponent(keyValue[0] || "");
    value = keyValue.slice(1).join("=");

    if (key === "state") {
      return decodeStateValue(value);
    }
  }

  return null;
}

module.exports = {
  buildConfigPageUrl: buildConfigPageUrl,
  parseConfigPageResponse: parseConfigPageResponse,
  readConfigPageState: readConfigPageState
};
