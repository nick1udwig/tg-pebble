import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const schema = require("../src/pkjs/lib/tgproto/tl_schema.js");
const outputUrl = new URL("../src/pkjs/lib/tgproto/tl_schema_compiled.js", import.meta.url);

function lowerFirst(value) {
  return String(value || "").slice(0, 1).toLowerCase() + String(value || "").slice(1);
}

function upperFirst(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}

function toCamelName(value) {
  return String(value || "").replace(/_([a-zA-Z0-9])/g, (_match, letter) => letter.toUpperCase());
}

function normalizeLookupName(value) {
  const parts = String(value || "").split(".");
  const last = parts.length - 1;

  parts[last] = lowerFirst(parts[last]);
  return parts.join(".");
}

function definitionNameHash(value, multiplier) {
  const stringValue = String(value || "");
  let hash = 0;

  for (let index = 0; index < stringValue.length; index += 1) {
    hash = ((hash * multiplier) + stringValue.charCodeAt(index)) & 0xffffff;
  }
  return hash;
}

function parseDefinitions(content) {
  const definitions = [];
  let isFunction = false;

  for (const rawLine of String(content || "").split(/\n/)) {
    const line = rawLine.trim();
    let match;
    let nameParts;

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

    match = line.match(/^([A-Za-z0-9_.]+)#([0-9a-fA-F]+)\s*(.*?)\s*=\s*([^;]+);?$/);
    if (!match) {
      continue;
    }

    nameParts = match[1].split(".");
    definitions.push({
      tlName: match[1],
      namespace: nameParts.length > 1 ? nameParts[0] : "",
      bareName: nameParts[nameParts.length - 1],
      id: Number.parseInt(match[2], 16) >>> 0,
      isFunction,
      source: line,
    });
  }

  return definitions;
}

function addNameAliases(byName, definition) {
  const pascalName = upperFirst(definition.bareName);
  const camelName = toCamelName(definition.bareName);
  const camelPascalName = upperFirst(camelName);

  byName.set(definition.tlName, definition);
  byName.set(definition.bareName, definition);
  byName.set(pascalName, definition);
  byName.set(camelName, definition);
  byName.set(camelPascalName, definition);
  if (definition.namespace) {
    byName.set(definition.namespace + "." + pascalName, definition);
    byName.set(definition.namespace + "." + camelName, definition);
    byName.set(definition.namespace + "." + camelPascalName, definition);
  }
}

function buildIndexes() {
  const definitions = [
    ...parseDefinitions(schema.apiTl),
    ...parseDefinitions(schema.schemaTl),
  ];
  const byId = new Map();
  const byName = new Map();
  const normalizedNames = new Map();

  for (const definition of definitions) {
    byId.set(definition.id, definition);
    addNameAliases(byName, definition);
  }

  for (const [name, definition] of byName) {
    normalizedNames.set(normalizeLookupName(name), definition.id);
  }

  return { byId, normalizedNames };
}

function findNameHashIndex(normalizedNames) {
  for (let multiplier = 31; multiplier < 10000; multiplier += 2) {
    const byHash = new Map();
    let hasConflict = false;

    for (const [name, id] of normalizedNames) {
      const hash = definitionNameHash(name, multiplier);
      if (byHash.has(hash) && byHash.get(hash) !== id) {
        hasConflict = true;
        break;
      }
      byHash.set(hash, id);
    }

    if (!hasConflict) {
      return { multiplier, byHash };
    }
  }

  throw new Error("Could not build a collision-free compiled TL name index.");
}

function writeUint16(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
}

function writeUint24(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
  out[offset + 2] = (value >>> 16) & 255;
}

function writeUint32(out, offset, value) {
  out[offset] = value & 255;
  out[offset + 1] = (value >>> 8) & 255;
  out[offset + 2] = (value >>> 16) & 255;
  out[offset + 3] = (value >>> 24) & 255;
}

function toBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function compileDefinitionIndex(definitions) {
  const records = new Uint8Array(definitions.length * 9);
  const sources = [];
  let sourceOffset = 0;

  definitions.forEach((definition, index) => {
    const source = (definition.isFunction ? "1" : "0") + definition.source;
    const recordOffset = index * 9;

    if (sourceOffset > 0xffffff || source.length > 0xffff) {
      throw new Error("Compiled TL definition index exceeded its packed integer range.");
    }
    writeUint32(records, recordOffset, definition.id);
    writeUint24(records, recordOffset + 4, sourceOffset);
    writeUint16(records, recordOffset + 7, source.length);
    sources.push(source);
    sourceOffset += source.length;
  });

  return {
    source: sources.join(""),
    indexBase64: toBase64(records),
  };
}

function compileNameIndex(normalizedNames) {
  const { multiplier, byHash } = findNameHashIndex(normalizedNames);
  const entries = [...byHash.entries()].sort((left, right) => left[0] - right[0]);
  const records = new Uint8Array(entries.length * 7);

  entries.forEach(([hash, id], index) => {
    const recordOffset = index * 7;
    writeUint24(records, recordOffset, hash);
    writeUint32(records, recordOffset + 3, id);
  });

  return {
    multiplier,
    indexBase64: toBase64(records),
  };
}

function renderCompiledSchema() {
  const { byId, normalizedNames } = buildIndexes();
  const definitions = [...byId.values()].sort((left, right) => left.id - right.id);
  const definitionIndex = compileDefinitionIndex(definitions);
  const nameIndex = compileNameIndex(normalizedNames);
  const lines = [
    "\"use strict\";",
    "",
    "// Generated by scripts/compile-tl-schema.mjs. Do not edit by hand.",
    "",
    `var API_LAYER = ${Number(schema.apiLayer)};`,
    `var DEFINITION_COUNT = ${definitions.length};`,
    `var NAME_COUNT = ${normalizedNames.size};`,
    `var NAME_HASH_MULTIPLIER = ${nameIndex.multiplier};`,
    `var DEFINITION_SOURCE = ${JSON.stringify(definitionIndex.source)};`,
    `var DEFINITION_INDEX_BASE64 = ${JSON.stringify(definitionIndex.indexBase64)};`,
    `var NAME_INDEX_BASE64 = ${JSON.stringify(nameIndex.indexBase64)};`,
    "var BASE64_ALPHABET = \"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/\";",
    "var s_definition_index = null;",
    "var s_name_index = null;",
    "",
    "function definitionNameHash(value) {",
    "  var stringValue = String(value || \"\");",
    "  var hash = 0;",
    "  var index;",
    "",
    "  for (index = 0; index < stringValue.length; index += 1) {",
    "    hash = ((hash * NAME_HASH_MULTIPLIER) + stringValue.charCodeAt(index)) & 0xffffff;",
    "  }",
    "  return hash;",
    "}",
    "",
    "function decodeBase64(value) {",
    "  var padding = value.slice(-2) === \"==\" ? 2 : (value.slice(-1) === \"=\" ? 1 : 0);",
    "  var out = new Uint8Array(Math.floor(value.length * 3 / 4) - padding);",
    "  var accumulator = 0;",
    "  var bits = 0;",
    "  var outOffset = 0;",
    "  var index;",
    "  var digit;",
    "",
    "  for (index = 0; index < value.length && value.charAt(index) !== \"=\"; index += 1) {",
    "    digit = BASE64_ALPHABET.indexOf(value.charAt(index));",
    "    if (digit < 0) { continue; }",
    "    accumulator = (accumulator << 6) | digit;",
    "    bits += 6;",
    "    if (bits >= 8) {",
    "      bits -= 8;",
    "      out[outOffset] = (accumulator >>> bits) & 255;",
    "      outOffset += 1;",
    "      accumulator = bits === 0 ? 0 : accumulator & ((1 << bits) - 1);",
    "    }",
    "  }",
    "  return out;",
    "}",
    "",
    "function readUint16(data, offset) {",
    "  return data[offset] | (data[offset + 1] << 8);",
    "}",
    "",
    "function readUint24(data, offset) {",
    "  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);",
    "}",
    "",
    "function readUint32(data, offset) {",
    "  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) |",
    "    (data[offset + 3] << 24)) >>> 0;",
    "}",
    "",
    "function findRecord(data, recordSize, key, readKey) {",
    "  var left = 0;",
    "  var right = (data.length / recordSize) - 1;",
    "  var middle;",
    "  var offset;",
    "  var candidate;",
    "",
    "  while (left <= right) {",
    "    middle = Math.floor((left + right) / 2);",
    "    offset = middle * recordSize;",
    "    candidate = readKey(data, offset);",
    "    if (candidate === key) { return offset; }",
    "    if (candidate < key) { left = middle + 1; } else { right = middle - 1; }",
    "  }",
    "  return -1;",
    "}",
    "",
    "function getDefinitionIdByName(name) {",
    "  var hash = definitionNameHash(name);",
    "  var offset;",
    "",
    "  if (!s_name_index) { s_name_index = decodeBase64(NAME_INDEX_BASE64); }",
    "  offset = findRecord(s_name_index, 7, hash, readUint24);",
    "  return offset < 0 ? null : readUint32(s_name_index, offset + 3);",
    "}",
    "",
    "function getDefinitionSourceById(id) {",
    "  var normalizedId = Number(id) >>> 0;",
    "  var offset;",
    "  var sourceOffset;",
    "  var sourceLength;",
    "",
    "  if (!s_definition_index) { s_definition_index = decodeBase64(DEFINITION_INDEX_BASE64); }",
    "  offset = findRecord(s_definition_index, 9, normalizedId, readUint32);",
    "  if (offset < 0) { return null; }",
    "  sourceOffset = readUint24(s_definition_index, offset + 4);",
    "  sourceLength = readUint16(s_definition_index, offset + 7);",
    "  return DEFINITION_SOURCE.slice(sourceOffset, sourceOffset + sourceLength);",
    "}",
    "",
    "module.exports = {",
    "  apiLayer: API_LAYER,",
    "  definitionCount: DEFINITION_COUNT,",
    "  definitionNameHash: definitionNameHash,",
    "  getDefinitionIdByName: getDefinitionIdByName,",
    "  getDefinitionSourceById: getDefinitionSourceById,",
    "  nameCount: NAME_COUNT",
    "};",
    "",
  ];

  return lines.join("\n");
}

const rendered = renderCompiledSchema();

if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== rendered) {
    throw new Error("Compiled TL schema is stale. Run: npm run build:tl-schema");
  }
  console.log("Compiled TL schema is current.");
} else {
  await writeFile(outputUrl, rendered, "utf8");
  console.log(`Wrote ${outputUrl.pathname}`);
}
