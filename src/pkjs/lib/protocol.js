import { SyncState } from "./sync_state.js";

export const MessageType = Object.freeze({
  appReady: "app_ready",
  chatListPage: "chat_list_page",
  chatPage: "chat_page",
  syncStatus: "sync_status",
  settingsUpdate: "settings_update",
  sendMessage: "send_message",
});

export const AppMessageKey = Object.freeze({
  type: 0,
  payloadJson: 1,
  requestId: 2,
  syncState: 3,
});

export function encodeMessage(type, payload = {}, requestId = 0) {
  return {
    [AppMessageKey.type]: type,
    [AppMessageKey.payloadJson]: JSON.stringify(payload),
    [AppMessageKey.requestId]: requestId,
    [AppMessageKey.syncState]: payload.syncState ?? SyncState.desynced,
  };
}

export function buildChatListPagePayload({ chats, syncState = SyncState.synced }) {
  return {
    type: MessageType.chatListPage,
    syncState,
    chats,
  };
}

export function buildChatPagePayload({ chatId, messages, syncState = SyncState.synced, hasOlder = false }) {
  return {
    type: MessageType.chatPage,
    syncState,
    chatId,
    hasOlder,
    messages,
  };
}

