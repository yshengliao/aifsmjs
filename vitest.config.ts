import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/fsm/types.ts"],
      thresholds: {
        // Relaxed from 100 → 95 in v0.2.1 when upgrading to vitest 4. Vitest
        // 4 with v8 coverage scores defensive race-recovery if-guards (e.g.
        // `if (!current) return;` in timeout/abort handlers) as separate
        // statements that are not deterministically reachable. Lines and
        // functions stay at 100%; branches stays at 90%.
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 100,
      },
    },
    typecheck: {
      enabled: false,
    },
  },
});
