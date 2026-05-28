# aifsmjs examples

Runnable demos that exercise the public API end-to-end. Each example imports
from `../../src` so it always runs against the working tree (not the published
package).

## Run

```bash
pnpm install
pnpm example:traffic-light   # 01-traffic-light
pnpm example:approval        # 02-approval-workflow
```

## Index

| # | Example | What it shows | Maps to a web-game pattern |
|---|---|---|---|
| 01 | [traffic-light](01-traffic-light/index.ts) | Minimal `setup → defineMachine → createRuntime → send` loop with `assign` and a snapshot subscriber. | Cyclic scene flow (loading → menu → playing → result → loading) |
| 02 | [approval-workflow](02-approval-workflow/index.ts) | Multi-candidate guarded transitions (`and([...])`), effects + handlers, `persist` + `recorder` middleware, and `replay()` to reproduce the final snapshot. | Turn-based logic with branching outcomes + post-mortem replay |

## Notes

- Examples import from `../../src/...` (TypeScript sources) and are run by
  `tsx`, so type-checks happen at run time too.
- For real applications, import from `aifsmjs`, `aifsmjs/guards`,
  `aifsmjs/inspect`, etc.
