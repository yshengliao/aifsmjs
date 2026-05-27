import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../../src/core/runtime.js";
import { type EffectLog, makeImpl, trafficLight } from "../fixtures/traffic-light.js";

describe("createRuntime", () => {
  it("returns initial snapshot", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    expect(runtime.getSnapshot().value).toBe("red");
  });

  it("send transitions state", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const r = runtime.send({ type: "NEXT" });
    expect(r.value).toBe("green");
    expect(runtime.getSnapshot().value).toBe("green");
  });

  it("subscribers fire on change only", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const listener = vi.fn();
    runtime.subscribe(listener);
    runtime.send({ type: "NEXT" }); // red → green: 1 call
    runtime.send({ type: "GHOST" as unknown as "NEXT" }); // no-op: 0 calls
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("subscribe returns unsubscribe", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const listener = vi.fn();
    const unsub = runtime.subscribe(listener);
    unsub();
    runtime.send({ type: "NEXT" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("dispatches effects through handlers by default", () => {
    const log: EffectLog = [];
    const runtime = createRuntime(trafficLight, makeImpl(log));
    runtime.send({ type: "NEXT" });
    expect(log.some((e) => e.type === "trackTransition")).toBe(true);
  });

  it("skips dispatch when dispatchEffects=false", () => {
    const log: EffectLog = [];
    const runtime = createRuntime(trafficLight, makeImpl(log), { dispatchEffects: false });
    runtime.send({ type: "NEXT" });
    expect(log).toEqual([]);
  });

  it("middleware sees prev, next, event, effects, changed", () => {
    const seen: { prev: string; next: string; type: string; changed: boolean }[] = [];
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (mw, next) => {
          seen.push({
            prev: mw.prev.value,
            next: mw.next.value,
            type: mw.event.type,
            changed: mw.changed,
          });
          next();
        },
      ],
    });
    runtime.send({ type: "NEXT" });
    expect(seen).toEqual([{ prev: "red", next: "green", type: "NEXT", changed: true }]);
  });

  it("multiple middleware run in order", () => {
    const calls: string[] = [];
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (_mw, next) => {
          calls.push("a-before");
          next();
          calls.push("a-after");
        },
        (_mw, next) => {
          calls.push("b-before");
          next();
          calls.push("b-after");
        },
      ],
    });
    runtime.send({ type: "NEXT" });
    expect(calls).toEqual(["a-before", "b-before", "b-after", "a-after"]);
  });

  it("middleware sees frozen snapshots — mutating throws in dev", () => {
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (mw, next) => {
          expect(() => {
            // biome-ignore lint/suspicious/noExplicitAny: probing freeze
            (mw.next as any).value = "halt";
          }).toThrow();
          next();
        },
      ],
    });
    runtime.send({ type: "NEXT" });
  });
});
