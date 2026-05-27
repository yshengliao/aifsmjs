import { describe, expect, it } from "vitest";
import { initialSnapshot } from "../../src/core/definition.js";
import { createRuntime } from "../../src/core/runtime.js";
import { replay } from "../../src/replay/index.js";
import { type Evt, makeImpl, trafficLight } from "../fixtures/traffic-light.js";

describe("replay", () => {
  it("empty event log returns initial snapshot", () => {
    const r = replay(initialSnapshot(trafficLight), [], trafficLight, makeImpl());
    expect(r.snapshot).toEqual(initialSnapshot(trafficLight));
  });

  it("folds events through step()", () => {
    const events: Evt[] = [{ type: "NEXT" }, { type: "NEXT" }];
    const r = replay(initialSnapshot(trafficLight), events, trafficLight, makeImpl());
    expect(r.snapshot.value).toBe("yellow");
    expect(r.snapshot.context.ticks).toBe(2);
  });

  it("collects effects across events", () => {
    const events: Evt[] = [{ type: "NEXT" }, { type: "EMERGENCY" }];
    const r = replay(initialSnapshot(trafficLight), events, trafficLight, makeImpl());
    expect(r.effects.some((e) => e.type === "trackTransition")).toBe(true);
    expect(r.effects.some((e) => e.type === "logEnter")).toBe(true);
  });

  it("matches createRuntime fold", () => {
    const events: Evt[] = [
      { type: "NEXT" },
      { type: "NEXT" },
      { type: "NEXT" },
      { type: "EMERGENCY" },
      { type: "RESET" },
    ];
    const runtime = createRuntime(trafficLight, makeImpl(), { dispatchEffects: false });
    for (const e of events) runtime.send(e);
    const live = runtime.getSnapshot();
    const replayed = replay(
      initialSnapshot(trafficLight),
      events,
      trafficLight,
      makeImpl(),
    ).snapshot;
    expect(replayed.value).toBe(live.value);
    expect(replayed.context).toEqual(live.context);
  });
});
