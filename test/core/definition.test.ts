import { describe, expect, it } from "vitest";
import {
  InvalidDefinitionError,
  defineMachine,
  initialSnapshot,
} from "../../src/core/definition.js";

describe("defineMachine", () => {
  it("returns the same definition object", () => {
    const def = defineMachine<Record<string, never>, { type: string }, "a" | "b">({
      id: "m",
      initial: "a",
      context: {},
      states: { a: {}, b: {} },
    });
    expect(def.id).toBe("m");
    expect(def.initial).toBe("a");
  });

  it("throws when id is missing", () => {
    expect(() =>
      defineMachine({
        id: "",
        initial: "a",
        context: {},
        states: { a: {} },
        // biome-ignore lint/suspicious/noExplicitAny: invalid input on purpose
      } as any),
    ).toThrow(InvalidDefinitionError);
  });

  it("throws when initial is not declared", () => {
    expect(() =>
      defineMachine({
        id: "m",
        // biome-ignore lint/suspicious/noExplicitAny: invalid input on purpose
        initial: "nope" as any,
        context: {},
        states: { a: {} },
      }),
    ).toThrow(/not declared/);
  });

  it("throws when transition target is not declared", () => {
    expect(() =>
      defineMachine({
        id: "m",
        initial: "a",
        context: {},
        states: {
          a: {
            on: {
              // biome-ignore lint/suspicious/noExplicitAny: invalid input on purpose
              GO: { target: "ghost" as any },
            },
          },
        },
      }),
    ).toThrow(/unknown state/);
  });

  it("throws when states is empty", () => {
    expect(() =>
      defineMachine({
        id: "m",
        // biome-ignore lint/suspicious/noExplicitAny: invalid input on purpose
        initial: "a" as any,
        context: {},
        states: {},
      }),
    ).toThrow(InvalidDefinitionError);
  });
});

describe("initialSnapshot", () => {
  it("uses the initial state and context", () => {
    const def = defineMachine<{ n: number }, { type: string }, "a" | "b">({
      id: "m",
      initial: "a",
      context: { n: 0 },
      states: { a: {}, b: {} },
    });
    const snap = initialSnapshot(def);
    expect(snap.value).toBe("a");
    expect(snap.context).toEqual({ n: 0 });
    expect(snap.status).toBe("active");
  });

  it("marks final state", () => {
    const def = defineMachine({
      id: "m",
      initial: "done",
      context: {},
      states: { done: { final: true } },
    });
    expect(initialSnapshot(def).status).toBe("final");
  });
});
