"use strict";

function isFiniteNumber(value) {
  return typeof value === "number" && isFinite(value);
}

function parseInteger(value) {
  var parsed = parseInt(String(value == null ? "" : value), 10);
  return isFiniteNumber(parsed) ? parsed : NaN;
}

module.exports = {
  isFiniteNumber: isFiniteNumber,
  parseInteger: parseInteger
};
