import { describe, expect, it } from "vitest";
import { resolveTransitions } from "../../src/fsm/resolver.js";
import { trafficLight } from "../fixtures/traffic-light.js";

describe("resolveTransitions", () => {
  it("returns a list of candidates for a declared event", () => {
    const t = resolveTransitions(trafficLight, "yellow", "NEXT");
    expect(t.length).toBe(2);
    expect(t[0]?.target).toBe("red");
    expect(t[1]?.target).toBe("green");
  });

  it("wraps a single object transition into a one-element list", () => {
    const t = resolveTransitions(trafficLight, "red", "NEXT");
    expect(t.length).toBe(1);
    expect(t[0]?.target).toBe("green");
  });

  it("returns empty array for unknown event type", () => {
    expect(resolveTransitions(trafficLight, "red", "UNKNOWN")).toEqual([]);
  });

  it("returns empty array for unknown state", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing defensive behaviour
    expect(resolveTransitions(trafficLight, "ghost" as any, "NEXT")).toEqual([]);
  });
});
