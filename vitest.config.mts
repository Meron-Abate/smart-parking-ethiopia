import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // integration tests share one database
    fileParallelism: false,
    // bcrypt at cost 12 is deliberately slow; on a loaded dev machine several hashes can exceed vitest's 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
