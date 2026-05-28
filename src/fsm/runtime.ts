import { initialSnapshot } from "./definition.js";
import { step } from "./lifecycle.js";
import { deepFreeze } from "./snapshot.js";
import {
  type Effect,
  type Implementations,
  type MachineDef,
  type Middleware,
  RESET_EVENT_TYPE,
  type ResetEvent,
  type Runtime,
  type RuntimeOptions,
  type Snapshot,
} from "./types.js";

export class RuntimeDisposedError extends Error {
  constructor() {
    super("aifsmjs: runtime has been disposed; send()/reset() are not allowed");
    this.name = "RuntimeDisposedError";
  }
}

const RESET_EVENT: ResetEvent = Object.freeze({ type: RESET_EVENT_TYPE });

function composeMiddleware<Ctx, Evt, States extends string>(
  middleware: readonly Middleware<Ctx, Evt, States>[],
): Middleware<Ctx, Evt, States> {
  return (ctx, finalNext) => {
    let index = -1;
    const dispatch = (i: number): void => {
      if (i <= index) throw new Error("aifsmjs: next() called multiple times in middleware");
      index = i;
      const fn = middleware[i];
      if (!fn) {
        finalNext();
        return;
      }
      fn(ctx, () => dispatch(i + 1));
    };
    dispatch(0);
  };
}

function dispatchEffects<Ctx, Evt>(
  effects: readonly Effect[],
  impl: Implementations<Ctx, Evt>,
  context: Ctx,
  event: Evt,
  signal: AbortSignal,
): void {
  if (!impl.effects || effects.length === 0) return;
  for (const eff of effects) {
    const handler = impl.effects[eff.type];
    if (handler) {
      // Fire-and-forget; we never await the result.
      void handler(eff, { context, event, signal });
    }
  }
}

/**
 * Build a thin stateful runtime around a machine. `send()` calls `step()`,
 * runs the read-only middleware pipeline, dispatches effects, and notifies
 * subscribers. The runtime owns an `AbortController`; `dispose()` aborts it
 * and clears all state.
 */
export function createRuntime<Ctx, Evt extends { type: string }, States extends string>(
  def: MachineDef<Ctx, Evt, States>,
  impl: Implementations<Ctx, Evt>,
  opts: RuntimeOptions<Ctx, Evt, States> = {},
): Runtime<Ctx, Evt, States> {
  let snapshot: Snapshot<Ctx, States> = initialSnapshot(def);
  const listeners = new Set<(snap: Snapshot<Ctx, States>) => void>();
  const middlewareChain =
    opts.middleware && opts.middleware.length > 0 ? composeMiddleware(opts.middleware) : undefined;
  const shouldDispatch = opts.dispatchEffects !== false;
  const controller = new AbortController();
  let disposed = false;

  function notify() {
    for (const l of listeners) l(snapshot);
  }

  function runMiddleware(
    prev: Snapshot<Ctx, States>,
    event: Evt | ResetEvent,
    effects: readonly Effect[],
    changed: boolean,
  ) {
    if (!middlewareChain) return;
    const mwCtx = deepFreeze({
      prev,
      next: snapshot,
      event,
      effects,
      changed,
    });
    middlewareChain(mwCtx, () => {});
  }

  function send(event: Evt): Snapshot<Ctx, States> {
    if (disposed) throw new RuntimeDisposedError();
    const prev = snapshot;
    const result = step(def, prev, event, impl);
    snapshot = result.snapshot;

    runMiddleware(prev, event, result.effects, result.changed);

    if (shouldDispatch) {
      dispatchEffects(result.effects, impl, snapshot.context, event, controller.signal);
    }

    if (result.changed) notify();
    return snapshot;
  }

  function reset(event?: Evt): Snapshot<Ctx, States> {
    if (disposed) throw new RuntimeDisposedError();
    const prev = snapshot;
    snapshot = initialSnapshot(def);
    // Notify only when the state value actually changed, mirroring send().
    // `prev.context !== snapshot.context` would always be true (new ref from
    // initialSnapshot) so we compare on `value` only.
    const changed = prev.value !== snapshot.value;
    const triggerEvent: Evt | ResetEvent = event ?? RESET_EVENT;
    runMiddleware(prev, triggerEvent, [], changed);
    if (changed) notify();
    return snapshot;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    controller.abort();
    listeners.clear();
  }

  return {
    getSnapshot: () => snapshot,
    send,
    reset,
    dispose,
    get disposed() {
      return disposed;
    },
    get signal() {
      return controller.signal;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
