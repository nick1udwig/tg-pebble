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

module.exports = {
  assign: assign
};
