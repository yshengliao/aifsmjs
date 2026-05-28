// Example 01 — minimal traffic light. Run with:
//   pnpm example:traffic-light

import { assign, createRuntime, setup } from "../../src/index.js";

type Ctx = { ticks: number };
type Evt = { type: "NEXT" };

const machine = setup<Ctx, Evt>().defineMachine({
  id: "trafficLight",
  initial: "red",
  context: { ticks: 0 },
  states: {
    red: { on: { NEXT: { target: "green", actions: ["bump"] } } },
    green: { on: { NEXT: { target: "yellow", actions: ["bump"] } } },
    yellow: { on: { NEXT: { target: "red", actions: ["bump"] } } },
  },
});

const runtime = createRuntime(machine, {
  actions: {
    bump: assign(({ context }) => ({ ticks: context.ticks + 1 })),
  },
});

runtime.subscribe((snap) => {
  console.log(`→ ${snap.value} (ticks=${snap.context.ticks})`);
});

console.log(`start: ${runtime.getSnapshot().value}`);
for (let i = 0; i < 6; i++) {
  runtime.send({ type: "NEXT" });
}
