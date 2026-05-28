// Example 02 — document approval workflow. Demonstrates:
//   • multi-candidate transitions with guards
//   • effects (enqueue.effect) + handlers
//   • inspect middleware: persist to in-memory storage
//   • replay() of the event log to reproduce the final snapshot
//
// Run with: pnpm example:approval

import {
  assign,
  createRuntime,
  setup,
  type Implementations,
} from "../../src/index.js";
import { and } from "../../src/guards/index.js";
import { persist, recorder, type RecordedEntry } from "../../src/inspect/index.js";
import { replay } from "../../src/replay/index.js";

type Ctx = {
  authorId: string;
  reviewers: string[];
  comments: number;
  archivedAt: number | null;
};
type Evt =
  | { type: "SUBMIT" }
  | { type: "REVIEW"; reviewer: string }
  | { type: "COMMENT" }
  | { type: "APPROVE" }
  | { type: "REJECT" }
  | { type: "ARCHIVE" };

type States = "draft" | "review" | "approved" | "rejected" | "archived";

const machine = setup<Ctx, Evt>().defineMachine({
  id: "approval",
  initial: "draft",
  context: { authorId: "u-001", reviewers: [], comments: 0, archivedAt: null },
  states: {
    draft: {
      on: {
        SUBMIT: { target: "review", actions: ["notifyReviewers"] },
      },
    },
    review: {
      on: {
        REVIEW: { actions: ["addReviewer"] },
        COMMENT: { actions: ["bumpComments"] },
        APPROVE: [
          {
            target: "approved",
            guard: and<Ctx, Evt>(["hasEnoughReviewers"]),
            actions: ["notifyAuthor"],
          },
          // Fallback: not enough reviewers yet, swallow event silently.
        ],
        REJECT: { target: "rejected", actions: ["notifyAuthor"] },
      },
    },
    approved: {
      entry: ["logFinal"],
      on: { ARCHIVE: { target: "archived", actions: ["stampArchivedAt"] } },
    },
    rejected: {
      entry: ["logFinal"],
      on: { ARCHIVE: { target: "archived", actions: ["stampArchivedAt"] } },
    },
    archived: { final: true },
  },
});

const impl: Implementations<Ctx, Evt> = {
  guards: {
    hasEnoughReviewers: ({ context }) => context.reviewers.length >= 2,
  },
  actions: {
    notifyReviewers: ({ enqueue }) => {
      enqueue.effect("email", { template: "review-request" });
    },
    notifyAuthor: ({ context, enqueue }) => {
      enqueue.effect("email", { template: "decision", to: context.authorId });
    },
    addReviewer: assign(({ context, event }) => {
      if (event.type !== "REVIEW") return {};
      if (context.reviewers.includes(event.reviewer)) return {};
      return { reviewers: [...context.reviewers, event.reviewer] };
    }),
    bumpComments: assign(({ context }) => ({ comments: context.comments + 1 })),
    stampArchivedAt: assign(() => ({ archivedAt: 1748390400000 })),
    logFinal: ({ enqueue }) => {
      enqueue.effect("audit", { stage: "final" });
    },
  },
  effects: {
    email: (eff, { signal }) => {
      // Honour the runtime's signal: a real handler would pass it through to
      // `fetch(url, { signal })` so dispose() also cancels in-flight requests.
      if (signal.aborted) return;
      console.log(`[effect:email] ${JSON.stringify(eff.payload)}`);
    },
    audit: (eff) => {
      console.log(`[effect:audit] ${JSON.stringify(eff.payload)}`);
    },
  },
};

// In-memory "localStorage" stand-in
const memStorage: Record<string, string> = {};

const recorded: RecordedEntry<Ctx, Evt, States>[] = [];

const runtime = createRuntime(machine, impl, {
  middleware: [
    persist<Ctx, Evt, States>({
      key: "approval-snapshot",
      storage: {
        setItem(k, v) {
          memStorage[k] = v;
        },
      },
    }),
    recorder<Ctx, Evt, States>(recorded),
  ],
});

const events: Evt[] = [
  { type: "SUBMIT" },
  { type: "REVIEW", reviewer: "alice" },
  { type: "COMMENT" },
  { type: "APPROVE" }, // not enough reviewers — swallowed
  { type: "REVIEW", reviewer: "bob" },
  { type: "APPROVE" },
  { type: "ARCHIVE" },
];

for (const e of events) {
  runtime.send(e);
  console.log(`→ ${runtime.getSnapshot().value}`);
}

console.log("\n--- persisted snapshot ---");
console.log(memStorage["approval-snapshot"]);

console.log("\n--- recorder middleware captured ---");
console.log(`${recorded.length} transitions, last:`, {
  event: recorded[recorded.length - 1]?.event.type,
  value: recorded[recorded.length - 1]?.next.value,
});

console.log("\n--- replay() reproduces the same final snapshot ---");
const initial = JSON.parse(memStorage["approval-snapshot"] ?? "null");
const replayed = replay(
  {
    value: machine.initial,
    context: machine.context,
    status: "active",
  },
  events,
  machine,
  impl,
);
console.log("live  :", { value: initial.value, context: initial.context });
console.log("replay:", { value: replayed.snapshot.value, context: replayed.snapshot.context });
console.log("equal :", initial.value === replayed.snapshot.value);

console.log("\n--- teardown via runtime.dispose() ---");
console.log("signal before dispose:", runtime.signal.aborted);
runtime.dispose();
console.log("signal after  dispose:", runtime.signal.aborted);
try {
  runtime.send({ type: "SUBMIT" });
} catch (err) {
  console.log("post-dispose send rejected:", (err as Error).name);
}
