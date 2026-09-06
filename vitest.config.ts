import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests: plain functions, no workflow runtime. The workflow-level
// integration suite runs from vitest.integration.config.ts.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
