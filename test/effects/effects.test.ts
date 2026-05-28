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
  const neverSignal = new AbortController().signal;

  it("dispatches handlers with signal in args", () => {
    const handler = vi.fn();
    const effects: Effect[] = [{ type: "a", payload: 1 }];
    const handlers: Record<string, EffectHandler<unknown, unknown>> = { a: handler };
    runEffects(effects, handlers, { context: null, event: { type: "X" }, signal: neverSignal });
    expect(handler).toHaveBeenCalledWith(effects[0], {
      context: null,
      event: { type: "X" },
      signal: neverSignal,
    });
  });

  it("returns promises for async handlers", () => {
    const handlers: Record<string, EffectHandler<unknown, unknown>> = {
      a: async () => {
        await Promise.resolve();
      },
    };
    const promises = runEffects([{ type: "a" }], handlers, {
      context: null,
      event: {},
      signal: neverSignal,
    });
    expect(promises).toHaveLength(1);
  });

  it("skips unhandled effect types", () => {
    const handler = vi.fn();
    const handlers: Record<string, EffectHandler<unknown, unknown>> = { a: handler };
    runEffects([{ type: "b" }], handlers, { context: null, event: {}, signal: neverSignal });
    expect(handler).not.toHaveBeenCalled();
  });

  it("no-op when handlers map is undefined", () => {
    const promises = runEffects([{ type: "a" }], undefined, {
      context: null,
      event: {},
      signal: neverSignal,
    });
    expect(promises).toEqual([]);
  });

  it("forwards an aborted signal so handlers can short-circuit", () => {
    const ac = new AbortController();
    ac.abort();
    let observed: boolean | undefined;
    const handlers: Record<string, EffectHandler<unknown, unknown>> = {
      a: (_eff, { signal }) => {
        observed = signal.aborted;
      },
    };
    runEffects([{ type: "a" }], handlers, { context: null, event: {}, signal: ac.signal });
    expect(observed).toBe(true);
  });
});
