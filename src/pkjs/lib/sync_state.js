export var SyncState = Object.freeze({
  syncing: "syncing",
  synced: "synced",
  desynced: "desynced"
});

export var SyncEvent = Object.freeze({
  refreshStart: "refresh_start",
  refreshSuccess: "refresh_success",
  refreshError: "refresh_error",
  connectionLost: "connection_lost"
});

export function reduceSyncState(currentState, event) {
  var eventType = event && event.type ? event.type : null;

  if (!currentState) {
    currentState = SyncState.desynced;
  }

  switch (eventType) {
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
