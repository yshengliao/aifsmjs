import { freezeSnapshot } from "./snapshot.js";
import type { MachineDef, Snapshot, StateDef } from "./types.js";

export class InvalidDefinitionError extends Error {
  constructor(message: string) {
    super(`aifsmjs: ${message}`);
    this.name = "InvalidDefinitionError";
  }
}

function validateDefinition<Ctx, Evt extends { type: string }, States extends string>(
  def: MachineDef<Ctx, Evt, States>,
): void {
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
}

/**
 * Validate a machine definition shape and return it. Same reference is
 * returned; no cloning happens. Validation is intentionally shallow.
 *
 * Two call forms:
 *
 *   defineMachine<Ctx, Evt, States>({ ... })
 *     Explicit generics. Use when you need full control (e.g. union event
 *     types). Required because TypeScript cannot otherwise infer `Evt`.
 *
 *   setup<Ctx, Evt>().defineMachine({ ... })
 *     Curried form. Lets `States` be inferred from `keyof states`, so you
 *     can omit it. Recommended for typical usage.
 */
export function defineMachine<Ctx, Evt extends { type: string }, States extends string>(
  def: MachineDef<Ctx, Evt, States>,
): MachineDef<Ctx, Evt, States> {
  validateDefinition(def);
  return def;
}

/**
 * Curried builder so `States` can be inferred from `keyof states` without
 * `initial` collapsing it to a single literal. Pass `Ctx` and `Evt` as the
 * type arguments; pass the def to the returned `defineMachine`.
 *
 *   const machine = setup<MyCtx, MyEvt>().defineMachine({
 *     id: "m",
 *     initial: "a",
 *     context: { ... },
 *     states: { a: {...}, b: {...} },  // States inferred as "a" | "b"
 *   });
 */
export function setup<Ctx, Evt extends { type: string }>(): {
  defineMachine: <const States extends string>(def: {
    readonly id: string;
    readonly initial: NoInfer<States>;
    readonly context: Ctx;
    readonly states: Readonly<Record<States, StateDef<Ctx, Evt, States>>>;
  }) => MachineDef<Ctx, Evt, States>;
} {
  return {
    defineMachine: <const States extends string>(def: {
      readonly id: string;
      readonly initial: NoInfer<States>;
      readonly context: Ctx;
      readonly states: Readonly<Record<States, StateDef<Ctx, Evt, States>>>;
    }) => {
      const cast = def as unknown as MachineDef<Ctx, Evt, States>;
      validateDefinition(cast);
      return cast;
    },
  };
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
