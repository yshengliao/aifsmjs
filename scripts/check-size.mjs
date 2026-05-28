#!/usr/bin/env node
// Verify gzip-compressed bundle size per subpath stays under budget.
// Run after `pnpm build`; fails the publish if any entry exceeds.

import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const budgets = {
  // v0.3.0 adds the experimental sub-machine sugar (StateDef.sub / subImpl,
  // Runtime.subRuntime, SubMachineError, applySubLifecycle in send/reset/
  // dispose) plus the onTransition sugar. Measured at 4,465 B in v0.3.0.
  // Raised to 4,700 B for ~235 B safety margin; tighten in 0.3.x if the
  // experimental code stabilises.
  "dist/index.js": 4_700,
  "dist/guards/index.js": 1_000,
  "dist/effects/index.js": 1_000,
  "dist/inspect/index.js": 1_000,
  "dist/replay/index.js": 1_800,
  // pbt/index.js imports createRuntime from runtime.ts; the SubMachineError
  // class and applySubLifecycle code added in v0.3.0 are pulled in transitively.
  // Measured at 5,228 B in v0.3.0. Raised to 5,500 B for ~272 B safety margin.
  "dist/pbt/index.js": 5_500,
  "dist/timer/index.js": 1_000,
};

const failures = [];
for (const [rel, max] of Object.entries(budgets)) {
  const abs = resolve(root, rel);
  let buf;
  try {
    buf = await readFile(abs);
  } catch {
    failures.push(`${rel}: missing (did you run pnpm build?)`);
    continue;
  }
  const gz = gzipSync(buf).length;
  const pct = ((gz / max) * 100).toFixed(0);
  const tag = gz > max ? "FAIL" : "ok  ";
  console.log(`[${tag}] ${rel.padEnd(28)} gz ${String(gz).padStart(5)} B / ${max} B (${pct}%)`);
  if (gz > max) failures.push(`${rel}: ${gz} B > ${max} B budget`);
}

if (failures.length > 0) {
  console.error("\ncheck-size: bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\ncheck-size: all ${Object.keys(budgets).length} entries within budget.`);
