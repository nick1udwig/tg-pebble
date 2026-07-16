import { describe, expect, it, vi } from "vitest";

import {
  assessSchemaLayers,
  fetchUpstreamLayer,
} from "../../../scripts/check-telegram-schema-layer.mjs";

describe("Telegram schema drift checks", () => {
  it("accepts an explicitly reviewed compatibility lag", () => {
    expect(assessSchemaLayers({
      actualBundledLayer: 198,
      recordedBundledLayer: 198,
      reviewedUpstreamLayer: 225,
      upstreamLayer: 225,
    })).toMatchObject({
      ok: true,
      acknowledgedLag: 27,
    });
  });

  it("rejects unreviewed upstream layers and manifest mismatches", () => {
    const result = assessSchemaLayers({
      actualBundledLayer: 199,
      recordedBundledLayer: 198,
      reviewedUpstreamLayer: 225,
      upstreamLayer: 226,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("records layer 198"),
      expect.stringContaining("advanced to layer 226"),
    ]));
  });

  it("reads the layer from Telegram's machine-readable config shape", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ layer: 225 }),
    }));

    await expect(fetchUpstreamLayer("https://core.telegram.org/api/config.json", {
      fetchImpl,
      timeoutMs: 100,
    })).resolves.toBe(225);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://core.telegram.org/api/config.json",
      expect.objectContaining({ headers: { accept: "application/json" } })
    );
  });
});
