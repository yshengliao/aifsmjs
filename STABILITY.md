# Stability

This document defines the stability tier of every public symbol exported by
`aifsmjs`. Tiers govern what breaks may occur in future minor / major bumps.

## Stable (since 0.1.0)

Fully stable. Breaking changes only at a major version bump (1.0+).

- `createMachine`, `defineMachine`, `setup`, `createRuntime`, `initialSnapshot`
- `step`, `resolveTransitions`, `evalGuard`, `resolveGuard`, `isAsyncGuardFn`
- `assign`, `mergeContext`, `createSnapshot`, `deepFreeze`, `freezeSnapshot`
- `Runtime.send`, `Runtime.reset`, `Runtime.can`, `Runtime.getSnapshot`,
  `Runtime.snapshot`, `Runtime.subscribe`, `Runtime.on`, `Runtime.dispose`,
  `Runtime.signal`, `Runtime.disposed`
- All error classes from 0.1.0–0.2.1: `RuntimeDisposedError`,
  `InvalidDefinitionError`, `UnknownActionError`, `UnknownGuardError`,
  `AsyncGuardError`
- Types: `MachineDef`, `StateDef` (fields `on`, `entry`, `exit`, `final`),
  `TransitionDef`, `Snapshot`, `Implementations`, `Guard`, `Action`,
  `EffectHandler`, `Effect`, `Enqueuer`, `Middleware`, `MiddlewareContext`,
  `RuntimeOptions`, `StepResult`, `ResetEvent`, `RESET_EVENT_TYPE`,
  `RuntimeTransitionEvent`, `RuntimeErrorEvent`, `RuntimeEventMap`
- All subpath exports: `aifsmjs/guards`, `aifsmjs/effects`, `aifsmjs/inspect`,
  `aifsmjs/replay`, `aifsmjs/pbt`, `aifsmjs/timer`
- `Runtime.onTransition` (added in 0.3.0) — pure sugar over the stable
  `on('transition', ...)` API; listed under Stable because the underlying
  contract is unchanged.

### Sub-machines (stable since 0.4.0)

The hierarchical sub-machine surface shipped experimentally in 0.3.0 is
stable as of 0.4.0. Signatures and runtime semantics — including the
init-failure quarantine behaviour described below — are frozen for the 1.x
line. The boundaries listed are intentional design trade-offs, not bugs or
pending instability.

- `StateDef.sub` (optional `SubMachineDef`) — when present, a child runtime
  is lazily initialised on entry and disposed on exit. Per-transition
  ordering is parent `step()` (exit / actions / entry) → child dispose →
  child init → snapshot commit.
- `StateDef.subImpl` (optional `Implementations`) — paired with `sub`;
  passed to the child `createRuntime`. Defaults to `{}`.
- `Runtime.subRuntime()` — returns the live child handle, or `undefined`.
  Returned generic is `Runtime<unknown, { type: string }, string>`; caller
  narrows via cast if necessary.
- `SubMachineError` — thrown by `send()` / `reset()` on child init/dispose
  failure. Fields: `parentState`, `phase ("init" | "dispose")`, `cause`.
- `SubMachineDef` type alias.

#### Design boundaries

- **Replay / PBT do not see child state.** `replay()` and
  `commandsFromMachine` only inspect parent snapshots. If your business
  logic lives in the parent layer, replay is still deterministic.
- **`subRuntime()` may return a disposed handle** if an external caller
  disposed it. The handle is not reinitialised until the parent leaves and
  re-enters the sub-bearing state. Detect with `child.disposed`.
- **Self-targeting external (`A → A`) is treated as full exit/entry**:
  child is disposed and reinitialised. The dispatcher re-resolves guards to
  identify the chosen transition before deciding external vs internal, so
  guarded internal transitions on the same event do not trigger a reinit.
- **Init-failure mid-transition leaves the parent without a live child.**
  If `applySubLifecycle` successfully disposes the old child and then the
  new child's `createRuntime` throws, the parent's snapshot is rolled back
  to `prev` but `subRuntime()` returns `undefined`. Callers catching
  `SubMachineError(phase: "init")` should treat the runtime as quarantined
  — call `runtime.dispose()` (idempotent) or `runtime.reset()` (which
  attempts re-init) before sending further events. This quarantine
  behaviour is part of the stable contract; a future **major** version may
  switch to a two-phase "init before dispose" commit strategy (a breaking
  change reserved for 1.0+), but the current semantics are frozen for the
  1.x line.

## Experimental

No experimental APIs as of 0.4.0. The 0.3.0 sub-machine surface graduated to
Stable in 0.4.0 — see "Sub-machines" above.

## Draft (planned, not implemented)

API sketched, not shipped. May change before release.

- `historyState` (candidate for a future minor) — opt-in pseudo-state that
  remembers the last active sub-state on re-entry. Workaround in 0.3.0:
  snapshot the sub-runtime's value on exit via `onTransition`, restore
  manually.
