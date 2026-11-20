import { defineConfig } from "vitest/config";
const serialTests = [
  "src/tests/source-reforecast.test.ts",
  "src/tests/allocation-adjustments-continuation.test.ts",
  "src/tests/allocation-deferrable-c16.test.ts",
  "src/tests/allocation-optimizer-c17.test.ts",
  "src/tests/audit-allocation-personalization.test.ts",
];
export default defineConfig({
  test: {
    globals: true, environment: "node",
    exclude: ["src/**/*.integration.test.ts"],
    // Keep CPU-heavy simulations and the end-to-end reforecast test off competing workers.
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.{test,spec}.ts"], exclude: serialTests } },
      { extends: true, test: { name: "serial", include: serialTests, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
    restoreMocks: true,
    testTimeout: 60000,
    coverage: { reporter: ["text", "json", "html"] },
  },
});
