#include "sync_status.h"

const char *tg_sync_status_label(TgSyncStatus status) {
  switch (status) {
    case TG_SYNC_STATUS_SYNCING:
      return "syncing";
    case TG_SYNC_STATUS_SYNCED:
      return "synced";
    case TG_SYNC_STATUS_DESYNCED:
      return "desynced";
    default:
      return "desynced";
  }
}

