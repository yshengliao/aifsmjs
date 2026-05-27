import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "guards/index": "src/guards/index.ts",
    "effects/index": "src/effects/index.ts",
    "inspect/index": "src/inspect/index.ts",
    "replay/index": "src/replay/index.ts",
    "pbt/index": "src/pbt/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  outDir: "dist",
});
