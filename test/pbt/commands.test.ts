import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/core/runtime.js";
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
});
