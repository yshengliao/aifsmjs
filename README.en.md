# aifsmjs

[![npm version](https://img.shields.io/npm/v/aifsmjs.svg)](https://www.npmjs.com/package/aifsmjs)
[![CI](https://github.com/yshengliao/aifsmjs/actions/workflows/ci.yml/badge.svg)](https://github.com/yshengliao/aifsmjs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![AI Generated](https://img.shields.io/badge/AI_Generated-Claude_Code_Opus_4.7_Max-blueviolet.svg)](https://www.anthropic.com/claude-code)
[![繁體中文](https://img.shields.io/badge/lang-繁體中文-red.svg)](README.md)

> A small, strict FSM library. Lifecycle is a pure `step()` function. Chain-of-Responsibility intuition is reserved for cross-cutting concerns (observe / persist / replay), never for the transition core.

> _Originally documented in Traditional Chinese — see [README.md](README.md) for the canonical version._

---

## Why aifsmjs

Developers coming from C# Chain-of-Responsibility instinctively wrap FSM lifecycle in a cancellable middleware chain. In FSM territory that breaks determinism and replay. aifsmjs goes the other way:

- **Lifecycle is a pure function**: `step(def, snapshot, event, impl)` runs `guards → exit → action → entry` in a fixed, uninterruptible order.
- **CoR intuition is reserved for cross-cutting layers**: `inspect/` provides a Koa-style middleware pipeline, but it can only observe — **never alter the transition outcome**.
- **Definition is plain data**: guards / actions / effects are referenced by string; implementations are injected only at runtime. Serializable, transferable across Web Workers, persistable to a database.
- **PBT is first-class**: built-in `fast-check` `fc.commands` adapter plus 6 generic property tests. No comparable library currently ships this.

In ecosystem terms: closer to Robot3's functional composition + XState v5's `and/or/not` guard combinators + `@xstate/store` v3's `enq.effect()` dual-track side effects. The core measures ~2.5KB ESM gzipped (v0.1.0); every opt-in subpath is independently tree-shakeable.

---

## Quick Start

```bash
pnpm add aifsmjs
```

```typescript
import { setup, createRuntime, assign } from "aifsmjs";

type Ctx = { ticks: number };
type Evt = { type: "NEXT" };

// 1. Definition is plain data; setup<Ctx, Evt>() lets States be inferred from
//    the keys of `states`, so you don't have to repeat them.
const trafficLight = setup<Ctx, Evt>().defineMachine({
  id: "trafficLight",
  initial: "red",
  context: { ticks: 0 },
  states: {
    red:    { on: { NEXT: { target: "green",  actions: ["bump"] } } },
    green:  { on: { NEXT: { target: "yellow", actions: ["bump"] } } },
    yellow: { on: { NEXT: { target: "red",    actions: ["bump"] } } },
  },
});

// 2. Implementations are injected only at runtime
const runtime = createRuntime(trafficLight, {
  actions: {
    bump: assign(({ context }) => ({ ticks: context.ticks + 1 })),
  },
});

// 3. Interact
runtime.send({ type: "NEXT" });
console.log(runtime.getSnapshot().value);   // "green"
console.log(runtime.getSnapshot().context); // { ticks: 1 }
```

> The bare `defineMachine<Ctx, Evt, States>({...})` form is still available as an escape hatch when you need explicit control over union event types. In normal cases prefer `setup().defineMachine()`.

---

## Mental Model

```
┌──────────────────────┐       ┌──────────────────────┐
│  MachineDefinition   │       │   Implementations    │
│  (plain data, JSON)  │  +    │   (guards/actions/    │
│  • states            │       │    effects fn map)   │
│  • on / target       │       │                      │
│  • string refs       │       │                      │
└──────────┬───────────┘       └──────────┬───────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
              ┌────────────────────────┐
              │  step(def, snap, evt,  │  ← pure function
              │       impl)            │     fixed order, uninterruptible
              └───────────┬────────────┘
                          ▼
              ┌────────────────────────┐
              │   { snapshot,          │
              │     effects: [...] }   │     caller decides when
              └───────────┬────────────┘     to dispatch effects
                          ▼
              ┌────────────────────────┐
              │  createRuntime(...)    │  ← thin wrapper
              │  state holder + send   │
              └────────────────────────┘
```

The three layers are fully decoupled: take `step()` alone for replay, take `MachineDefinition` alone for visualization, and `createRuntime` is just the convenience layer that glues them.

---

## Capabilities / Limitations

| Will do (v1)                                        | Won't do                                          |
| --------------------------------------------------- | ------------------------------------------------- |
| Flat states + transitions                           | Hierarchical / compound states                    |
| Guards (sync only)                                  | Async guards                                      |
| Actions (assign + enqueue effects)                  | Async API inside an action (use an effect)        |
| Fire-and-forget effects                             | Actor invocation / spawn                          |
| Read-only inspect middleware                        | Cancellable transition middleware                 |
| `replay(initial, log, def, impl)` pure function     | Time-travel debugger (v2 candidate)               |
| `fast-check` `fc.commands` adapter                   | Custom PBT framework                               |
| String ref + runtime injection                      | Closures embedded in definition (breaks serialize) |
| Tree-shake friendly subpath exports                  | Single root import for everything                 |

---

## Design Philosophy

<details>
<summary>Why lifecycle cannot be middleware (click to expand)</summary>

UML statecharts and SCXML both mandate `exit → transition action → entry` as an atomic sequence. The moment a middleware handler can call `next()` or throw to abort, you can land in an invalid state — "entered the new state but never exited the old one" — which destroys:

1. **Determinism**: the same event sequence no longer guarantees the same snapshot.
2. **Replay**: event logs cannot reproduce the same outcome in another environment.
3. **PBT shrinking**: fast-check's counter-example minimization presumes a deterministic machine.

XState v5 removed the `predictableActionArguments` flag (actions are now always predictable) precisely because of this lesson from v4. Spring StateMachine flags its cancellable Interceptor as a "relatively deep internal feature" for the same reason.

So aifsmjs splits the CoR chain instinct two ways:

| Use case                       | How it is handled                                       |
| ------------------------------ | ------------------------------------------------------- |
| Chained guard predicates       | `and/or/not` higher-order combinators                   |
| Multi-step action sequencing   | `actions: [...]` array, runs in order to completion     |
| Cross-cutting (log/persist)    | `inspect/` middleware — read-only, no cancel ability    |

</details>

<details>
<summary>Why the definition is plain data</summary>

The moment definitions contain closures, you lose:

- `JSON.stringify` round-trip for DB / localStorage persistence
- `postMessage` transfer to a Web Worker
- Static reachability analysis by a visualizer tool
- Auto-generated event arbitraries from a PBT adapter

aifsmjs follows the XState v5 two-phase pattern (`setup().createMachine()`): the definition uses string refs; the function map is injected at `createRuntime()`. Inline functions are still allowed but flagged as an escape hatch.

</details>

---

## Core API

### `defineMachine<C, E, S>(def)`

```typescript
function defineMachine<
  Ctx,
  Evt extends { type: string },
  States extends string,
>(def: MachineDef<Ctx, Evt, States>): MachineDef<Ctx, Evt, States>;
```

Pure data builder. Freezes the whole definition and validates that `initial` exists in the `states` map.

### `createRuntime(def, impl, opts?)`

```typescript
function createRuntime<C, E, S>(
  def: MachineDef<C, E, S>,
  impl: Implementations<C, E>,
  opts?: { middleware?: readonly Middleware<C, E, S>[] },
): Runtime<C, E, S>;

interface Runtime<C, E, S> {
  getSnapshot(): Snapshot<C, S>;
  send(event: E): Snapshot<C, S>;
  subscribe(listener: (snap: Snapshot<C, S>) => void): () => void;
}
```

Thin wrapper. Internally calls `step()` and dispatches effects.

### `step(def, snapshot, event, impl)`

```typescript
function step<C, E, S>(
  def: MachineDef<C, E, S>,
  snapshot: Snapshot<C, S>,
  event: E,
  impl: Implementations<C, E>,
): { snapshot: Snapshot<C, S>; effects: readonly Effect[] };
```

**Pure function**. The invariant keeper for the whole library. It never dispatches effects, never mutates the snapshot, and never throws — a failing guard or unmapped event simply returns the original snapshot.

### `assign(updater)`

```typescript
function assign<C, E>(
  updater: (args: { context: C; event: E }) => Partial<C>,
): Action<C, E>;
```

Pure context update helper. Returns a partial that is merged into the context. No side effects.

---

## Opt-in Modules

Each opt-in lives on its own subpath. If you don't import it, it is fully tree-shaken away.

### `aifsmjs/guards` — Guard combinators

```typescript
import { and, or, not, stateIn } from "aifsmjs/guards";

const canCheckout = and([
  "isAuthenticated",
  or(["isAdmin", "isOwner"]),
  not("isBanned"),
]);
```

`and/or/not` short-circuit over sync guards. `stateIn(...states)` is a sugar predicate: "current state is one of these".

### `aifsmjs/effects` — Fire-and-forget effects

```typescript
import { type Action } from "aifsmjs";

const checkout: Action<Ctx, Evt> = ({ context, enqueue }) => {
  enqueue.effect("trackAnalytics", { event: "checkout", ctx: context });
  // Return value becomes the new context (omit to keep current context)
};
```

`enqueue.effect(type, payload)` queues a side-effect declaration. `step()` collects them and hands them back to the caller. Runtime dispatches after the transition; replay mode disables dispatch and keeps only the snapshot fold.

### `aifsmjs/inspect` — Read-only middleware

```typescript
import { createRuntime } from "aifsmjs";
import { logger, persist } from "aifsmjs/inspect";

const runtime = createRuntime(def, impl, {
  middleware: [
    logger(console.log),
    persist({ key: "machine-state", storage: localStorage }),
  ],
});
```

Koa-style `(ctx, next) => void` pipeline. `ctx` is `{ prev, next, event, effects }`, all `structuredClone`d and frozen. **Cannot cancel a transition** — `next()` must be called; the return value carries no meaning.

### `aifsmjs/replay` — Pure event log replay

```typescript
import { replay } from "aifsmjs/replay";

const finalSnap = replay(initialSnapshot, eventLog, def, impl);
// Equivalent to eventLog.reduce((s, e) => step(def, s, e, impl).snapshot, initial)
```

Never dispatches effects. For PBT, time-travel debugging, and incident reproduction.

### `aifsmjs/pbt` — fast-check adapter

> **Install the peer**: `pnpm add -D fast-check` (^3.20.0). aifsmjs lists fast-check as an optional peer; you only need it when importing this subpath.

```typescript
import fc from "fast-check";
import { commandsFromMachine, properties } from "aifsmjs/pbt";

fc.assert(
  fc.property(
    commandsFromMachine(def, impl, {
      NEXT: fc.constant({ type: "NEXT" as const }),
    }),
    (cmds) => properties.runDeterministic(def, impl, cmds),
  ),
);
```

`properties.*` ships 6 generic properties (see [Testing Strategy](#testing-strategy)). `fast-check` is `peerDependenciesMeta.optional`; no install penalty if you don't use it.

### `aifsmjs/timer` — Cancellable delayed callbacks

```typescript
import { after, createScheduler } from "aifsmjs/timer";

// One-shot
const handle = after(5000, () => runtime.send({ type: "TIMEOUT" }));
handle.cancel(); // cancels if not yet fired

// AbortSignal integration
const ac = new AbortController();
after(5000, () => runtime.send({ type: "TIMEOUT" }), { signal: ac.signal });
ac.abort(); // also cancels

// Scheduler: bundle a group of timers and cancel them together on teardown
const sched = createScheduler();
sched.after(1000, () => {});
sched.after(2000, () => {});
sched.cancelAll();
```

- Thin wrapper over `setTimeout` / `clearTimeout`, with injectable timer functions (validated by vitest fake timers)
- AbortSignal listener registered with `{ once: true }` to avoid leaks
- Decoupled from the FSM core: you decide when to forward a fired timer as `runtime.send(...)`

---

## Lifecycle Invariants

The fixed order inside `step()` (always, no escape hatch):

```
1. resolveTransitions(def, snapshot.value, event)
       → candidate transitions for (state, event)
2. evaluate guard on each candidate in declaration order
       → first passing transition is chosen; otherwise the original snapshot is returned
3. exit actions of the old state         (v1 is flat, no hierarchy)
4. transition.actions[] run in declaration order
       → each action may call enqueue.effect()
       → each action's returned partial context is merged into the current context
5. entry actions of the new state
6. return { snapshot, effects } — the caller decides when to dispatch effects
```

**Contracts**:

- ✅ Guards are sync and pure (never mutate context)
- ✅ Actions always run to completion (no cancel mechanism)
- ✅ Effects are declarations (type + payload), not callbacks — serializable
- ✅ Snapshot is immutable; dev mode deep-freezes for diagnostics, prod is shallow for speed
- ❌ No async lifecycle hook
- ❌ Inspect middleware cannot alter the transition outcome

---

## AI-Agent Reading Guide

> This section is for LLMs and code-search agents. Invariants, types, and misuse patterns are concentrated here.

### Serializable fields

The following are plain data, safe to `JSON.stringify` round-trip:

- The entire `MachineDef` (provided no inline functions are used)
- The entire `Snapshot` (provided `context` is plain data)
- The entire `Effect` (`{ type: string; payload?: unknown }`)

The following are **not serializable** and will break PBT/replay:

- Every function inside `Implementations`
- Middleware closures

### Invariants (do not violate)

1. `step()` is pure: identical `(def, snapshot, event, impl)` always returns identical `{ snapshot, effects }`.
2. Snapshots are frozen: in dev mode any mutation throws immediately.
3. Guards never mutate context: violators are caught by PBT property #2.
4. Effects are always fire-and-forget: the runtime never waits for an effect before updating the snapshot.

### Common misuses

| Anti-pattern                                              | Correct form                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| Calling `fetch()` (or any async API) inside a guard        | Rewrite as events: send `FETCH_REQUEST`, then `FETCH_DONE`    |
| `setTimeout`-and-mutate inside an action                   | Use `enqueue.effect("delayedThing", ...)`                     |
| Using middleware to alter the next state                   | Not possible — middleware is read-only. Rewrite as a guard.   |
| Inline functions inside a definition (works but breaks serialize) | Pull out as string refs, inject at `createRuntime`            |

### Machine-readable schema

A JSON schema for `MachineDef` will ship at `dist/schema/machine.schema.json`. Not yet available in v1; types live in [src/core/types.ts](src/core/types.ts) for agents to derive from.

---

## Testing Strategy

Example-first, PBT-augmented. Lesson from jssm: "3000+ tests / 100% coverage" turns out to have < 12% coverage from stochastic tests — the rest is example specs.

- **Example tests** (vitest): for every src module, write happy path + edge + error-message triplets.
- **PBT smoke**: each generic property runs 50 iterations as an invariant guard, not as a coverage source.

### The 6 built-in generic properties

| #   | Property                          | One-liner                                                |
| --- | --------------------------------- | -------------------------------------------------------- |
| 1   | snapshotAlwaysFrozen              | After any event sequence, the snapshot remains frozen    |
| 2   | unknownEventNoOp                  | Undeclared events do not change the snapshot             |
| 3   | reachableStatesSubsetDeclared     | Every reachable state belongs to `def.states`            |
| 4   | replayEqualsFold                  | `replay(init, log)` equals `events.reduce(step)`         |
| 5   | guardsFalseNoTransition           | When all guards fail, the state is unchanged              |
| 6   | assignDoesNotMutate               | `assign` never modifies the previous context             |

---

## Comparison

|                            | aifsmjs        | XState v5         | Robot3            | @xstate/store     | Zag.js            |
| -------------------------- | -------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| Core size (gzip)           | ~2.5KB         | ~15KB             | ~1KB              | < 1KB             | per-component     |
| Hierarchical states         | ❌ (v1)         | ✅                 | ❌                 | N/A               | ✅                 |
| Async invoke / actor        | ❌              | ✅                 | ❌                 | N/A               | ❌                 |
| Guard combinators           | ✅ and/or/not   | ✅ and/or/not      | ❌                 | N/A               | ❌                 |
| Effects dual-track          | ✅ enqueue      | enqueueActions    | reduce/action     | ✅ enq.effect()    | array of names    |
| Inspect / observe           | ✅ read-only    | ✅ inspect API     | ❌                 | ⚠️ proposed       | watch ctx         |
| Serializable definition     | ✅              | ✅                 | ⚠️                | ⚠️                | ✅                 |
| fast-check adapter          | ✅ built-in     | ❌                 | ❌                 | ❌                 | ❌                 |
| Tree-shake subpath imports  | ✅              | ⚠️                | ✅                 | ✅                 | ✅                 |

---

## Roadmap

| Version | Scope                                                              |
| ------- | ------------------------------------------------------------------ |
| v0.1    | core + guards + effects + inspect + replay + pbt (this release)    |
| v0.2    | Hierarchical / compound states, including entry/exit ordering       |
| v0.3    | Parallel state regions                                              |
| v0.4    | Actor invocation (async) and spawn                                  |
| v0.5    | `aifsmjs-bridge-bitecs` / `aifsmjs-bridge-pixi` (separate sub-packages) |
| v1.0    | API freeze and stability guarantee                                  |

---

## License

[MIT](LICENSE)
