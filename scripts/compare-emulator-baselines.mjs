import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const baselineDir = resolve(process.env.TG_PEBBLE_BASELINE_DIR || "tests/emulator/baselines");
const artifactDir = resolve(process.env.TG_PEBBLE_ARTIFACT_DIR || "tests/emulator/artifacts");
const diffDir = resolve(process.env.TG_PEBBLE_DIFF_DIR || "tests/emulator/artifacts/diffs");
const pixelThreshold = Number(process.env.TG_PEBBLE_VISUAL_PIXEL_THRESHOLD || "0.1");

const volatileRegions = [
  { left: 74, top: 4, right: 86, bottom: 14 },
];

function maskVolatileRegions(image) {
  for (const region of volatileRegions) {
    const left = Math.max(0, region.left);
    const top = Math.max(0, region.top);
    const right = Math.min(image.width - 1, region.right);
    const bottom = Math.min(image.height - 1, region.bottom);

    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = (image.width * y + x) * 4;
        image.data[index] = 0;
        image.data[index + 1] = 0;
        image.data[index + 2] = 0;
        image.data[index + 3] = 0;
      }
    }
  }
}

function normalizePlatformPalette(name, image) {
  if (!name.startsWith("aplite-") && !name.startsWith("flint-")) {
    return;
  }

  // These framebuffer captures render lit pixels as either gray or white
  // depending on the headless SDL environment. Normalize that binary palette
  // while retaining every rendered edge and glyph.
  for (let index = 0; index < image.data.length; index += 4) {
    const lit = Math.max(image.data[index], image.data[index + 1], image.data[index + 2]) > 128;
    const value = lit ? 255 : 0;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
}

mkdirSync(diffDir, { recursive: true });

const baselineFiles = readdirSync(baselineDir)
  .filter((name) => extname(name).toLowerCase() === ".png")
  .sort();

if (baselineFiles.length === 0) {
  throw new Error(`No emulator baselines found in ${baselineDir}. Run 'npm run capture:baselines' first.`);
}

let mismatches = 0;

for (const baselineName of baselineFiles) {
  const baselinePath = join(baselineDir, baselineName);
  const artifactPath = join(artifactDir, baselineName);
  const diffPath = join(diffDir, baselineName);

  let artifactImage;
  try {
    artifactImage = PNG.sync.read(readFileSync(artifactPath));
  } catch (_error) {
    throw new Error(`Missing or unreadable artifact for baseline ${baselineName}: ${artifactPath}`);
  }

  const baselineImage = PNG.sync.read(readFileSync(baselinePath));

  if (baselineImage.width !== artifactImage.width || baselineImage.height !== artifactImage.height) {
    throw new Error(
      `Size mismatch for ${baselineName}: baseline ${baselineImage.width}x${baselineImage.height}, artifact ${artifactImage.width}x${artifactImage.height}`,
    );
  }

  maskVolatileRegions(baselineImage);
  maskVolatileRegions(artifactImage);
  normalizePlatformPalette(baselineName, baselineImage);
  normalizePlatformPalette(baselineName, artifactImage);

  const diffImage = new PNG({ width: baselineImage.width, height: baselineImage.height });
  const diffPixels = pixelmatch(
    baselineImage.data,
    artifactImage.data,
    diffImage.data,
    baselineImage.width,
    baselineImage.height,
    { threshold: pixelThreshold },
  );

  if (diffPixels > 0) {
    mismatches += 1;
    writeFileSync(diffPath, PNG.sync.write(diffImage));
    console.error(`Mismatch: ${baselineName} (${diffPixels} pixels differ)`);
  } else {
    rmSync(diffPath, { force: true });
  }
}

if (mismatches > 0) {
  throw new Error(`Visual regression check failed for ${mismatches} artifact(s). Diff images are in ${diffDir}.`);
}

console.log(`Visual regression check passed for ${baselineFiles.length} baseline image(s).`);
