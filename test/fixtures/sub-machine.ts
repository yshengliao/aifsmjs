import { defineMachine, setup } from "../../src/fsm/definition.js";
import type { Implementations } from "../../src/fsm/types.js";

// ---------------------------------------------------------------------------
// Shared log — reset in beforeEach
// ---------------------------------------------------------------------------

export const log: string[] = [];
export function resetLog() {
  log.length = 0;
}

// ---------------------------------------------------------------------------
// Child machine: fetching / ready
// ---------------------------------------------------------------------------

export const childMachine = defineMachine<
  { hits: number },
  { type: "RESOLVE" } | { type: "RETRY" },
  "fetching" | "ready"
>({
  id: "child",
  initial: "fetching",
  context: { hits: 0 },
  states: {
    fetching: {
      entry: ["logChildEnter"],
      exit: ["logChildExit"],
      on: { RESOLVE: { target: "ready" } },
    },
    ready: { entry: ["logChildEnter"] },
  },
});

export const childImpl: Implementations<{ hits: number }, { type: "RESOLVE" } | { type: "RETRY" }> =
  {
    actions: {
      logChildEnter: () => {
        log.push("child:enter");
        return undefined;
      },
      logChildExit: () => {
        log.push("child:exit");
        return undefined;
      },
    },
  };

// ---------------------------------------------------------------------------
// Parent machine: idle / loading / done
// loading has sub: childMachine, subImpl: childImpl
// RETRY on loading is a self-targeting external transition (A → A)
// ---------------------------------------------------------------------------

export const parentMachine = setup<
  { step: number },
  { type: "START" } | { type: "FINISH" } | { type: "RETRY" }
>().defineMachine({
  id: "parent",
  initial: "idle",
  context: { step: 0 },
  states: {
    idle: { on: { START: { target: "loading" } } },
    loading: {
      entry: ["logParentEnter"],
      exit: ["logParentExit"],
      sub: childMachine,
      subImpl: childImpl,
      on: {
        FINISH: { target: "done" },
        RETRY: { target: "loading" }, // self-targeting external
      },
    },
    done: { final: true },
  },
});

export const parentImpl: Implementations<
  { step: number },
  { type: "START" } | { type: "FINISH" } | { type: "RETRY" }
> = {
  actions: {
    logParentEnter: () => {
      log.push("parent:enter");
      return undefined;
    },
    logParentExit: () => {
      log.push("parent:exit");
      return undefined;
    },
  },
};
