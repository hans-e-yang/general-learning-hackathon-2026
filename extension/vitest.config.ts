import { defineConfig } from "vitest/config";

// Only the pure seams are unit-tested: capture-policy.ts and hash.ts import no
// chrome.* / DOM, so they run in plain Node. The browser shell is verified by
// loading the extension against the capture inspector.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
