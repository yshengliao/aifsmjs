import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../../src/fsm/runtime.js";
import { type RecordedEntry, logger, persist, recorder } from "../../src/inspect/index.js";
import {
  type Ctx,
  type Evt,
  type States,
  makeImpl,
  trafficLight,
} from "../fixtures/traffic-light.js";

describe("logger", () => {
  it("logs only when changed", () => {
    const out = vi.fn();
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [logger<Ctx, Evt, States>(out)],
    });
    runtime.send({ type: "NEXT" }); // changed
    runtime.send({ type: "GHOST" as unknown as "NEXT" }); // no-op
    expect(out).toHaveBeenCalledTimes(1);
    expect(out.mock.calls[0]?.[0]).toContain("red → green");
  });
});

describe("persist", () => {
  it("writes JSON to storage on each change", () => {
    const writes: Record<string, string> = {};
    const storage = {
      setItem: (k: string, v: string) => {
        writes[k] = v;
      },
    };
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [persist<Ctx, Evt, States>({ key: "k", storage })],
    });
    runtime.send({ type: "NEXT" });
    expect(writes.k).toContain('"value":"green"');
  });
});

describe("recorder", () => {
  it("captures every step", () => {
    const sink: RecordedEntry<Ctx, Evt, States>[] = [];
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [recorder<Ctx, Evt, States>(sink)],
    });
    runtime.send({ type: "NEXT" });
    runtime.send({ type: "EMERGENCY" });
    expect(sink).toHaveLength(2);
    expect(sink[0]?.next.value).toBe("green");
    expect(sink[1]?.next.value).toBe("halt");
  });
});

describe("read-only invariant", () => {
  it("middleware cannot mutate the next snapshot (frozen)", () => {
    const runtime = createRuntime(trafficLight, makeImpl(), {
      middleware: [
        (mw, next) => {
          expect(() => {
            // biome-ignore lint/suspicious/noExplicitAny: probing freeze
            (mw.next.context as any).ticks = 9999;
          }).toThrow();
          next();
        },
      ],
    });
    runtime.send({ type: "NEXT" });
    expect(runtime.getSnapshot().context.ticks).toBe(1);
  });
});
