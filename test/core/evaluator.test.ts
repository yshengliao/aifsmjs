import { describe, expect, it } from "vitest";
import { UnknownGuardError, evalGuard, resolveGuard } from "../../src/core/evaluator.js";
import type { Guard, Implementations } from "../../src/core/types.js";

type Ctx = { n: number };
type Evt = { type: "X" };

describe("evaluator", () => {
  const isPositive: Guard<Ctx, Evt> = ({ context }) => context.n > 0;
  const impl: Implementations<Ctx, Evt> = {
    guards: { isPositive },
  };

  it("resolves a string ref", () => {
    expect(resolveGuard("isPositive", impl)).toBe(isPositive);
  });

  it("returns inline function as-is", () => {
    const inline: Guard<Ctx, Evt> = () => true;
    expect(resolveGuard(inline, impl)).toBe(inline);
  });

  it("throws UnknownGuardError for unknown name", () => {
    expect(() => resolveGuard("ghost", impl)).toThrow(UnknownGuardError);
  });

  it("evaluates with threaded guards map and value", () => {
    expect(evalGuard("isPositive", { n: 1 }, { type: "X" }, impl, "anyState")).toBe(true);
    expect(evalGuard("isPositive", { n: -1 }, { type: "X" }, impl)).toBe(false);
  });

  it("evaluates inline function ignoring impl.guards", () => {
    const g: Guard<Ctx, Evt> = ({ context }) => context.n === 42;
    expect(evalGuard(g, { n: 42 }, { type: "X" }, impl)).toBe(true);
  });
});
