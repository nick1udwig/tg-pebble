function copyMessage(message, showSender) {
  var result = {};
  var key;

  for (key in message) {
    if (Object.prototype.hasOwnProperty.call(message, key)) {
      result[key] = message[key];
    }
  }

  result.showSender = showSender;
  return result;
}

export function addSenderRunMetadata(messages) {
  var previousSenderId = null;
  var hasPrevious = false;
  var output = [];
  var index;
  var showSender;

  for (index = 0; index < messages.length; index += 1) {
    showSender = !hasPrevious || previousSenderId !== messages[index].senderId;
    previousSenderId = messages[index].senderId;
    hasPrevious = true;
    output.push(copyMessage(messages[index], showSender));
  }

  return output;
}
