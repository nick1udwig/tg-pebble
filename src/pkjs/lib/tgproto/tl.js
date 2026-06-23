"use strict";

var pako = require("pako");

var bytes = require("./bytes");
var schema = require("./tl_schema");

var VECTOR_CONSTRUCTOR_ID = 0x1cb5c415;
var BOOL_FALSE_CONSTRUCTOR_ID = 0xbc799737;
var BOOL_TRUE_CONSTRUCTOR_ID = 0x997275b5;
var TRUE_CONSTRUCTOR_ID = 0x3fedd339;
var GZIP_PACKED_CONSTRUCTOR_ID = 0x3072cfa1;

var parsedSchema = null;

function lowerFirst(value) {
  return String(value || "").slice(0, 1).toLowerCase() + String(value || "").slice(1);
}

function upperFirst(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}

function toCamelName(value) {
  return String(value || "").replace(/_([a-zA-Z0-9])/g, function(_match, letter) {
    return letter.toUpperCase();
  });
}

function normalizeId(hex) {
  return parseInt(hex, 16) >>> 0;
}

function parseField(token) {
  var colon = token.indexOf(":");
  var name;
  var type;
  var flagMatch;

  if (colon < 0) {
    return null;
  }

  name = toCamelName(token.slice(0, colon));
  type = token.slice(colon + 1);

  if (name.indexOf("{") === 0 || name === "#") {
    return null;
  }

  if (type === "#") {
    return {
      name: name,
      type: "#",
      flagIndicator: true
    };
  }

  flagMatch = type.match(/^([A-Za-z0-9_]+)\.(\d+)\?(.+)$/);
  if (flagMatch) {
    return {
      name: name,
      type: flagMatch[3],
      flagName: flagMatch[1],
      flagIndex: Number(flagMatch[2]),
      optional: true
    };
  }

  return {
    name: name,
    type: type
  };
}

function parseTlLine(line, isFunction) {
  var match = line.match(/^([A-Za-z0-9_.]+)#([0-9a-fA-F]+)\s*(.*?)\s*=\s*([^;]+);?$/);
  var nameParts;
  var rawArgs;
  var fields = [];
  var index;
  var field;

  if (!match) {
    return null;
  }

  nameParts = match[1].split(".");
  rawArgs = match[3] ? match[3].trim().split(/\s+/) : [];
  for (index = 0; index < rawArgs.length; index += 1) {
    field = parseField(rawArgs[index]);
    if (field) {
      fields.push(field);
    }
  }

  return {
    tlName: match[1],
    namespace: nameParts.length > 1 ? nameParts[0] : "",
    bareName: nameParts[nameParts.length - 1],
    id: normalizeId(match[2]),
    fields: fields,
    result: match[4].trim(),
    isFunction: isFunction === true
  };
}

function addDefinition(out, def) {
  var pascalName;
  var camelName;
  var camelPascalName;
  var namespaceAlias;
  var namespaceCamelAlias;
  var namespaceCamelPascalAlias;

  if (!def) {
    return;
  }

  out.byId[def.id] = def;
  out.byName[def.tlName] = def;
  out.byName[def.bareName] = def;
  out.byBareName[def.bareName] = def;

  pascalName = upperFirst(def.bareName);
  camelName = toCamelName(def.bareName);
  camelPascalName = upperFirst(camelName);
  out.byName[pascalName] = def;
  out.byName[camelName] = def;
  out.byName[camelPascalName] = def;
  if (def.namespace) {
    namespaceAlias = def.namespace + "." + pascalName;
    namespaceCamelAlias = def.namespace + "." + camelName;
    namespaceCamelPascalAlias = def.namespace + "." + camelPascalName;
    out.byName[namespaceAlias] = def;
    out.byName[namespaceCamelAlias] = def;
    out.byName[namespaceCamelPascalAlias] = def;
  }
}

function parseTlSchema(content, out) {
  var lines = String(content || "").split(/\n/);
  var isFunction = false;
  var index;
  var line;

  for (index = 0; index < lines.length; index += 1) {
    line = lines[index].trim();
    if (!line) {
      continue;
    }
    if (line === "---functions---") {
      isFunction = true;
      continue;
    }
    if (line === "---types---") {
      isFunction = false;
      continue;
    }
    addDefinition(out, parseTlLine(line, isFunction));
  }
}

function getSchema() {
  if (!parsedSchema) {
    parsedSchema = {
      byId: {},
      byName: {},
      byBareName: {}
    };
    parseTlSchema(schema.apiTl, parsedSchema);
    parseTlSchema(schema.schemaTl, parsedSchema);
  }

  return parsedSchema;
}

function getDefinition(name) {
  var def = getSchema().byName[String(name || "")];

  if (!def) {
    throw new Error("Unknown TL object: " + name);
  }

  return def;
}

function getDefinitionById(id) {
  var def = getSchema().byId[Number(id) >>> 0];

  if (!def) {
    throw new Error("Unknown TL constructor: 0x" + (Number(id) >>> 0).toString(16));
  }

  return def;
}

function tlObject(className, args) {
  var out = { className: className };
  var key;

  args = args || {};
  for (key in args) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      out[key] = args[key];
    }
  }

  return out;
}

function getObjectName(object) {
  return object && (object.className || object._ || object.tlName || object.type);
}

function isVectorType(type) {
  return /^Vector<.+>$/.test(type) || /^vector<.+>$/.test(type);
}

function vectorItemType(type) {
  return String(type).replace(/^[Vv]ector</, "").replace(/>$/, "");
}

function usesVectorConstructor(type) {
  return /^Vector<.+>$/.test(type);
}

function isBareType(type) {
  var clean = String(type || "").replace(/^!/, "");
  var def = getSchema().byBareName[clean];

  return !!def && clean.slice(0, 1) === clean.slice(0, 1).toLowerCase();
}

function hasValue(value, type) {
  if (type === "true") {
    return value === true;
  }

  return value !== undefined && value !== null && value !== false;
}

function calculateFlags(object, fields, flagName) {
  var flags = 0;
  var index;
  var field;

  for (index = 0; index < fields.length; index += 1) {
    field = fields[index];
    if (field.optional && field.flagName === flagName && hasValue(object[field.name], field.type)) {
      flags |= (1 << field.flagIndex);
    }
  }

  return flags >>> 0;
}

function writeBool(writer, value) {
  writer.writeUInt32(value ? BOOL_TRUE_CONSTRUCTOR_ID : BOOL_FALSE_CONSTRUCTOR_ID);
}

function writeFixedLargeInt(writer, value, byteLength) {
  var raw;

  if (value instanceof Uint8Array) {
    raw = value;
  } else {
    raw = bytes.decimalToBytesLE(value == null ? "0" : value, byteLength);
  }

  if (raw.length !== byteLength) {
    throw new Error("Expected " + byteLength + " bytes for large TL integer.");
  }

  writer.writeRaw(raw);
}

function writeType(writer, type, value) {
  var itemType;
  var vector;
  var index;

  type = String(type || "");
  if (type.charAt(0) === "!") {
    type = type.slice(1);
  }

  if (isVectorType(type)) {
    itemType = vectorItemType(type);
    vector = value || [];
    if (usesVectorConstructor(type)) {
      writer.writeUInt32(VECTOR_CONSTRUCTOR_ID);
    }
    writer.writeInt32(vector.length);
    for (index = 0; index < vector.length; index += 1) {
      writeType(writer, itemType, vector[index]);
    }
    return;
  }

  if (type === "int" || type === "date") {
    writer.writeInt32(value || 0);
    return;
  }

  if (type === "long") {
    writer.writeInt64(value || "0");
    return;
  }

  if (type === "int128") {
    writeFixedLargeInt(writer, value, 16);
    return;
  }

  if (type === "int256") {
    writeFixedLargeInt(writer, value, 32);
    return;
  }

  if (type === "double") {
    writer.writeDouble(value || 0);
    return;
  }

  if (type === "string") {
    writer.writeString(value == null ? "" : value);
    return;
  }

  if (type === "bytes") {
    writer.writeTlBytes(value || new Uint8Array(0));
    return;
  }

  if (type === "Bool") {
    writeBool(writer, value === true);
    return;
  }

  if (type === "true") {
    return;
  }

  if (isBareType(type)) {
    writeBareObject(writer, type, value);
    return;
  }

  writeObject(writer, value);
}

function isBinaryStringField(def, field) {
  var name = field && field.name;
  var tlName = def && def.tlName;

  if (!def || !field || field.type !== "string") {
    return false;
  }

  if (tlName === "resPQ") {
    return name === "pq";
  }

  if (tlName === "p_q_inner_data" || tlName === "p_q_inner_data_dc" ||
      tlName === "p_q_inner_data_temp" || tlName === "p_q_inner_data_temp_dc") {
    return name === "pq" || name === "p" || name === "q";
  }

  if (tlName === "req_DH_params") {
    return name === "p" || name === "q" || name === "encryptedData";
  }

  if (tlName === "server_DH_params_ok") {
    return name === "encryptedAnswer";
  }

  if (tlName === "server_DH_inner_data") {
    return name === "dhPrime" || name === "gA";
  }

  if (tlName === "client_DH_inner_data") {
    return name === "gB";
  }

  if (tlName === "set_client_DH_params") {
    return name === "encryptedData";
  }

  return false;
}

function writeField(writer, def, field, value) {
  if (field.type === "string" && (isBinaryStringField(def, field) || value instanceof Uint8Array)) {
    writer.writeTlBytes(value || new Uint8Array(0));
    return;
  }

  writeType(writer, field.type, value);
}

function writeBareObjectDef(writer, def, object) {
  var index;
  var field;
  var flags = {};

  if (!def) {
    throw new Error("Unknown bare TL type.");
  }

  object = object || {};
  for (index = 0; index < def.fields.length; index += 1) {
    field = def.fields[index];
    if (field.flagIndicator) {
      flags[field.name] = calculateFlags(object, def.fields, field.name);
      writer.writeUInt32(flags[field.name]);
    } else if (!field.optional || (flags[field.flagName] & (1 << field.flagIndex)) !== 0) {
      writeField(writer, def, field, object[field.name]);
    }
  }
}

function writeBareObject(writer, type, object) {
  var def = getSchema().byBareName[String(type || "")];
  return writeBareObjectDef(writer, def, object);
}

function writeObject(writer, object) {
  var def = getDefinition(getObjectName(object));
  writer.writeUInt32(def.id);
  writeBareObjectDef(writer, def, object);
}

function serializeObject(object) {
  var writer = new bytes.ByteWriter();
  writeObject(writer, object);
  return writer.result();
}

function readBoolFromConstructor(id) {
  if ((id >>> 0) === BOOL_TRUE_CONSTRUCTOR_ID || (id >>> 0) === TRUE_CONSTRUCTOR_ID) {
    return true;
  }

  if ((id >>> 0) === BOOL_FALSE_CONSTRUCTOR_ID) {
    return false;
  }

  throw new Error("Unexpected Bool constructor: 0x" + (id >>> 0).toString(16));
}

function annotateReadError(error, path, reader) {
  var original = error || new Error("Unknown TL read error.");
  var baseMessage = original.tlBaseMessage || original.message || String(original);
  var innerPath = original.tlPath || "";
  var nextPath = path + (innerPath ? "." + innerPath : "");
  var wrapped = new Error(
    "TL read failed at " + nextPath +
    " (offset " + reader.offset + ", remaining " + reader.remaining() + "): " + baseMessage
  );

  wrapped.tlPath = nextPath;
  wrapped.tlBaseMessage = baseMessage;
  wrapped.cause = original;
  return wrapped;
}

function readType(reader, type) {
  var count;
  var itemType;
  var out;
  var index;
  var vectorId;

  type = String(type || "");
  if (type.charAt(0) === "!") {
    type = type.slice(1);
  }

  if (isVectorType(type)) {
    itemType = vectorItemType(type);
    if (usesVectorConstructor(type)) {
      vectorId = reader.readUInt32();
      if (vectorId !== VECTOR_CONSTRUCTOR_ID) {
        throw new Error("Unexpected Vector constructor: 0x" + vectorId.toString(16));
      }
    }
    count = reader.readInt32();
    if (count < 0) {
      throw new Error("Negative TL vector count: " + count);
    }
    out = [];
    for (index = 0; index < count; index += 1) {
      try {
        out.push(readType(reader, itemType));
      } catch (error) {
        throw annotateReadError(error, "Vector<" + itemType + ">[" + index + "]", reader);
      }
    }
    return out;
  }

  if (type === "int" || type === "date") {
    return reader.readInt32();
  }

  if (type === "long") {
    return reader.readInt64(true);
  }

  if (type === "int128") {
    return reader.readRaw(16);
  }

  if (type === "int256") {
    return reader.readRaw(32);
  }

  if (type === "double") {
    return reader.readDouble();
  }

  if (type === "string") {
    return reader.readString();
  }

  if (type === "bytes") {
    return reader.readTlBytes();
  }

  if (type === "Bool") {
    return readBoolFromConstructor(reader.readUInt32());
  }

  if (type === "true") {
    return true;
  }

  if (isBareType(type)) {
    return readBareObject(reader, type);
  }

  return readObject(reader);
}

function readBareObjectDef(reader, def) {
  var object;
  var flags = {};
  var index;
  var field;

  if (!def) {
    throw new Error("Unknown bare TL type.");
  }

  object = {
    className: def.namespace ? def.namespace + "." + upperFirst(def.bareName) : upperFirst(def.bareName),
    tlName: def.tlName
  };

  for (index = 0; index < def.fields.length; index += 1) {
    field = def.fields[index];
    try {
      if (field.flagIndicator) {
        flags[field.name] = reader.readUInt32();
        object[field.name] = flags[field.name];
      } else if (field.optional) {
        if ((flags[field.flagName] & (1 << field.flagIndex)) !== 0) {
          object[field.name] = field.type === "true" ? true : (
            isBinaryStringField(def, field) ? reader.readTlBytes() : readType(reader, field.type)
          );
        } else {
          object[field.name] = field.type === "true" ? false : null;
        }
      } else {
        object[field.name] = isBinaryStringField(def, field) ? reader.readTlBytes() : readType(reader, field.type);
      }
    } catch (error) {
      throw annotateReadError(error, def.tlName + "." + field.name, reader);
    }
  }

  return object;
}

function readBareObject(reader, type) {
  var def = getSchema().byBareName[String(type || "")];
  return readBareObjectDef(reader, def);
}

function readObject(reader) {
  var id = reader.readUInt32();
  var def;

  if (id === BOOL_TRUE_CONSTRUCTOR_ID || id === BOOL_FALSE_CONSTRUCTOR_ID || id === TRUE_CONSTRUCTOR_ID) {
    return readBoolFromConstructor(id);
  }

  if (id === GZIP_PACKED_CONSTRUCTOR_ID) {
    return deserializeObject(pako.inflate(reader.readTlBytes()));
  }

  def = getDefinitionById(id);
  return readBareObjectDef(reader, def);
}

function assertFullyRead(reader, context) {
  var remaining = reader.remaining();

  if (remaining > 0) {
    throw new Error("Trailing TL bytes after " + context + ": " + remaining);
  }
}

function deserializeObject(data) {
  var reader = new bytes.ByteReader(data);
  var object = readObject(reader);

  assertFullyRead(reader, "object");
  return object;
}

function deserializeResult(request, data) {
  var def = getDefinition(getObjectName(request));
  var reader = new bytes.ByteReader(data);
  var result = readType(reader, def.result || "Object");

  assertFullyRead(reader, def.tlName + " result");
  return result;
}

function createApiNamespace(namespace) {
  return new Proxy({}, {
    get: function(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      return function(args) {
        return tlObject(namespace ? namespace + "." + lowerFirst(property) : lowerFirst(property), args || {});
      };
    }
  });
}

var Api = new Proxy({}, {
  get: function(_target, property) {
    if (typeof property !== "string") {
      return undefined;
    }

    if (property === "auth" || property === "account" || property === "messages" ||
        property === "users" || property === "help" || property === "updates") {
      return createApiNamespace(property);
    }

    return function(args) {
      return tlObject(lowerFirst(property), args || {});
    };
  }
});

module.exports = {
  Api: Api,
  BOOL_FALSE_CONSTRUCTOR_ID: BOOL_FALSE_CONSTRUCTOR_ID,
  BOOL_TRUE_CONSTRUCTOR_ID: BOOL_TRUE_CONSTRUCTOR_ID,
  GZIP_PACKED_CONSTRUCTOR_ID: GZIP_PACKED_CONSTRUCTOR_ID,
  TRUE_CONSTRUCTOR_ID: TRUE_CONSTRUCTOR_ID,
  VECTOR_CONSTRUCTOR_ID: VECTOR_CONSTRUCTOR_ID,
  deserializeObject: deserializeObject,
  deserializeResult: deserializeResult,
  getDefinition: getDefinition,
  getDefinitionById: getDefinitionById,
  getSchema: getSchema,
  readObject: readObject,
  serializeObject: serializeObject,
  tlObject: tlObject,
  writeObject: writeObject
};
