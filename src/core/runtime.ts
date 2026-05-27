import { initialSnapshot } from "./definition.js";
import { step } from "./lifecycle.js";
import { deepFreeze } from "./snapshot.js";
import type {
  Effect,
  Implementations,
  MachineDef,
  Middleware,
  Runtime,
  RuntimeOptions,
  Snapshot,
} from "./types.js";

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
): void {
  if (!impl.effects || effects.length === 0) return;
  for (const eff of effects) {
    const handler = impl.effects[eff.type];
    if (handler) {
      // Fire-and-forget; we never await the result.
      void handler(eff, { context, event });
    }
  }
}

/**
 * Build a thin stateful runtime around a machine. `send()` calls `step()`,
 * runs the read-only middleware pipeline, dispatches effects, and notifies
 * subscribers.
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

  function send(event: Evt): Snapshot<Ctx, States> {
    const prev = snapshot;
    const result = step(def, prev, event, impl);
    snapshot = result.snapshot;

    if (middlewareChain) {
      const mwCtx = deepFreeze({
        prev,
        next: result.snapshot,
        event,
        effects: result.effects,
        changed: result.changed,
      });
      middlewareChain(mwCtx, () => {});
    }

    if (shouldDispatch) {
      dispatchEffects(result.effects, impl, result.snapshot.context as Ctx, event);
    }

    if (result.changed) {
      for (const l of listeners) l(snapshot);
    }
    return snapshot;
  }

  return {
    getSnapshot: () => snapshot,
    send,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
