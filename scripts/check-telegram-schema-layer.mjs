import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const schema = require("../src/pkjs/lib/tgproto/tl_schema.js");
const stateUrl = new URL("./telegram-schema-state.json", import.meta.url);

function positiveInteger(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function assessSchemaLayers(input) {
  const actualBundledLayer = positiveInteger(input.actualBundledLayer, "Bundled schema layer");
  const recordedBundledLayer = positiveInteger(input.recordedBundledLayer, "Recorded bundled layer");
  const reviewedUpstreamLayer = positiveInteger(input.reviewedUpstreamLayer, "Reviewed upstream layer");
  const upstreamLayer = positiveInteger(input.upstreamLayer, "Upstream layer");
  const requireCurrent = input.requireCurrent === true;
  const errors = [];

  if (actualBundledLayer !== recordedBundledLayer) {
    errors.push(
      `Bundled schema is layer ${actualBundledLayer}, but telegram-schema-state.json records layer ${recordedBundledLayer}.`
    );
  }
  if (reviewedUpstreamLayer < recordedBundledLayer) {
    errors.push(
      `Reviewed upstream layer ${reviewedUpstreamLayer} cannot be older than bundled layer ${recordedBundledLayer}.`
    );
  }
  if (upstreamLayer > reviewedUpstreamLayer) {
    errors.push(
      `Telegram API advanced to layer ${upstreamLayer}; the latest reviewed layer is ${reviewedUpstreamLayer}.`
    );
  }
  if (requireCurrent && actualBundledLayer !== upstreamLayer) {
    errors.push(`Bundled layer ${actualBundledLayer} does not match upstream layer ${upstreamLayer}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    actualBundledLayer,
    reviewedUpstreamLayer,
    upstreamLayer,
    acknowledgedLag: Math.max(0, reviewedUpstreamLayer - actualBundledLayer),
  };
}

export async function fetchUpstreamLayer(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  let payload;

  if (typeof fetchImpl !== "function") {
    throw new Error("This Node.js runtime does not provide fetch().");
  }

  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller ? controller.signal : undefined,
    });
    if (!response || response.ok !== true) {
      throw new Error(`Telegram schema metadata request failed with HTTP ${response && response.status}.`);
    }
    payload = await response.json();
    return positiveInteger(payload && payload.layer, "Telegram upstream layer");
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const state = JSON.parse(await readFile(stateUrl, "utf8"));
  const explicitLayer = readArgument("--upstream-layer");
  const useRemote = process.argv.includes("--remote");
  const upstreamLayer = useRemote
    ? await fetchUpstreamLayer(state.upstreamConfigUrl)
    : (explicitLayer == null ? state.latestReviewedUpstreamLayer : positiveInteger(explicitLayer, "Upstream layer"));
  const result = assessSchemaLayers({
    actualBundledLayer: schema.apiLayer,
    recordedBundledLayer: state.bundledLayer,
    reviewedUpstreamLayer: state.latestReviewedUpstreamLayer,
    upstreamLayer,
    requireCurrent: process.argv.includes("--require-current"),
  });

  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`Telegram schema check failed: ${error}`);
    }
    console.error("Review the official schema, then update tl_schema.js, regenerate it, and acknowledge the layer.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `Telegram schema check passed: bundled layer ${result.actualBundledLayer}; ` +
    `latest reviewed layer ${result.reviewedUpstreamLayer}; acknowledged lag ${result.acknowledgedLag}.`
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`Telegram schema check failed: ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  }
}
