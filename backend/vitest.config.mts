import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true, environment: "node", include: ["src/**/*.{test,spec}.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    restoreMocks: true,
    testTimeout: 20000,
    coverage: { reporter: ["text", "json", "html"] },
  },
});
