#!/usr/bin/env node
// Verify gzip-compressed bundle size per subpath stays under budget.
// Run after `pnpm build`; fails the publish if any entry exceeds.

import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const budgets = {
  // Core grew to ~3.3 KB after adding the EventTarget-style on(), can(), and
  // snapshot() spec-aligned APIs in v0.1.1. Budget bumped to 3500 B with
  // headroom for the next opt-in additions; tighten in v0.2 if room reclaimed.
  "dist/index.js": 3_500,
  "dist/guards/index.js": 1_000,
  "dist/effects/index.js": 1_000,
  "dist/inspect/index.js": 1_000,
  "dist/replay/index.js": 1_600,
  "dist/pbt/index.js": 4_500,
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
