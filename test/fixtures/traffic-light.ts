import { defineMachine } from "../../src/core/definition.js";
import type { Implementations } from "../../src/core/types.js";
import { assign } from "../../src/core/updater.js";

export type Ctx = { ticks: number; emergency: boolean };
export type Evt = { type: "NEXT" } | { type: "EMERGENCY" } | { type: "RESET" };
export type States = "red" | "green" | "yellow" | "halt";

export const trafficLight = defineMachine<Ctx, Evt, States>({
  id: "trafficLight",
  initial: "red",
  context: { ticks: 0, emergency: false },
  states: {
    red: {
      entry: ["onEnterRed"],
      on: {
        NEXT: { target: "green", actions: ["bump", "notify"] },
        EMERGENCY: { target: "halt", actions: ["raiseEmergency"] },
      },
    },
    green: {
      on: {
        NEXT: { target: "yellow", actions: ["bump"] },
        EMERGENCY: { target: "halt", actions: ["raiseEmergency"] },
      },
    },
    yellow: {
      on: {
        NEXT: [
          { target: "red", guard: "ticksOdd", actions: ["bump"] },
          { target: "green", actions: ["bump"] },
        ],
        EMERGENCY: { target: "halt", actions: ["raiseEmergency"] },
      },
    },
    halt: {
      entry: ["onEnterHalt"],
      on: {
        RESET: { target: "red", actions: ["reset"] },
      },
    },
  },
});

export type EffectLog = { type: string; payload?: unknown }[];

export function makeImpl(log: EffectLog = []): Implementations<Ctx, Evt> {
  return {
    guards: {
      ticksOdd: ({ context }) => context.ticks % 2 === 1,
    },
    actions: {
      bump: assign(({ context }) => ({ ticks: context.ticks + 1 })),
      notify: ({ enqueue }) => {
        enqueue.effect("trackTransition", { source: "notify" });
      },
      raiseEmergency: assign(() => ({ emergency: true })),
      reset: assign(() => ({ ticks: 0, emergency: false })),
      onEnterRed: ({ enqueue }) => {
        enqueue.effect("logEnter", { state: "red" });
      },
      onEnterHalt: ({ enqueue }) => {
        enqueue.effect("logEnter", { state: "halt" });
      },
    },
    effects: {
      trackTransition: (eff) => {
        log.push({ type: eff.type, payload: eff.payload });
      },
      logEnter: (eff) => {
        log.push({ type: eff.type, payload: eff.payload });
      },
    },
  };
}
