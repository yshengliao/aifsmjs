import { isPlainObject } from "./snapshot.js";
import type { Action, Enqueuer } from "./types.js";

/**
 * Build an Action that returns a Partial<Ctx> from a pure updater.
 * The partial is merged into the current context by `step()`.
 */
export function assign<Ctx, Evt>(
  updater: (args: { context: Ctx; event: Evt }) => Partial<Ctx>,
): Action<Ctx, Evt> {
  return ({ context, event }) => updater({ context, event });
}

/**
 * Merge a partial context update into the current context. Plain-object
 * contexts get a shallow merge; non-object contexts get replaced wholesale.
 *
 * The function never mutates either argument.
 */
export function mergeContext<Ctx>(current: Ctx, patch: Partial<Ctx> | void): Ctx {
  if (patch === undefined || patch === null) return current;
  if (isPlainObject(current) && isPlainObject(patch)) {
    return { ...current, ...patch } as Ctx;
  }
  return patch as Ctx;
}

/**
 * Build a closure-based Enqueuer that pushes effects into the supplied sink.
 * Each `step()` invocation creates one such enqueuer and discards it afterwards.
 */
export function createEnqueuer(sink: { type: string; payload?: unknown }[]): Enqueuer {
  return Object.freeze({
    effect(type: string, payload?: unknown) {
      if (payload === undefined) {
        sink.push(Object.freeze({ type }));
      } else {
        sink.push(Object.freeze({ type, payload }));
      }
    },
  });
}
