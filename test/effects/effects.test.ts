import { describe, expect, it, vi } from "vitest";
import { createEnqueuer, runEffects } from "../../src/effects/index.js";
import type { Effect, EffectHandler } from "../../src/effects/index.js";

describe("createEnqueuer", () => {
  it("collects effects in order with payloads", () => {
    const sink: { type: string; payload?: unknown }[] = [];
    const enq = createEnqueuer(sink);
    enq.effect("a", 1);
    enq.effect("b");
    enq.effect("c", { x: 2 });
    expect(sink).toEqual([
      { type: "a", payload: 1 },
      { type: "b" },
      { type: "c", payload: { x: 2 } },
    ]);
  });

  it("freezes pushed entries", () => {
    const sink: { type: string; payload?: unknown }[] = [];
    createEnqueuer(sink).effect("x", { p: 1 });
    expect(Object.isFrozen(sink[0])).toBe(true);
  });
});

describe("runEffects", () => {
  it("dispatches handlers", () => {
    const handler = vi.fn();
    const effects: Effect[] = [{ type: "a", payload: 1 }];
    const handlers: Record<string, EffectHandler<unknown, unknown>> = { a: handler };
    runEffects(effects, handlers, { context: null, event: { type: "X" } });
    expect(handler).toHaveBeenCalledWith(effects[0], { context: null, event: { type: "X" } });
  });

  it("returns promises for async handlers", () => {
    const handlers: Record<string, EffectHandler<unknown, unknown>> = {
      a: async () => {
        await Promise.resolve();
      },
    };
    const promises = runEffects([{ type: "a" }], handlers, { context: null, event: {} });
    expect(promises).toHaveLength(1);
  });

  it("skips unhandled effect types", () => {
    const handler = vi.fn();
    const handlers: Record<string, EffectHandler<unknown, unknown>> = { a: handler };
    runEffects([{ type: "b" }], handlers, { context: null, event: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it("no-op when handlers map is undefined", () => {
    const promises = runEffects([{ type: "a" }], undefined, { context: null, event: {} });
    expect(promises).toEqual([]);
  });
});
