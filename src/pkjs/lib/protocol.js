import { SyncState } from "./sync_state.js";

export var MessageType = Object.freeze({
  appReady: "app_ready",
  openChat: "open_chat",
  chatItem: "chat_item",
  chatListComplete: "chat_list_complete",
  messageItem: "message_item",
  chatPageComplete: "chat_page_complete",
  syncStatus: "sync_status",
  settingsState: "settings_state",
  toggleSendMode: "toggle_send_mode",
  clearCache: "clear_cache",
  logout: "logout",
  sendMessage: "send_message",
  sendResult: "send_result"
});

export var AppMessageKey = Object.freeze({
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

export function encodeMessage(type, payloadString, requestId, syncState) {
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

export function buildChatListPagePayload(params) {
  var syncState = params.syncState || SyncState.synced;

  return {
    type: "chat_list_page",
    syncState: syncState,
    chats: params.chats
  };
}

export function buildChatPagePayload(params) {
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

export function serializeChatItem(chat) {
  return [
    sanitizeField(chat.id),
    sanitizeField(chat.title),
    sanitizeField(chat.preview),
    sanitizeField(chat.unreadCount)
  ].join("|");
}

export function serializeMessageItem(message) {
  return [
    sanitizeField(message.senderName),
    message.showSender ? "1" : "0",
    message.outgoing ? "1" : "0",
    sanitizeField(message.text)
  ].join("|");
}

export function serializeSendResult(result) {
  if (result.ok) {
    return "ok";
  }

  return "error|" + sanitizeField(result.detail || "");
}
