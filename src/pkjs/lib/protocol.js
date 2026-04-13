var syncStateLib = require("./sync_state");

var SyncState = syncStateLib.SyncState;

var MessageType = Object.freeze({
  appReady: "app_ready",
  openChat: "open_chat",
  chatItem: "chat_item",
  chatListComplete: "chat_list_complete",
  messageItem: "message_item",
  chatPageComplete: "chat_page_complete",
  syncStatus: "sync_status",
  settingsState: "settings_state",
  toggleSendMode: "toggle_send_mode",
  toggleChatPreview: "toggle_chat_preview",
  clearCache: "clear_cache",
  logout: "logout",
  sendMessage: "send_message",
  sendResult: "send_result"
});

var AppMessageKey = Object.freeze({
  type: 0,
  payloadString: 1,
  requestId: 2,
  syncState: 3
});

function sanitizeField(value) {
  return String(value == null ? "" : value)
    .replace(/\|/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();
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
    sanitizeField(chat.title),
    sanitizeField(chat.preview),
    sanitizeField(chat.unreadCount)
  ].join("|");
}

function serializeMessageItem(message) {
  return [
    sanitizeField(message.senderName),
    message.showSender ? "1" : "0",
    message.outgoing ? "1" : "0",
    sanitizeField(message.text)
  ].join("|");
}

function serializeSendResult(result) {
  if (result.ok) {
    return "ok";
  }

  return "error|" + sanitizeField(result.detail || "");
}

function serializeSettingsState(settings) {
  return [
    sanitizeField(settings.sendMode),
    settings.previewChatMessage ? "1" : "0",
    settings.hasSession ? "1" : "0",
    settings.hasAuthError ? "1" : "0"
  ].join("|");
}

module.exports = {
  AppMessageKey: AppMessageKey,
  MessageType: MessageType,
  buildChatListPagePayload: buildChatListPagePayload,
  buildChatPagePayload: buildChatPagePayload,
  encodeMessage: encodeMessage,
  serializeChatItem: serializeChatItem,
  serializeMessageItem: serializeMessageItem,
  serializeSettingsState: serializeSettingsState,
  serializeSendResult: serializeSendResult
};
