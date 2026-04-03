export const SyncState = Object.freeze({
  syncing: "syncing",
  synced: "synced",
  desynced: "desynced",
});

export const SyncEvent = Object.freeze({
  refreshStart: "refresh_start",
  refreshSuccess: "refresh_success",
  refreshError: "refresh_error",
  connectionLost: "connection_lost",
});

export function reduceSyncState(currentState = SyncState.desynced, event) {
  switch (event?.type) {
    case SyncEvent.refreshStart:
      return SyncState.syncing;
    case SyncEvent.refreshSuccess:
      return SyncState.synced;
    case SyncEvent.refreshError:
    case SyncEvent.connectionLost:
      return SyncState.desynced;
    default:
      return currentState;
  }
}

