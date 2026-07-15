var objectLib = require("./object");
var syncStateLib = require("./sync_state");

var freeze = objectLib.freeze;
var SyncState = syncStateLib.SyncState;

var MessageType = freeze({
  appReady: "app_ready",
  openChat: "open_chat",
  chatItem: "chat_item",
  chatListComplete: "chat_list_complete",
  messageItem: "message_item",
  chatPageComplete: "chat_page_complete",
  chatPageError: "chat_page_error",
  syncStatus: "sync_status",
  settingsState: "settings_state",
  toggleSendMode: "toggle_send_mode",
  toggleChatPreview: "toggle_chat_preview",
  clearCache: "clear_cache",
  logout: "logout",
  sendMessage: "send_message",
  sendResult: "send_result"
});

var AppMessageKey = freeze({
  type: 0,
  payloadString: 1,
  requestId: 2,
  syncState: 3
});

var ProtocolByteLimit = freeze({
  chatTitle: 31,
  chatPreview: 63,
  messageSender: 23,
  messageText: 95,
  chatPageErrorDetail: 95,
  sendResultDetail: 95
});

function utf8ByteLength(value) {
  var length = 0;
  var text = String(value == null ? "" : value);
  var index;
  var code;
  var next;

  for (index = 0; index < text.length; index += 1) {
    code = text.charCodeAt(index);

    if (code <= 0x7F) {
      length += 1;
      continue;
    }

    if (code <= 0x7FF) {
      length += 2;
      continue;
    }

    if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
      next = text.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        length += 4;
        index += 1;
        continue;
      }
    }

    length += 3;
  }

  return length;
}

function truncateUtf8(value, maxBytes) {
  var text = String(value == null ? "" : value);
  var length = 0;
  var end = 0;
  var index;
  var code;
  var next;
  var codeUnitLength;
  var codeByteLength;

  if (maxBytes == null || maxBytes < 0) {
    return text;
  }

  for (index = 0; index < text.length; index += codeUnitLength) {
    code = text.charCodeAt(index);
    codeUnitLength = 1;
    codeByteLength = 1;

    if (code <= 0x7F) {
      codeByteLength = 1;
    } else if (code <= 0x7FF) {
      codeByteLength = 2;
    } else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
      next = text.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        codeUnitLength = 2;
        codeByteLength = 4;
      } else {
        codeByteLength = 3;
      }
    } else {
      codeByteLength = 3;
    }

    if (length + codeByteLength > maxBytes) {
      break;
    }

    length += codeByteLength;
    end = index + codeUnitLength;
  }

  return text.slice(0, end);
}

function sanitizeField(value, maxBytes) {
  return truncateUtf8(
    String(value == null ? "" : value)
      .replace(/\|/g, "/")
      .replace(/\r?\n/g, " ")
      .trim(),
    maxBytes
  );
}

function encodeMessage(type, payloadString, requestId, syncState) {
  var message = {};

  if (payloadString == null) {
    payloadString = "";
  }
  if (requestId == null) {
    requestId = 0;
  }
  if (!syncState) {
    syncState = SyncState.desynced;
  }

  message[AppMessageKey.type] = type;
  message[AppMessageKey.payloadString] = payloadString;
  message[AppMessageKey.requestId] = requestId;
  message[AppMessageKey.syncState] = syncState;
  return message;
}

function buildChatListPagePayload(params) {
  var syncState = params.syncState || SyncState.synced;

  return {
    type: "chat_list_page",
    syncState: syncState,
    chats: params.chats
  };
}

function buildChatPagePayload(params) {
  var syncState = params.syncState || SyncState.synced;
  var hasOlder = params.hasOlder === true;

  return {
    type: "chat_page",
    syncState: syncState,
    chatId: params.chatId,
    hasOlder: hasOlder,
    messages: params.messages
  };
}

function serializeChatItem(chat) {
  return [
    sanitizeField(chat.id),
    sanitizeField(chat.title, ProtocolByteLimit.chatTitle),
    sanitizeField(chat.preview, ProtocolByteLimit.chatPreview),
    sanitizeField(chat.unreadCount)
  ].join("|");
}

function serializeMessageItem(message, index) {
  return [
    sanitizeField(index == null ? 0 : index),
    sanitizeField(message.senderName, ProtocolByteLimit.messageSender),
    message.showSender ? "1" : "0",
    message.outgoing ? "1" : "0",
    sanitizeField(message.text, ProtocolByteLimit.messageText)
  ].join("|");
}

function serializeChatPageError(error) {
  return sanitizeField(error && error.detail ? error.detail : "Chat load failed.", ProtocolByteLimit.chatPageErrorDetail);
}

function serializeSendResult(result) {
  if (result.ok) {
    return "ok";
  }

  return "error|" + sanitizeField(result.detail || "", ProtocolByteLimit.sendResultDetail);
}

function serializeSettingsState(settings) {
  var authStep = settings.authStep || (settings.hasSession ? "signed_in" : (settings.hasAuthError ? "error" : "phone"));

  return [
    sanitizeField(settings.sendMode),
    settings.previewChatMessage ? "1" : "0",
    settings.hasSession ? "1" : "0",
    settings.hasAuthError ? "1" : "0",
    sanitizeField(authStep)
  ].join("|");
}

module.exports = {
  AppMessageKey: AppMessageKey,
  MessageType: MessageType,
  ProtocolByteLimit: ProtocolByteLimit,
  buildChatListPagePayload: buildChatListPagePayload,
  buildChatPagePayload: buildChatPagePayload,
  encodeMessage: encodeMessage,
  serializeChatItem: serializeChatItem,
  serializeChatPageError: serializeChatPageError,
  serializeMessageItem: serializeMessageItem,
  serializeSettingsState: serializeSettingsState,
  serializeSendResult: serializeSendResult,
  truncateUtf8: truncateUtf8,
  utf8ByteLength: utf8ByteLength
};
