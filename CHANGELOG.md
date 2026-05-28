# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
