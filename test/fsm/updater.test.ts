import { describe, expect, it } from "vitest";
import { createEnqueuer } from "../../src/effects/enqueuer.js";
import { assign, mergeContext } from "../../src/fsm/updater.js";

type Ctx = { n: number; name: string };

describe("assign", () => {
  it("returns a partial-producing Action", () => {
    const action = assign<Ctx, { type: "X" }>(({ context }) => ({
      n: context.n + 1,
    }));
    const result = action({
      context: { n: 0, name: "" },
      event: { type: "X" },
      enqueue: { effect: () => {} },
    });
    expect(result).toEqual({ n: 1 });
  });
});

describe("mergeContext", () => {
  it("does not mutate the original", () => {
    const original = { n: 0, name: "init" };
    const merged = mergeContext(original, { n: 1 });
    expect(merged).toEqual({ n: 1, name: "init" });
    expect(original.n).toBe(0);
    expect(merged).not.toBe(original);
  });

  it("returns the original when patch is void", () => {
    const c = { n: 0 };
    expect(mergeContext(c, undefined)).toBe(c);
  });

  it("replaces non-object contexts", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing edge case
    const merged = mergeContext(1 as any, 2 as any);
    expect(merged).toBe(2);
  });
});

describe("createEnqueuer", () => {
  it("pushes effects with payload", () => {
    const sink: { type: string; payload?: unknown }[] = [];
    const enq = createEnqueuer(sink);
    enq.effect("a", { x: 1 });
    enq.effect("b");
    expect(sink).toHaveLength(2);
    expect(sink[0]).toEqual({ type: "a", payload: { x: 1 } });
    expect(sink[1]).toEqual({ type: "b" });
  });
});
