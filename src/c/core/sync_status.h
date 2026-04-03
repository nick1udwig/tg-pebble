#pragma once

typedef enum {
  TG_SYNC_STATUS_SYNCING = 0,
  TG_SYNC_STATUS_SYNCED = 1,
  TG_SYNC_STATUS_DESYNCED = 2,
} TgSyncStatus;

const char *tg_sync_status_label(TgSyncStatus status);

