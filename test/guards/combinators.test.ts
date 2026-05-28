import { describe, expect, it } from "vitest";
import { evalGuard } from "../../src/fsm/evaluator.js";
import type { Guard, Implementations } from "../../src/fsm/types.js";
import { and, not, or, stateIn } from "../../src/guards/index.js";

type Ctx = { n: number };
type Evt = { type: "X" };

const positive: Guard<Ctx, Evt> = ({ context }) => context.n > 0;
const big: Guard<Ctx, Evt> = ({ context }) => context.n > 10;
const small: Guard<Ctx, Evt> = ({ context }) => context.n < 5;

describe("and/or/not — inline guards", () => {
  it("and short-circuits", () => {
    let calls = 0;
    const tracking: Guard<Ctx, Evt> = () => {
      calls++;
      return true;
    };
    const g = and<Ctx, Evt>([({ context }) => context.n > 100, tracking]);
    expect(g({ context: { n: 1 }, event: { type: "X" } })).toBe(false);
    expect(calls).toBe(0);
  });

  it("or short-circuits", () => {
    let calls = 0;
    const tracking: Guard<Ctx, Evt> = () => {
      calls++;
      return false;
    };
    const g = or<Ctx, Evt>([positive, tracking]);
    expect(g({ context: { n: 1 }, event: { type: "X" } })).toBe(true);
    expect(calls).toBe(0);
  });

  it("not negates", () => {
    expect(not<Ctx, Evt>(positive)({ context: { n: 0 }, event: { type: "X" } })).toBe(true);
  });

  it("and([positive, small]) — both true", () => {
    const g = and<Ctx, Evt>([positive, small]);
    expect(g({ context: { n: 2 }, event: { type: "X" } })).toBe(true);
    expect(g({ context: { n: 20 }, event: { type: "X" } })).toBe(false);
  });

  it("or([big, small]) — neither true at n=7", () => {
    const g = or<Ctx, Evt>([big, small]);
    expect(g({ context: { n: 7 }, event: { type: "X" } })).toBe(false);
    expect(g({ context: { n: 2 }, event: { type: "X" } })).toBe(true);
    expect(g({ context: { n: 20 }, event: { type: "X" } })).toBe(true);
  });
});

describe("and/or/not — string refs through evalGuard", () => {
  const impl: Implementations<Ctx, Evt> = {
    guards: { positive, big, small },
  };

  it("resolves nested string refs", () => {
    const composed = and<Ctx, Evt>(["positive", or<Ctx, Evt>(["big", "small"])]);
    expect(evalGuard(composed, { n: 2 }, { type: "X" }, impl)).toBe(true);
    expect(evalGuard(composed, { n: 7 }, { type: "X" }, impl)).toBe(false);
  });

  it("not('positive')", () => {
    const g = not<Ctx, Evt>("positive");
    expect(evalGuard(g, { n: 0 }, { type: "X" }, impl)).toBe(true);
    expect(evalGuard(g, { n: 1 }, { type: "X" }, impl)).toBe(false);
  });

  it("throws for unknown string ref", () => {
    const g = and<Ctx, Evt>(["ghost"]);
    expect(() => evalGuard(g, { n: 1 }, { type: "X" }, impl)).toThrow(/ghost/);
  });
});

describe("stateIn", () => {
  it("returns true when current value is in the list", () => {
    const g = stateIn<Ctx, Evt>("a", "b", "c");
    expect(g({ context: { n: 0 }, event: { type: "X" }, value: "b" })).toBe(true);
    expect(g({ context: { n: 0 }, event: { type: "X" }, value: "d" })).toBe(false);
  });

  it("returns false when value is undefined", () => {
    const g = stateIn<Ctx, Evt>("a");
    expect(g({ context: { n: 0 }, event: { type: "X" } })).toBe(false);
  });
});
