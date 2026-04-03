import { createCacheStore } from "./cache_store.js";
import { buildChatListPagePayload, buildChatPagePayload } from "./protocol.js";
import { SyncEvent, SyncState, reduceSyncState } from "./sync_state.js";

export function createPkjsApp({ storage, transport = null }) {
  const cache = createCacheStore(storage);
  let syncState = SyncState.desynced;

  return {
    cache,
    getSyncState() {
      return syncState;
    },
    setSyncState(eventType) {
      syncState = reduceSyncState(syncState, { type: eventType });
      return syncState;
    },
    bootstrap() {
      const chats = cache.getChatList();
      return buildChatListPagePayload({ chats, syncState });
    },
    getChatPage(chatId) {
      const pages = cache.getMessagePages();
      const messages = pages[chatId] ?? [];
      return buildChatPagePayload({ chatId, messages, syncState });
    },
    refreshStarted() {
      return this.setSyncState(SyncEvent.refreshStart);
    },
    refreshSucceeded() {
      return this.setSyncState(SyncEvent.refreshSuccess);
    },
    refreshFailed() {
      return this.setSyncState(SyncEvent.refreshError);
    },
    getTransport() {
      return transport;
    },
  };
}

