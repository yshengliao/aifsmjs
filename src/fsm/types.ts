// All public types live here so AI agents and humans can read the entire
// public surface in one file.

export type Effect = Readonly<{ type: string; payload?: unknown }>;

export type Enqueuer = Readonly<{
  effect: (type: string, payload?: unknown) => void;
}>;

export type GuardArgs<Ctx, Evt> = Readonly<{
  context: Ctx;
  event: Evt;
  /**
   * Optional guard registry, threaded by `evalGuard` so combinators can resolve
   * string refs nested inside `and / or / not`. Inline user guards may safely
   * ignore this field — it is `undefined` when guards are evaluated outside of
   * `evalGuard` (e.g. in unit tests calling the function directly).
   */
  guards?: Readonly<Record<string, Guard<Ctx, Evt>>>;
  /**
   * Current state value, threaded by `evalGuard` from the live snapshot. Used
   * by the `stateIn` combinator. `undefined` when guards are called outside of
   * a lifecycle evaluation.
   */
  value?: string;
}>;

export type Guard<Ctx, Evt> = (args: GuardArgs<Ctx, Evt>) => boolean;

export type Action<Ctx, Evt> = (args: {
  context: Ctx;
  event: Evt;
  enqueue: Enqueuer;
}) => Partial<Ctx> | void;

export type EffectHandler<Ctx, Evt> = (
  effect: Effect,
  args: { context: Ctx; event: Evt; signal: AbortSignal },
) => void | Promise<void>;

export type GuardRef<Ctx, Evt> = string | Guard<Ctx, Evt>;
export type ActionRef<Ctx, Evt> = string | Action<Ctx, Evt>;

export type TransitionDef<Ctx, Evt, States extends string> = Readonly<{
  target?: States;
  guard?: GuardRef<Ctx, Evt>;
  actions?: readonly ActionRef<Ctx, Evt>[];
}>;

export type StateDef<Ctx, Evt, States extends string> = Readonly<{
  on?: Readonly<
    Record<string, TransitionDef<Ctx, Evt, States> | readonly TransitionDef<Ctx, Evt, States>[]>
  >;
  entry?: readonly ActionRef<Ctx, Evt>[];
  exit?: readonly ActionRef<Ctx, Evt>[];
  final?: boolean;
}>;

export type MachineDef<Ctx, Evt extends { type: string }, States extends string> = Readonly<{
  id: string;
  initial: States;
  context: Ctx;
  states: Readonly<Record<States, StateDef<Ctx, Evt, States>>>;
}>;

export type Snapshot<Ctx, States extends string> = Readonly<{
  value: States;
  context: Ctx;
  status: "active" | "final";
}>;

export type Implementations<Ctx, Evt> = Readonly<{
  guards?: Readonly<Record<string, Guard<Ctx, Evt>>>;
  actions?: Readonly<Record<string, Action<Ctx, Evt>>>;
  effects?: Readonly<Record<string, EffectHandler<Ctx, Evt>>>;
}>;

export type StepResult<Ctx, States extends string> = Readonly<{
  snapshot: Snapshot<Ctx, States>;
  effects: readonly Effect[];
  changed: boolean;
}>;

/**
 * Sentinel event type that `Runtime.reset()` synthesises when the caller does
 * not pass an explicit event. Middleware receives it through
 * `MiddlewareContext.event`. Exposed so user code can discriminate.
 */
export const RESET_EVENT_TYPE = "@@aifsmjs/RESET" as const;
export type ResetEvent = Readonly<{ type: typeof RESET_EVENT_TYPE }>;

export type MiddlewareContext<Ctx, Evt, States extends string> = Readonly<{
  prev: Snapshot<Ctx, States>;
  next: Snapshot<Ctx, States>;
  /**
   * The triggering event. May be the user's `Evt` (from `send()` or an
   * explicit `reset(event)`) or the `ResetEvent` sentinel emitted by a
   * `reset()` with no event argument.
   */
  event: Evt | ResetEvent;
  effects: readonly Effect[];
  changed: boolean;
}>;

export type Middleware<Ctx, Evt, States extends string> = (
  ctx: MiddlewareContext<Ctx, Evt, States>,
  next: () => void,
) => void;

export interface Runtime<Ctx, Evt extends { type: string }, States extends string> {
  getSnapshot(): Snapshot<Ctx, States>;
  send(event: Evt): Snapshot<Ctx, States>;
  subscribe(listener: (snap: Snapshot<Ctx, States>) => void): () => void;
  /**
   * Re-initialise the runtime to the definition's initial snapshot. Triggers
   * subscribers but does NOT run entry actions (reset = re-birth, not
   * "transition into initial"). Throws RuntimeDisposedError if disposed.
   * If an `event` is supplied, middleware sees it as the trigger; otherwise
   * a sentinel `{ type: "@@aifsmjs/RESET" }` is synthesised.
   */
  reset(event?: Evt): Snapshot<Ctx, States>;
  /**
   * Tear down: abort the internal AbortController (effect handlers see signal
   * fire), clear listeners, and mark this runtime as disposed. Subsequent
   * send()/reset() calls throw RuntimeDisposedError. Idempotent.
   */
  dispose(): void;
  /**
   * True after `dispose()` has been called.
   */
  readonly disposed: boolean;
  /**
   * AbortSignal scoped to this runtime's lifetime. Fires once on dispose().
   * Threaded to every EffectHandler invocation; external integrations
   * (e.g. component teardown) can also attach `signal.addEventListener("abort", ...)`.
   */
  readonly signal: AbortSignal;
}

export type RuntimeOptions<Ctx, Evt, States extends string> = Readonly<{
  middleware?: readonly Middleware<Ctx, Evt, States>[];
  /**
   * If false, do not dispatch effects through the effect handler map.
   * Useful for replay / dry-run modes. Defaults to true.
   */
  dispatchEffects?: boolean;
}>;
