"use strict";

function assign(target) {
  var output = target || {};
  var index;
  var source;
  var key;

  for (index = 1; index < arguments.length; index += 1) {
    source = arguments[index];
    if (!source) {
      continue;
    }

    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        output[key] = source[key];
      }
    }
  }

  return output;
}

function freeze(value) {
  if (typeof Object.freeze === "function") {
    return Object.freeze(value);
  }

  return value;
}

function keys(source) {
  var out = [];
  var key;

  source = source || {};
  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out.push(key);
    }
  }

  return out;
}

function propertyNames(source) {
  if (typeof Object.getOwnPropertyNames === "function") {
    return Object.getOwnPropertyNames(source);
  }

  return keys(source);
}

module.exports = {
  assign: assign,
  freeze: freeze,
  keys: keys,
  propertyNames: propertyNames
};
