import { describe, expect, it } from "vitest";

import compiledSchema from "../../../src/pkjs/lib/tgproto/tl_schema_compiled.js";
import rawSchema from "../../../src/pkjs/lib/tgproto/tl_schema.js";

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

function parseDefinitions(content) {
  const definitions = [];
  let isFunction = false;

  for (const rawLine of String(content || "").split(/\n/)) {
    const source = rawLine.trim();
    const match = source.match(/^([A-Za-z0-9_.]+)#([0-9a-fA-F]+)\s*(.*?)\s*=\s*([^;]+);?$/);

    if (source === "---functions---") {
      isFunction = true;
    } else if (source === "---types---") {
      isFunction = false;
    } else if (match) {
      const nameParts = match[1].split(".");
      definitions.push({
        tlName: match[1],
        namespace: nameParts.length > 1 ? nameParts[0] : "",
        bareName: nameParts.at(-1),
        id: Number.parseInt(match[2], 16) >>> 0,
        isFunction,
        source,
      });
    }
  }
  return definitions;
}

function addAliases(byName, definition) {
  const pascalName = upperFirst(definition.bareName);
  const camelName = toCamelName(definition.bareName);
  const camelPascalName = upperFirst(camelName);

  for (const name of [definition.tlName, definition.bareName, pascalName, camelName, camelPascalName]) {
    byName.set(name, definition);
  }
  if (definition.namespace) {
    for (const name of [pascalName, camelName, camelPascalName]) {
      byName.set(definition.namespace + "." + name, definition);
    }
  }
}

describe("compiled Telegram schema", () => {
  it("matches every raw definition and supported name alias", () => {
    const definitions = [
      ...parseDefinitions(rawSchema.apiTl),
      ...parseDefinitions(rawSchema.schemaTl),
    ];
    const byId = new Map();
    const byName = new Map();
    const normalizedNames = new Map();

    for (const definition of definitions) {
      byId.set(definition.id, definition);
      addAliases(byName, definition);
    }
    for (const [name, definition] of byName) {
      normalizedNames.set(normalizeLookupName(name), definition.id);
    }

    expect(compiledSchema.definitionCount).toBe(byId.size);
    expect(compiledSchema.nameCount).toBe(normalizedNames.size);
    for (const [id, definition] of byId) {
      expect(compiledSchema.getDefinitionSourceById(id)).toBe(
        (definition.isFunction ? "1" : "0") + definition.source
      );
    }
    for (const [name, id] of normalizedNames) {
      expect(compiledSchema.getDefinitionIdByName(name)).toBe(id);
    }
  });
});
