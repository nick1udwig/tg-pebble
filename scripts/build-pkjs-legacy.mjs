import { readdir, mkdir, readFile, rm } from "node:fs/promises";

import { build } from "esbuild";

const DEFAULT_PUBLISHED_CONFIG_URL = "https://nick1udwig.github.io/tg-pebble/config/";

async function collectJsFiles(rootDir) {
  const result = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const childPath = rootDir + "/" + entry.name;

    if (entry.isDirectory()) {
      result.push(...await collectJsFiles(childPath));
      continue;
    }

    if (entry.isFile() && childPath.endsWith(".js")) {
      result.push(childPath);
    }
  }

  return result;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseApiId(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildEmbeddedRuntimeConfigFromEnv(env) {
  const apiId = parseApiId(env.TG_PEBBLE_APP_API_ID);
  const apiHash = String(env.TG_PEBBLE_APP_API_HASH ?? "").trim();

  if (apiId === null || !apiHash) {
    return null;
  }

  return {
    apiId,
    apiHash,
    forceWSS: parseBoolean(env.TG_PEBBLE_APP_FORCE_WSS, true),
    testServers: parseBoolean(env.TG_PEBBLE_APP_TEST_SERVERS, false),
    configUrl: String(env.TG_PEBBLE_APP_CONFIG_URL || DEFAULT_PUBLISHED_CONFIG_URL),
  };
}

const entryPoints = (await collectJsFiles("src/pkjs")).sort();
const fixtureMode = process.env.TG_PEBBLE_FIXTURE_MODE === "1" || process.env.TG_PEBBLE_FIXTURE_MODE === "true";
const embeddedRuntimeConfig = buildEmbeddedRuntimeConfigFromEnv(process.env);

await rm("src/pkjs_legacy", { force: true, recursive: true });
await mkdir("src/pkjs_legacy", { recursive: true });

await build({
  entryPoints: entryPoints,
  format: "cjs",
  outbase: "src/pkjs",
  outdir: "src/pkjs_legacy",
  platform: "node",
  target: "es2015",
  define: {
    __TG_PEBBLE_FIXTURE_MODE__: JSON.stringify(fixtureMode ? "true" : "false"),
    __TG_PEBBLE_BUILTIN_RUNTIME_CONFIG__: JSON.stringify(embeddedRuntimeConfig),
  },
});

const generatedIndex = await readFile("src/pkjs_legacy/index.js", "utf8");
const generatedRuntimeConfig = await readFile("src/pkjs_legacy/lib/runtime_config.js", "utf8");
const compiledFixtureMatch = generatedIndex.match(/compiledFixtureMode = \(true \? "(true|false)" : "false"\) === "true";/);
if (!compiledFixtureMatch || compiledFixtureMatch[1] !== (fixtureMode ? "true" : "false")) {
  throw new Error("Expected compiled fixture mode '" + (fixtureMode ? "true" : "false") + "' in generated legacy index.");
}

if (embeddedRuntimeConfig && !generatedRuntimeConfig.includes(String(embeddedRuntimeConfig.apiId))) {
  throw new Error("Expected embedded Telegram runtime config in generated legacy runtime_config module.");
}
