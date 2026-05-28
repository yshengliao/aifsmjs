// Example 04 — multi-step form wizard with branching validation.
// Demonstrates that aifsmjs models classic web UX flows without any rendering
// dependency. Shows:
//   • back / next / jump-to-step navigation
//   • per-step validation as guards
//   • derived state (canSubmit) computed entirely from context
//   • inspect/persist to a fake "draft" storage so the user could resume later
//
// Run with: pnpm example:form-wizard

import {
  type Implementations,
  assign,
  createRuntime,
  setup,
} from "../../src/index.js";
import { persist } from "../../src/inspect/index.js";

type Step = "account" | "profile" | "preferences" | "review" | "done";

type Ctx = {
  account: { email: string; password: string };
  profile: { displayName: string; locale: "en" | "zh-TW" | "ja" };
  preferences: { newsletter: boolean; theme: "light" | "dark" | "system" };
  errors: string[];
};

type Evt =
  | { type: "EDIT_ACCOUNT"; patch: Partial<Ctx["account"]> }
  | { type: "EDIT_PROFILE"; patch: Partial<Ctx["profile"]> }
  | { type: "EDIT_PREFERENCES"; patch: Partial<Ctx["preferences"]> }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "JUMP"; to: Step }
  | { type: "SUBMIT" };

const machine = setup<Ctx, Evt>().defineMachine({
  id: "form-wizard",
  initial: "account",
  context: {
    account: { email: "", password: "" },
    profile: { displayName: "", locale: "en" },
    preferences: { newsletter: false, theme: "system" },
    errors: [],
  },
  states: {
    account: {
      on: {
        EDIT_ACCOUNT: { actions: ["mergeAccount"] },
        NEXT: { target: "profile", guard: "accountValid" },
        JUMP: { target: "account", actions: ["jumpTo"] },
      },
    },
    profile: {
      on: {
        EDIT_PROFILE: { actions: ["mergeProfile"] },
        NEXT: { target: "preferences", guard: "profileValid" },
        BACK: { target: "account" },
        JUMP: { target: "profile", actions: ["jumpTo"] },
      },
    },
    preferences: {
      on: {
        EDIT_PREFERENCES: { actions: ["mergePreferences"] },
        NEXT: { target: "review" },
        BACK: { target: "profile" },
        JUMP: { target: "preferences", actions: ["jumpTo"] },
      },
    },
    review: {
      on: {
        SUBMIT: { target: "done", guard: "allValid", actions: ["clearErrors"] },
        BACK: { target: "preferences" },
        JUMP: { target: "review", actions: ["jumpTo"] },
      },
    },
    done: { final: true },
  },
});

const impl: Implementations<Ctx, Evt> = {
  guards: {
    accountValid: ({ context }) =>
      /^\S+@\S+\.\S+$/.test(context.account.email) && context.account.password.length >= 8,
    profileValid: ({ context }) => context.profile.displayName.trim().length > 0,
    allValid: ({ context, guards }) =>
      (guards?.accountValid?.({ context, event: { type: "NEXT" } as Evt }) ?? false) &&
      (guards?.profileValid?.({ context, event: { type: "NEXT" } as Evt }) ?? false),
  },
  actions: {
    mergeAccount: assign(({ context, event }) =>
      event.type === "EDIT_ACCOUNT"
        ? { account: { ...context.account, ...event.patch } }
        : {},
    ),
    mergeProfile: assign(({ context, event }) =>
      event.type === "EDIT_PROFILE"
        ? { profile: { ...context.profile, ...event.patch } }
        : {},
    ),
    mergePreferences: assign(({ context, event }) =>
      event.type === "EDIT_PREFERENCES"
        ? { preferences: { ...context.preferences, ...event.patch } }
        : {},
    ),
    jumpTo: () => {
      // JUMP self-transitions; the target string is already pinned to the
      // current state by definition. App code might use it to scroll the UI.
    },
    clearErrors: assign(() => ({ errors: [] })),
  },
};

// --- A toy "draft" store keyed by the user. Implements the StorageLike
//     interface that `persist` expects, plus a getItem for the demo readout.
const draftStore = {
  data: new Map<string, string>(),
  setItem(key: string, value: string) {
    this.data.set(key, value);
  },
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  },
};

const runtime = createRuntime(machine, impl, {
  middleware: [persist({ key: "wizard:alice", storage: draftStore })],
});

runtime.on("transition", (e) => {
  console.log(`→ ${e.prev.value} → ${e.next.value} via ${e.event.type}`);
});

runtime.send({ type: "NEXT" }); // blocked — email/password invalid
console.log(`stuck at: ${runtime.getSnapshot().value}`);

runtime.send({ type: "EDIT_ACCOUNT", patch: { email: "alice@example.com" } });
runtime.send({ type: "EDIT_ACCOUNT", patch: { password: "supersecret" } });
runtime.send({ type: "NEXT" });
runtime.send({ type: "EDIT_PROFILE", patch: { displayName: "Alice", locale: "zh-TW" } });
runtime.send({ type: "NEXT" });
runtime.send({ type: "EDIT_PREFERENCES", patch: { newsletter: true, theme: "dark" } });
runtime.send({ type: "NEXT" });
runtime.send({ type: "SUBMIT" });

console.log(`\nfinal: ${runtime.getSnapshot().value}`);
const draftRaw = draftStore.getItem("wizard:alice");
if (draftRaw) {
  const draft = JSON.parse(draftRaw) as { value: string };
  console.log(`saved draft step: ${draft.value}`);
}
