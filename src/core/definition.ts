import { freezeSnapshot } from "./snapshot.js";
import type { MachineDef, Snapshot } from "./types.js";

export class InvalidDefinitionError extends Error {
  constructor(message: string) {
    super(`aifsmjs: ${message}`);
    this.name = "InvalidDefinitionError";
  }
}

/**
 * Validate a machine definition shape and return it. The returned object is
 * the same reference (typed as Readonly); no cloning happens.
 *
 * Validation is intentionally shallow: it catches structural mistakes that
 * would otherwise blow up at runtime with cryptic errors.
 */
export function defineMachine<Ctx, Evt extends { type: string }, States extends string>(
  def: MachineDef<Ctx, Evt, States>,
): MachineDef<Ctx, Evt, States> {
  if (!def.id || typeof def.id !== "string") {
    throw new InvalidDefinitionError("definition must have a non-empty string `id`");
  }
  if (!def.states || typeof def.states !== "object") {
    throw new InvalidDefinitionError("definition must have a `states` object");
  }
  const stateKeys = Object.keys(def.states) as States[];
  if (stateKeys.length === 0) {
    throw new InvalidDefinitionError("`states` must declare at least one state");
  }
  if (!def.initial || !stateKeys.includes(def.initial)) {
    throw new InvalidDefinitionError(
      `\`initial\` "${String(def.initial)}" is not declared in states (${stateKeys.join(", ")})`,
    );
  }
  // Validate that every transition target points to a declared state.
  for (const [stateName, stateDef] of Object.entries(def.states) as [
    States,
    (typeof def.states)[States],
  ][]) {
    if (!stateDef.on) continue;
    for (const [evtType, entry] of Object.entries(stateDef.on)) {
      const transitions = Array.isArray(entry) ? entry : [entry];
      for (const t of transitions) {
        if (t.target !== undefined && !stateKeys.includes(t.target)) {
          throw new InvalidDefinitionError(
            `transition ${stateName} -[${evtType}]-> "${String(t.target)}" targets an unknown state`,
          );
        }
      }
    }
  }
  return def;
}

/**
 * Build the initial snapshot for a machine.
 */
export function initialSnapshot<Ctx, Evt extends { type: string }, States extends string>(
  def: MachineDef<Ctx, Evt, States>,
): Snapshot<Ctx, States> {
  const isFinal = def.states[def.initial]?.final === true;
  return freezeSnapshot({
    value: def.initial,
    context: def.context,
    status: isFinal ? ("final" as const) : ("active" as const),
  });
}
