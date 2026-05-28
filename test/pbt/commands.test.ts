import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defineMachine } from "../../src/fsm/definition.js";
import { createRuntime } from "../../src/fsm/runtime.js";
import { commandsFromMachine, initialModel } from "../../src/pbt/commands.js";
import {
  type Ctx,
  type Evt,
  type States,
  makeImpl,
  trafficLight,
} from "../fixtures/traffic-light.js";

const eventArbs = {
  NEXT: fc.constant({ type: "NEXT" } as Evt),
  EMERGENCY: fc.constant({ type: "EMERGENCY" } as Evt),
  RESET: fc.constant({ type: "RESET" } as Evt),
};

describe("commandsFromMachine", () => {
  it("produces an arbitrary that fast-check can run", () => {
    const impl = makeImpl();
    const arb = commandsFromMachine(trafficLight, impl, eventArbs);
    expect(arb).toBeDefined();
  });

  it("50 runs against traffic-light keep model and real in sync", () => {
    fc.assert(
      fc.property(commandsFromMachine(trafficLight, makeImpl(), eventArbs), (cmds) => {
        const real = createRuntime(trafficLight, makeImpl(), { dispatchEffects: false });
        const model = initialModel<Ctx, Evt, States>(trafficLight);
        fc.modelRun(() => ({ model, real }), cmds);
        return real.getSnapshot().value === model.value;
      }),
      { numRuns: 50 },
    );
  });

  it("initialModel marks status='final' when initial state is final", () => {
    type C = Record<string, never>;
    type E = { type: "X" };
    const def = defineMachine<C, E, "done">({
      id: "m",
      initial: "done",
      context: {},
      states: { done: { final: true } },
    });
    const m = initialModel<C, E, "done">(def);
    expect(m.status).toBe("final");
  });

  it("SendCommand.toString shows the dispatched event", () => {
    const impl = makeImpl();
    let captured = "";
    const arb = commandsFromMachine(trafficLight, impl, eventArbs);
    fc.assert(
      fc.property(arb, (cmds) => {
        for (const c of cmds) {
          captured = c.toString();
          break;
        }
        return true;
      }),
      { numRuns: 1 },
    );
    expect(captured).toMatch(/^send\(\{/);
  });
});
