import type { Action } from "./types.js";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

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
  if (isPlainRecord(current) && isPlainRecord(patch)) {
    return { ...current, ...patch } as Ctx;
  }
  return patch as Ctx;
}
