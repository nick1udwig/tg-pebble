import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const phoneModulePaths = [
  require.resolve("../../../src/pkjs/lib/protocol.js"),
  require.resolve("../../../src/pkjs/lib/sync_state.js"),
  require.resolve("../../../src/pkjs/lib/placeholders.js"),
  require.resolve("../../../src/pkjs/lib/fixtures.js"),
  require.resolve("../../../src/pkjs/lib/cache_store.js"),
  require.resolve("../../../src/pkjs/lib/tgproto/client.js"),
  require.resolve("../../../src/pkjs/lib/telegram/test_env.js"),
];

describe("phone-side object compatibility", () => {
  it("loads modules when Object.freeze is unavailable", () => {
    const originalFreeze = Object.freeze;

    try {
      for (const modulePath of phoneModulePaths) {
        delete require.cache[modulePath];
      }
      Object.freeze = undefined;

      expect(() => {
        for (const modulePath of phoneModulePaths) {
          require(modulePath);
        }
      }).not.toThrow();
    } finally {
      Object.freeze = originalFreeze;
      for (const modulePath of phoneModulePaths) {
        delete require.cache[modulePath];
      }
    }
  });
});
