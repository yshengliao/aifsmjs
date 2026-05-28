import { describe, expect, it } from "vitest";
import { createSnapshot, deepFreeze } from "../../src/fsm/snapshot.js";

describe("snapshot helpers", () => {
  it("createSnapshot freezes the top object", () => {
    const s = createSnapshot({ value: "a", context: { n: 1 } });
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("deepFreeze freezes nested objects", () => {
    const root = { a: { b: { c: 1 } }, arr: [{ x: 1 }] };
    deepFreeze(root);
    expect(Object.isFrozen(root.a)).toBe(true);
    expect(Object.isFrozen(root.a.b)).toBe(true);
    expect(Object.isFrozen(root.arr)).toBe(true);
    expect(Object.isFrozen(root.arr[0])).toBe(true);
  });

  it("snapshot round-trips through JSON", () => {
    const s = createSnapshot({ value: "red", context: { ticks: 0 } });
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ value: "red", context: { ticks: 0 }, status: "active" });
  });

  it("deepFreeze short-circuits on primitives and frozen values", () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze(undefined)).toBeUndefined();
    expect(deepFreeze(42)).toBe(42);
    const already = Object.freeze({ a: 1 });
    expect(deepFreeze(already)).toBe(already);
  });

  it("createSnapshot honours explicit status='final'", () => {
    const s = createSnapshot({ value: "done", context: {}, status: "final" });
    expect(s.status).toBe("final");
  });
});
