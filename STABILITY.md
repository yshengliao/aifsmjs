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

## Experimental (since 0.3.0)

Shape and behaviour may change in any minor bump until 1.0. Production use
is OK; expect a one-line patch on minor upgrades.

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

### Known boundaries (0.3.0)

- **Replay / PBT do not see child state.** `replay()` and
  `commandsFromMachine` only inspect parent snapshots. If your business
  logic lives in the parent layer, replay is still deterministic.
- **`subRuntime()` may return a disposed handle** if an external caller
  disposed it. The handle is not reinitialised until the parent leaves and
  re-enters the sub-bearing state. Detect with `child.disposed`.
- **Self-targeting external (`A → A`) is treated as full exit/entry**:
  child is disposed and reinitialised. The 0.3.0 dispatcher re-resolves
  guards to identify the chosen transition before deciding external vs
  internal, so guarded internal transitions on the same event no longer
  trigger a reinit.
- **Init-failure mid-transition leaves the parent without a live child.**
  If `applySubLifecycle` successfully disposes the old child and then the
  new child's `createRuntime` throws, the parent's snapshot is rolled back
  to `prev` but `subRuntime()` returns `undefined`. Callers catching
  `SubMachineError(phase: "init")` should treat the runtime as quarantined
  — call `runtime.dispose()` (idempotent) or `runtime.reset()` (which
  attempts re-init) before sending further events. A future major may
  switch to a two-phase "init before dispose" commit strategy; for 0.3.x
  this remains opt-in only when child failures are expected.

## Draft (planned, not implemented in 0.3.0)

API sketched, not shipped. May change before release.

- `historyState` (v0.4 candidate) — opt-in pseudo-state that remembers
  the last active sub-state on re-entry. Workaround in 0.3.0: snapshot
  the sub-runtime's value on exit via `onTransition`, restore manually.
