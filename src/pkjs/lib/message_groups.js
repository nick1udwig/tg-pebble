export function addSenderRunMetadata(messages) {
  let previousSenderId = null;
  let hasPrevious = false;

  return messages.map((message) => {
    const showSender = !hasPrevious || previousSenderId !== message.senderId;
    previousSenderId = message.senderId;
    hasPrevious = true;

    return {
      ...message,
      showSender,
    };
  });
}

