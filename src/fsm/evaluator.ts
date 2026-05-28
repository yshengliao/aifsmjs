import type { Guard, GuardRef, Implementations } from "./types.js";

export class UnknownGuardError extends Error {
  readonly guardName: string;
  constructor(guardName: string) {
    super(`aifsmjs: guard "${guardName}" not found in implementations.guards`);
    this.name = "UnknownGuardError";
    this.guardName = guardName;
  }
}

/**
 * Resolve a guard ref to a Guard function. String refs are looked up in the
 * implementations map; inline functions are returned as-is.
 */
export function resolveGuard<Ctx, Evt>(
  ref: GuardRef<Ctx, Evt>,
  impl: Implementations<Ctx, Evt>,
): Guard<Ctx, Evt> {
  if (typeof ref === "function") return ref;
  const fn = impl.guards?.[ref];
  if (!fn) throw new UnknownGuardError(ref);
  return fn;
}

/**
 * Evaluate a guard ref against (context, event). Guards must be sync and pure;
 * this function does not catch async returns — TypeScript should already block
 * those at compile time.
 *
 * The optional `value` argument is the current state value, threaded so the
 * `stateIn` combinator and similar predicates can introspect it.
 */
export function evalGuard<Ctx, Evt>(
  ref: GuardRef<Ctx, Evt>,
  context: Ctx,
  event: Evt,
  impl: Implementations<Ctx, Evt>,
  value?: string,
): boolean {
  const fn = resolveGuard(ref, impl);
  // Build args while honouring exactOptionalPropertyTypes: omit fields that
  // would otherwise be assigned `undefined`.
  type Args = {
    context: Ctx;
    event: Evt;
    guards?: Readonly<Record<string, Guard<Ctx, Evt>>>;
    value?: string;
  };
  const args: Args = { context, event };
  const guardsMap = impl.guards;
  if (guardsMap) args.guards = guardsMap;
  if (value !== undefined) args.value = value;
  return fn(args);
}
