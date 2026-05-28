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

  it("middleware calling next() twice throws", () => {
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (_mw, next) => {
          next();
          next();
        },
      ],
    });
    expect(() => runtime.send({ type: "NEXT" })).toThrow(/next\(\) called multiple/);
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

  it("snapshot() is an alias for getSnapshot()", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    expect(runtime.snapshot()).toBe(runtime.getSnapshot());
    runtime.send({ type: "NEXT" });
    expect(runtime.snapshot()).toBe(runtime.getSnapshot());
  });

  it("can(event) predicts whether send would fire a transition", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    expect(runtime.can({ type: "NEXT" })).toBe(true);
    expect(runtime.can({ type: "RESET" })).toBe(false); // not declared on red
    runtime.send({ type: "EMERGENCY" }); // → halt
    expect(runtime.can({ type: "NEXT" })).toBe(false); // not declared on halt
    expect(runtime.can({ type: "RESET" })).toBe(true);
  });

  it("can() returns false after dispose", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.dispose();
    expect(runtime.can({ type: "NEXT" })).toBe(false);
  });

  it("can() returns false for guarded transitions whose guards reject", () => {
    type C = { open: boolean };
    type E = { type: "GO" };
    const def = trafficLight; // not used; redefine locally
    void def;
    const local = createRuntime<C, E, "a" | "b">(
      {
        id: "g",
        initial: "a",
        context: { open: false },
        states: {
          a: { on: { GO: { target: "b", guard: "isOpen" } } },
          b: {},
        },
      },
      {
        guards: { isOpen: ({ context }) => context.open },
      },
    );
    expect(local.can({ type: "GO" })).toBe(false);
  });

  it("on('transition') fires when send changes state", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const events: string[] = [];
    runtime.on("transition", (e) => {
      events.push(`${e.prev.value}->${e.next.value}`);
    });
    runtime.send({ type: "NEXT" });
    runtime.send({ type: "NEXT" });
    expect(events).toEqual(["red->green", "green->yellow"]);
  });

  it("on('transition') skips no-op events", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const fn = vi.fn();
    runtime.on("transition", fn);
    runtime.send({ type: "GHOST" as unknown as "NEXT" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("on('dispose') fires once when runtime is disposed", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const fn = vi.fn();
    runtime.on("dispose", fn);
    runtime.dispose();
    runtime.dispose(); // idempotent — listener should not fire again
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("on({once}) removes the listener after first call", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const fn = vi.fn();
    runtime.on("transition", fn, { once: true });
    runtime.send({ type: "NEXT" });
    runtime.send({ type: "NEXT" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("on({signal}) removes the listener when signal aborts", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const ac = new AbortController();
    const fn = vi.fn();
    runtime.on("transition", fn, { signal: ac.signal });
    runtime.send({ type: "NEXT" });
    ac.abort();
    runtime.send({ type: "NEXT" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("on({signal}) is a no-op when signal is already aborted", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const ac = new AbortController();
    ac.abort();
    const fn = vi.fn();
    const off = runtime.on("transition", fn, { signal: ac.signal });
    expect(typeof off).toBe("function");
    off(); // exercise the no-op unsubscribe
    runtime.send({ type: "NEXT" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("can() handles array-of-transitions states (yellow → fallback)", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.send({ type: "NEXT" }); // red → green
    runtime.send({ type: "NEXT" }); // green → yellow (ticks=2, even)
    // yellow.on.NEXT is an array; ticksOdd guard fails (even), fallback has no guard
    expect(runtime.can({ type: "NEXT" })).toBe(true);
  });

  it("on('error') fires for async effect handler rejections", async () => {
    const errors: unknown[] = [];
    const runtime = createRuntime(trafficLight, {
      ...makeImpl(),
      effects: {
        trackTransition: async () => {
          throw new Error("boom");
        },
        logEnter: () => {},
      },
    });
    runtime.on("error", (e) => {
      errors.push(e.error);
    });
    runtime.send({ type: "NEXT" });
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
  });

  it("on() returned unsubscribe removes the listener", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const fn = vi.fn();
    const off = runtime.on("transition", fn);
    off();
    runtime.send({ type: "NEXT" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("on() after dispose is a no-op", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.dispose();
    const fn = vi.fn();
    const off = runtime.on("transition", fn);
    expect(typeof off).toBe("function");
    off(); // exercise the no-op
  });

  it("subscribe() after dispose returns a no-op unsubscribe that is safe to call", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    runtime.dispose();
    const off = runtime.subscribe(() => {});
    expect(() => off()).not.toThrow();
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

  it("reset() on initial state does not notify listeners", () => {
    const runtime = createRuntime(trafficLight, makeImpl());
    const listener = vi.fn();
    runtime.subscribe(listener);
    runtime.reset(); // already at "red"; no change
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset() middleware sees changed=false when already at initial", () => {
    let observed = true;
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (mw, next) => {
          observed = mw.changed;
          next();
        },
      ],
    });
    runtime.reset();
    expect(observed).toBe(false);
  });
});
