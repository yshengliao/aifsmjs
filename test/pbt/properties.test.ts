import * as fc from "fast-check";
import { describe, it } from "vitest";
import {
  assertAll,
  assignDoesNotMutate,
  guardsFalseNoTransition,
  reachableStatesSubsetDeclared,
  replayEqualsFold,
  snapshotAlwaysFrozen,
  unknownEventNoOp,
} from "../../src/pbt/properties.js";
import { type Evt, makeImpl, trafficLight } from "../fixtures/traffic-light.js";

const eventArbs = {
  NEXT: fc.constant({ type: "NEXT" } as Evt),
  EMERGENCY: fc.constant({ type: "EMERGENCY" } as Evt),
  RESET: fc.constant({ type: "RESET" } as Evt),
};

describe("PBT generic properties — traffic-light fixture", () => {
  it("#1 snapshotAlwaysFrozen", () => {
    snapshotAlwaysFrozen(trafficLight, makeImpl(), eventArbs, { numRuns: 50 });
  });

  it("#2 unknownEventNoOp", () => {
    unknownEventNoOp(trafficLight, makeImpl(), "__UNKNOWN__", { numRuns: 50 });
  });

  it("#3 reachableStatesSubsetDeclared", () => {
    reachableStatesSubsetDeclared(trafficLight, makeImpl(), eventArbs, { numRuns: 50 });
  });

  it("#4 replayEqualsFold", () => {
    replayEqualsFold(trafficLight, makeImpl(), eventArbs, { numRuns: 50 });
  });

  it("#5 guardsFalseNoTransition", () => {
    guardsFalseNoTransition(trafficLight, makeImpl(), eventArbs, { numRuns: 50 });
  });

  it("#6 assignDoesNotMutate", () => {
    assignDoesNotMutate(trafficLight, makeImpl(), eventArbs, { numRuns: 50 });
  });

  it("assertAll convenience runner", () => {
    assertAll(trafficLight, makeImpl(), eventArbs, { numRuns: 25 });
  });
});
