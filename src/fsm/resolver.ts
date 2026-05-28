import type { MachineDef, TransitionDef } from "./types.js";

/**
 * Return all transition candidates for (state, eventType). Order is preserved
 * from the declaration so that guard fallthrough behaves predictably.
 *
 * If the event has no entry under the given state, an empty array is returned.
 */
export function resolveTransitions<Ctx, Evt extends { type: string }, States extends string>(
  def: MachineDef<Ctx, Evt, States>,
  stateValue: States,
  eventType: string,
): readonly TransitionDef<Ctx, Evt, States>[] {
  const state = def.states[stateValue];
  if (!state || !state.on) return [];
  const entry = state.on[eventType];
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry as TransitionDef<Ctx, Evt, States>];
}
