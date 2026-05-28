import { initialSnapshot } from "./definition.js";
import { evalGuard } from "./evaluator.js";
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
  type RuntimeErrorEvent,
  type RuntimeEventMap,
  type RuntimeOptions,
  type RuntimeTransitionEvent,
  type Snapshot,
  type TransitionDef,
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

  // Typed event listeners for the EventTarget-like on() API.
  type EventListeners = {
    [K in keyof RuntimeEventMap<Ctx, Evt, States>]: Set<
      (payload: RuntimeEventMap<Ctx, Evt, States>[K]) => void
    >;
  };
  const eventListeners: EventListeners = {
    transition: new Set(),
    error: new Set(),
    dispose: new Set(),
  };

  // Track detach functions for abort listeners we attach to external signals
  // in on({ signal }). dispose() removes them so the external signal does not
  // keep wrapped listeners alive past the runtime's lifetime.
  const externalAbortCleanups = new Set<() => void>();

  function emit<K extends keyof RuntimeEventMap<Ctx, Evt, States>>(
    type: K,
    payload: RuntimeEventMap<Ctx, Evt, States>[K],
  ): void {
    for (const fn of eventListeners[type]) fn(payload);
  }

  function notify(committed?: Snapshot<Ctx, States>) {
    // Capture the snapshot value FIRST so a subscriber that synchronously
    // calls `send()` and reassigns the outer `snapshot` cannot bleed into
    // the value other subscribers see in the same notify() pass.
    const captured = committed ?? snapshot;
    for (const l of listeners) l(captured);
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

  function dispatchEffects(effects: readonly Effect[], context: Ctx, event: Evt): void {
    if (!impl.effects || effects.length === 0) return;
    for (const eff of effects) {
      const handler = impl.effects[eff.type];
      if (!handler) continue;
      // Sync throws still propagate to the caller of send(); async rejections
      // surface on the 'error' event channel instead of becoming unhandled.
      const r = handler(eff, { context, event, signal: controller.signal });
      if (r instanceof Promise) {
        r.catch((err: unknown) => {
          const payload: RuntimeErrorEvent<Evt> = { error: err, event };
          emit("error", payload);
        });
      }
    }
  }

  function send(event: Evt): Snapshot<Ctx, States> {
    if (disposed) throw new RuntimeDisposedError();
    const prev = snapshot;
    const result = step(def, prev, event, impl);
    snapshot = result.snapshot;
    // Capture this transition's outcome BEFORE any user-controlled callback
    // runs. Effect handlers and subscribers may synchronously call `send()`
    // again, which would reassign the outer `snapshot` variable; without this
    // capture, the transition payload below could end up pointing at a later
    // reentrant snapshot instead of the snapshot that pairs with `event`.
    const committed = result.snapshot;

    runMiddleware(prev, event, result.effects, result.changed);

    if (shouldDispatch) {
      dispatchEffects(result.effects, committed.context, event);
    }

    if (result.changed) {
      notify(committed);
      const payload: RuntimeTransitionEvent<Ctx, Evt, States> = {
        prev,
        next: committed,
        event,
        effects: result.effects,
        changed: true,
      };
      emit("transition", payload);
    }
    return snapshot;
  }

  function reset(event?: Evt): Snapshot<Ctx, States> {
    if (disposed) throw new RuntimeDisposedError();
    const prev = snapshot;
    snapshot = initialSnapshot(def);
    const changed = prev.value !== snapshot.value;
    const triggerEvent: Evt | ResetEvent = event ?? RESET_EVENT;
    runMiddleware(prev, triggerEvent, [], changed);
    if (changed) {
      notify();
      const payload: RuntimeTransitionEvent<Ctx, Evt, States> = {
        prev,
        next: snapshot,
        event: triggerEvent,
        effects: [],
        changed: true,
      };
      emit("transition", payload);
    }
    return snapshot;
  }

  function can(event: Evt): boolean {
    if (disposed || snapshot.status === "final") return false;
    const state = def.states[snapshot.value];
    /* v8 ignore next — defensive: snapshot.value always corresponds to a declared state. */
    if (!state) return false;
    const candidates = state.on?.[event.type];
    if (!candidates) return false;
    const list: readonly TransitionDef<Ctx, Evt, States>[] = Array.isArray(candidates)
      ? candidates
      : [candidates as TransitionDef<Ctx, Evt, States>];
    for (const t of list) {
      if (!t.guard) return true;
      if (evalGuard(t.guard, snapshot.context, event, impl, snapshot.value)) return true;
    }
    return false;
  }

  function on<K extends keyof RuntimeEventMap<Ctx, Evt, States>>(
    type: K,
    listener: (payload: RuntimeEventMap<Ctx, Evt, States>[K]) => void,
    options?: { signal?: AbortSignal; once?: boolean },
  ): () => void {
    if (disposed || options?.signal?.aborted) return () => {};
    const target = eventListeners[type];
    let wrapped: (payload: RuntimeEventMap<Ctx, Evt, States>[K]) => void = listener;
    if (options?.once) {
      wrapped = (payload) => {
        target.delete(wrapped);
        listener(payload);
      };
    }
    target.add(wrapped);
    let detachAbort: (() => void) | undefined;
    const signal = options?.signal;
    if (signal) {
      const onAbort = () => {
        target.delete(wrapped);
        if (detachAbort) externalAbortCleanups.delete(detachAbort);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      detachAbort = () => signal.removeEventListener("abort", onAbort);
      externalAbortCleanups.add(detachAbort);
    }
    return () => {
      target.delete(wrapped);
      if (detachAbort) {
        detachAbort();
        externalAbortCleanups.delete(detachAbort);
      }
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    controller.abort();
    listeners.clear();
    emit("dispose", undefined as RuntimeEventMap<Ctx, Evt, States>["dispose"]);
    for (const set of Object.values(eventListeners)) set.clear();
    for (const cleanup of externalAbortCleanups) cleanup();
    externalAbortCleanups.clear();
  }

  return {
    getSnapshot: () => snapshot,
    snapshot: () => snapshot,
    send,
    can,
    reset,
    dispose,
    on,
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
