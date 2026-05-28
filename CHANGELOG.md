# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-28

### Added

- **Async-guard detection**: `evalGuard` and `defineMachine`'s validation pass now throw on async guards. TypeScript already prevents the typed case, but a JS caller or a cast could slip an async guard through and silently pass every check (a thenable is truthy). The new check fails loudly:
  - **Definition time** (inline `async` guard) → `InvalidDefinitionError` from `defineMachine`'s `validateDefinition`.
  - **Runtime** (string-ref or cast guard whose return value is thenable) → `AsyncGuardError` from `evalGuard`. The thenable check uses `typeof x?.then === "function"`, so cross-realm Promises (iframe / worker / vm) and user-defined PromiseLike values are also caught — not just same-realm `instanceof Promise`.
  - New exports from `aifsmjs`: `AsyncGuardError`, `isAsyncGuardFn`.
  - README's "Capabilities / Limitations" table updated to reflect the new runtime guarantee.

### Fixed (correctness)

- **`send()` transition payload AND `notify()` listeners are captured pre-reentry** ([src/fsm/runtime.ts](src/fsm/runtime.ts)): the `next` field of the emitted `'transition'` event, the effect dispatch context, and the snapshot delivered to `subscribe()` listeners are all now read from a captured local `committed` snapshot rather than the outer mutable `snapshot` variable. Closes a race where a reentrant `send()` inside an effect handler or subscriber would race ahead and the outer payload / later subscribers in the same notify pass would end up pointing at the reentry's snapshot.
- **`evalGuard` falls back to `<inline>` for anonymous-arrow guards** ([src/fsm/evaluator.ts](src/fsm/evaluator.ts)): switched `??` to `||` so an empty `Function.prototype.name` falls back instead of producing `guard "" must be sync;`.
- **README + README_ZHTW + llms-full.txt** now describe the two error paths separately (`InvalidDefinitionError` at definition time vs `AsyncGuardError` at runtime) instead of conflating them.

### Changed (positioning + meta)

- **`package.json#description`** rewritten from «for web game development» to lead with the broader use case set (multi-step forms, checkout funnels, auth flows, tutorials, scene flow). The README's "Primary audience" paragraph already moved away from game-only framing in v0.2.0; the package metadata now matches.

### Build & tooling

- **`verify:llms` is now build-agnostic** ([scripts/build-llms-full.mjs](scripts/build-llms-full.mjs)): the script accepts `--check` which builds the file in memory and compares against disk, exit 1 on diff. The previous form used `git diff --exit-code -- llms-full.txt` after running the build, which failed any time the working tree had uncommitted changes (not just llms-full.txt drift). The new form works identically pre-commit and in CI.
- **Per-subpath gzip budgets raised** ([scripts/check-size.mjs](scripts/check-size.mjs)): core 3500 → 3700 B and replay 1600 → 1800 B to absorb the AsyncGuardError + thenable detection cost; pbt 4500 → 4600 B for a small symbol additions. All entries still tracked at ≥95% headroom.

### Added (examples)

- `examples/03-checkout-funnel` — e-commerce checkout funnel with guarded staging, payment / analytics effects, and a `replay()` round-trip. Demonstrates that aifsmjs models classic web UX flows with no canvas / game loop involvement.
- `examples/04-form-wizard` — multi-step form wizard with back / next / jump-to-step navigation, per-step validation, and draft persistence via the `persist` middleware.

### Changed (positioning)

- `README.md` and `README_ZHTW.md`'s "Primary audience" paragraph now leads with stateful web flows (multi-step forms, checkout funnels, auth flows, tutorials, document workflows) and frames games as one application of the same pattern. The core remains environment-neutral; the only opt-in dependency is `fast-check` for the `aifsmjs/pbt` PBT adapter.

### Compatibility

This release is **non-breaking at runtime** for users who already wrote sync guards. Async guards previously slipped through and silently passed; they now throw. If you relied on this accidental behaviour, move the async work into an effect (`enq.effect(...)`) and dispatch a follow-up event when the work completes — the pattern is documented in the README's "Common pitfalls" table.

## [0.1.2] — 2026-05-28

### Fixed

- **Memory**: `runtime.on(type, fn, { signal })` previously left an
  abort listener attached to the external `AbortSignal` after
  `runtime.dispose()`. The listener (and its closure over the user's
  callback) was retained until the signal eventually fired or was
  garbage-collected. `dispose()` now removes each abort listener from
  the signal it was attached to, and the unsubscribe function returned
  by `on()` does the same on manual unsubscribe.

### Internal

- Narrowed `dispatchEffects` event parameter from `Evt | ResetEvent`
  to `Evt`; the function is only reached via `send()`. Removed the
  corresponding `as Evt` cast.
- Removed a redundant `snapshot.context as Ctx` cast in `step()`.

No public API changes; existing 0.1.1 callers run unchanged. Core gzip
3296 B → 3401 B (97% of 3500 B budget).

## [0.1.1] — 2026-05-28

### Changed

- **Release pipeline**: switched to npm OIDC trusted publisher. Releases
  now ship with provenance attestation generated from the GitHub Action
  via `id-token: write` + `--provenance`; no long-lived `NPM_TOKEN`
  needed. The `Publish to npm` workflow is unchanged from v0.1.0; see
  CONTRIBUTING for the `pnpm version patch && git push --follow-tags`
  flow.

No code changes vs v0.1.0; runtime behaviour, API surface, and bundle
sizes are identical (core gzip 3.30 KB / 3.5 KB budget).

## [0.1.0] — 2026-05-28

Initial public release.

### Added

- **fsm/** (source folder, internal) — `defineMachine`, `setup<Ctx, Evt>()`
  curried builder for inferred States, `createRuntime`, `step()` pure
  function with fixed `guards → exit → action → entry` lifecycle order.
  Runtime exposes `dispose()`, `reset(event?)`, `disposed`, `signal`
  (internal `AbortController` lifetime) — see the Lifecycle Protocol section
  of README. `RuntimeDisposedError` thrown on post-dispose calls. Snapshot
  is frozen (deep-frozen in dev). Implementations injected at runtime via
  string refs.
- **`aifsmjs/guards`** — `and / or / not / stateIn` higher-order combinators
  with short-circuit evaluation. Both string-ref and inline `Guard` supported.
- **`aifsmjs/effects`** — `Enqueuer` API (`enqueue.effect(type, payload?)`)
  and a standalone `runEffects()` dispatcher. Effects are descriptors, not
  callbacks, so they remain serializable. `EffectHandler` receives the
  runtime's `AbortSignal` in `args.signal`. `runEffects()` accepts
  `args.signal` as optional — standalone callers may omit it and the
  dispatcher supplies a never-aborting placeholder.
- **`Runtime.reset()`** — listeners notified only when `prev.value !==
  initial.value` (parity with `send()`); middleware always observes the
  call regardless. The triggering event is exposed on
  `MiddlewareContext.event` as `Evt | ResetEvent`. The sentinel
  `RESET_EVENT_TYPE` (`"@@aifsmjs/RESET"`) is exported for discrimination.
- **`aifsmjs/inspect`** — Koa-style read-only middleware pipeline. Built-in
  `logger`, `persist`, and `recorder` middlewares. Middleware cannot alter a
  transition outcome.
- **`aifsmjs/replay`** — Pure event-log fold via `step()`. Never dispatches
  effects; suitable for PBT, time travel, and incident reproduction.
- **`aifsmjs/pbt`** — `fast-check` `fc.commands` adapter
  (`commandsFromMachine`) plus six generic property tests
  (`snapshotAlwaysFrozen`, `unknownEventNoOp`, `reachableStatesSubsetDeclared`,
  `replayEqualsFold`, `guardsFalseNoTransition`, `assignDoesNotMutate`) and an
  `assertAll` convenience runner. `fast-check` listed as optional peer.
- **`aifsmjs/timer`** — `after(ms, fn, { signal })` returning a cancellable
  handle, plus `createScheduler()` for bundled cancellation. `AbortSignal`
  listeners registered with `{ once: true }` to avoid leaks.
- TypeScript build with `strict + noUncheckedIndexedAccess +
  exactOptionalPropertyTypes`; dual ESM/CJS output via tsup.
- Bilingual README (Traditional Chinese canonical + English mirror) with an
  AI-Agent Reading Guide section, Lifecycle Invariants contract, and
  comparison table against XState v5 / Robot3 / @xstate/store / Zag.js.
- 94 example-based tests (vitest) plus PBT smoke runs against a traffic-light
  fixture.

### API additions for ai*js ecosystem alignment

- **`createMachine(def, impl, opts?)`** — single-factory convenience that
  composes `defineMachine` + `createRuntime`. Spec-style entry point from
  the ai*js micro-runtime review; the curried `setup().defineMachine` form
  remains for States inference, and explicit `defineMachine<Ctx,Evt,States>`
  remains as an escape hatch.
- **`runtime.snapshot()`** — alias for `runtime.getSnapshot()`; documented
  as the preferred name going forward.
- **`runtime.can(event)`** — predicate that returns `true` iff sending the
  event would fire a transition. Reuses `evalGuard`; guards must be pure
  for `can` and `send` to agree.
- **`runtime.on(type, listener, { signal?, once? })`** — `EventTarget`-style
  typed event API. Channels: `'transition'` (after a state-changing `send`
  or `reset`), `'error'` (async effect handler rejections), `'dispose'`
  (fires once on teardown). `subscribe(listener)` is unchanged and still
  preferred for `useSyncExternalStore`.

Core gzip grew from 2.87 KB to ~3.3 KB; the size budget script raised the
core cap to 3.5 KB with rationale in `scripts/check-size.mjs`.

### Documentation restructure

- `README.md` is now the canonical English README; the Traditional Chinese
  mirror moved to `README_ZHTW.md`.
- Added `llms.txt` and `llms-full.txt` following the [llmstxt.org](https://llmstxt.org/)
  convention so LLM agents can ground in the project surface with one fetch.
  `llms-full.txt` is generated by `scripts/build-llms-full.mjs`; `pnpm
  verify:llms` re-runs the generator and diffs to catch drift.
- New "Design choices" section in both READMEs explains why send is sync,
  guards are sync, effects are descriptors, why two factory forms exist,
  and why `on` and `subscribe` both ship.

### CI guarantees

- **Coverage threshold**: 100% statements / 100% lines / 100% functions /
  ≥90% branches, enforced via `@vitest/coverage-v8` thresholds (actual on
  v0.1.0 release: 100/100/100/98.81). Defensive invariant-guard branches
  carry `/* v8 ignore */` annotations with rationale comments.
- **Per-subpath gzip size budget** (verified by `scripts/check-size.mjs`):
  core ≤3 KB · replay ≤1.6 KB · pbt ≤4.5 KB · guards / effects / inspect /
  timer ≤1 KB each. Tarball measured at ~98 KB / 48 files.

### Out of scope (v1)

Hierarchical / compound states, parallel state regions, actor invocation
(async), tick/game-loop hook, ECS / Pixi bridges. See Roadmap in README.
