import { UnknownGuardError } from "../core/evaluator.js";
import type { Guard, GuardArgs, GuardRef } from "../core/types.js";

function resolveItem<Ctx, Evt>(item: GuardRef<Ctx, Evt>, args: GuardArgs<Ctx, Evt>): boolean {
  if (typeof item === "function") return item(args);
  const fn = args.guards?.[item];
  if (!fn) throw new UnknownGuardError(item);
  return fn(args);
}

/** Logical AND over guards. Short-circuits on the first `false`. */
export function and<Ctx, Evt>(items: readonly GuardRef<Ctx, Evt>[]): Guard<Ctx, Evt> {
  return (args) => {
    for (const item of items) {
      if (!resolveItem(item, args)) return false;
    }
    return true;
  };
}

/** Logical OR over guards. Short-circuits on the first `true`. */
export function or<Ctx, Evt>(items: readonly GuardRef<Ctx, Evt>[]): Guard<Ctx, Evt> {
  return (args) => {
    for (const item of items) {
      if (resolveItem(item, args)) return true;
    }
    return false;
  };
}

/** Logical NOT. */
export function not<Ctx, Evt>(item: GuardRef<Ctx, Evt>): Guard<Ctx, Evt> {
  return (args) => !resolveItem(item, args);
}

/**
 * Predicate that passes when the current state value is one of the listed
 * states. Reads `args.value`, which `evalGuard` threads from the live
 * snapshot. When called outside of `evalGuard` (e.g. unit tests), `value` is
 * `undefined` and the guard returns `false`.
 */
export function stateIn<Ctx, Evt>(...states: readonly string[]): Guard<Ctx, Evt> {
  const set = new Set<string>(states);
  return ({ value }) => typeof value === "string" && set.has(value);
}
