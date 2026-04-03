import { describe, expect, it } from "vitest";

import { SyncEvent, SyncState, reduceSyncState } from "../../../src/pkjs/lib/sync_state.js";

describe("reduceSyncState", () => {
  it("moves through syncing, synced, and desynced", () => {
    let state = SyncState.desynced;

    state = reduceSyncState(state, { type: SyncEvent.refreshStart });
    expect(state).toBe(SyncState.syncing);

    state = reduceSyncState(state, { type: SyncEvent.refreshSuccess });
    expect(state).toBe(SyncState.synced);

    state = reduceSyncState(state, { type: SyncEvent.connectionLost });
    expect(state).toBe(SyncState.desynced);
  });
});

