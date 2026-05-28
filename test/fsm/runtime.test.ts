import { describe, expect, it, vi } from "vitest";
import { RuntimeDisposedError, createRuntime } from "../../src/fsm/runtime.js";
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

describe("runtime lifecycle — dispose / reset / signal", () => {
  it("exposes a signal that is not aborted until dispose", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    expect(runtime.signal.aborted).toBe(false);
    runtime.dispose();
    expect(runtime.signal.aborted).toBe(true);
  });

  it("disposed flag flips on dispose", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    expect(runtime.disposed).toBe(false);
    runtime.dispose();
    expect(runtime.disposed).toBe(true);
  });

  it("dispose is idempotent", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.dispose();
    expect(() => runtime.dispose()).not.toThrow();
    expect(runtime.disposed).toBe(true);
  });

  it("send after dispose throws RuntimeDisposedError", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.dispose();
    expect(() => runtime.send({ type: "NEXT" })).toThrow(RuntimeDisposedError);
  });

  it("reset after dispose throws RuntimeDisposedError", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.dispose();
    expect(() => runtime.reset()).toThrow(RuntimeDisposedError);
  });

  it("dispose clears existing listeners (no notify after dispose)", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const listener = vi.fn();
    runtime.subscribe(listener);
    runtime.dispose();
    // post-dispose subscribe returns a no-op unsubscribe
    const noop = runtime.subscribe(() => {});
    expect(typeof noop).toBe("function");
    expect(listener).not.toHaveBeenCalled();
  });

  it("effect handlers receive the runtime's signal", () => {
    let captured: AbortSignal | undefined;
    const runtime = createRuntime(trafficLight, {
      ...makeImpl(),
      effects: {
        trackTransition: (_eff, { signal }) => {
          captured = signal;
        },
        logEnter: () => {},
      },
    });
    runtime.send({ type: "NEXT" });
    expect(captured).toBeDefined();
    expect(captured?.aborted).toBe(false);
    runtime.dispose();
    expect(captured?.aborted).toBe(true);
  });

  it("reset() returns to initial snapshot and notifies", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const listener = vi.fn();
    runtime.subscribe(listener);
    runtime.send({ type: "NEXT" });
    runtime.send({ type: "NEXT" });
    expect(runtime.getSnapshot().value).toBe("yellow");
    expect(runtime.getSnapshot().context.ticks).toBe(2);
    const after = runtime.reset();
    expect(after.value).toBe("red");
    expect(after.context.ticks).toBe(0);
    expect(listener).toHaveBeenLastCalledWith(after);
  });

  it("reset() does not run entry actions", () => {
    const log: EffectLog = [];
    const runtime = createRuntime(trafficLight, makeImpl(log));
    runtime.send({ type: "NEXT" }); // red → green (emits trackTransition)
    log.length = 0;
    runtime.reset();
    expect(log).toEqual([]);
  });

  it("reset() with explicit event surfaces it to middleware", () => {
    let middlewareEvent: { type: string } | undefined;
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (mw, next) => {
          middlewareEvent = mw.event;
          next();
        },
      ],
    });
    runtime.reset({ type: "RESET" });
    expect(middlewareEvent?.type).toBe("RESET");
  });

  it("reset() without event uses the @@aifsmjs/RESET sentinel", () => {
    let middlewareEvent: { type: string } | undefined;
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (mw, next) => {
          middlewareEvent = mw.event;
          next();
        },
      ],
    });
    runtime.reset();
    expect(middlewareEvent?.type).toBe("@@aifsmjs/RESET");
  });
});
