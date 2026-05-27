import type { Effect, EffectHandler } from "../core/types.js";

/**
 * Dispatch a batch of effects through the supplied handler map. Effects whose
 * `type` has no handler are silently skipped (the runtime treats unhandled
 * effects as informational).
 *
 * Returns the array of Promise results (if any handler is async) so callers
 * can `await Promise.all(...)` when they need flushing — the default runtime
 * is fire-and-forget and discards them.
 */
export function runEffects<Ctx, Evt>(
  effects: readonly Effect[],
  handlers: Readonly<Record<string, EffectHandler<Ctx, Evt>>> | undefined,
  args: { context: Ctx; event: Evt },
): readonly Promise<void>[] {
  if (!handlers || effects.length === 0) return [];
  const promises: Promise<void>[] = [];
  for (const eff of effects) {
    const h = handlers[eff.type];
    if (!h) continue;
    const r = h(eff, args);
    if (r instanceof Promise) promises.push(r);
  }
  return promises;
}
