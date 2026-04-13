import { readdir, mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { build } from "esbuild";

async function collectJsFiles(rootDir) {
  const result = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const childPath = `${rootDir}/${entry.name}`;

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

const entryPoints = (await collectJsFiles("src/pkjs")).sort();
const fixtureMode = process.env.TG_PEBBLE_FIXTURE_MODE === "1" || process.env.TG_PEBBLE_FIXTURE_MODE === "true";

await rm("src/pkjs_legacy", { force: true, recursive: true });
await mkdir("src/pkjs_legacy", { recursive: true });

await build({
  entryPoints: entryPoints,
  format: "cjs",
  outbase: "src/pkjs",
  outdir: "src/pkjs_legacy",
  platform: "node",
  target: "es2015",
});

const generatedIndex = await readFile("src/pkjs_legacy/index.js", "utf8");
const fixtureMarker = "fixtureMode: false,";
if (generatedIndex.indexOf(fixtureMarker) < 0) {
  throw new Error(`Expected fixture marker '${fixtureMarker}' in generated legacy index.`);
}
await writeFile(
  "src/pkjs_legacy/index.js",
  generatedIndex.replace(fixtureMarker, `fixtureMode: ${fixtureMode ? "true" : "false"},`),
  "utf8"
);
