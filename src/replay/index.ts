import { step } from "../fsm/lifecycle.js";
import type { Effect, Implementations, MachineDef, Snapshot } from "../fsm/types.js";

export type ReplayResult<Ctx, States extends string> = Readonly<{
  snapshot: Snapshot<Ctx, States>;
  effects: readonly Effect[];
}>;

/**
 * Fold an event log into a final snapshot via `step()`. Effects are collected
 * but never dispatched — this is a pure function, suitable for PBT, time
 * travel, and incident reproduction.
 *
 * Equivalent to:
 *   events.reduce((s, e) => step(def, s, e, impl).snapshot, initial)
 * but also accumulates the effects across all events.
 */
export function replay<Ctx, Evt extends { type: string }, States extends string>(
  initial: Snapshot<Ctx, States>,
  events: readonly Evt[],
  def: MachineDef<Ctx, Evt, States>,
  impl: Implementations<Ctx, Evt>,
): ReplayResult<Ctx, States> {
  let snapshot = initial;
  const effects: Effect[] = [];
  for (const event of events) {
    const r = step(def, snapshot, event, impl);
    snapshot = r.snapshot;
    if (r.effects.length > 0) {
      for (const eff of r.effects) effects.push(eff);
    }
  }
  return Object.freeze({ snapshot, effects: Object.freeze(effects.slice()) });
}
