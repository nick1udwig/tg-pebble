var objectLib = require("./object");

var freeze = objectLib.freeze;

var PLACEHOLDERS = freeze({
  photo: "Photo",
  sticker: "Sticker",
  voice: "Voice message",
  file: "File"
});

function toDisplayText(message) {
  if (!message) {
    return "";
  }

  if (message.text && message.text.trim().length > 0) {
    return message.text.trim();
  }

  return PLACEHOLDERS[message.kind] || "Unsupported message";
}

module.exports = {
  toDisplayText: toDisplayText
};
