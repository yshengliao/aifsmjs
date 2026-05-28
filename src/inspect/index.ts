import type { Middleware, MiddlewareContext } from "../fsm/types.js";

export type { Middleware, MiddlewareContext } from "../fsm/types.js";

/**
 * Log every transition that changed the snapshot. Default formatter:
 *   "[EVENT_TYPE] oldState → newState"
 *
 * Pass a custom `out` callback to integrate with structured logging.
 */
export function logger<Ctx, Evt extends { type: string }, States extends string>(
  out: (line: string, ctx: MiddlewareContext<Ctx, Evt, States>) => void = (l) => console.log(l),
): Middleware<Ctx, Evt, States> {
  return (mw, next) => {
    next();
    if (mw.changed) {
      out(`[${mw.event.type}] ${mw.prev.value} → ${mw.next.value}`, mw);
    }
  };
}

export type StorageLike = {
  setItem(key: string, value: string): void;
};

/**
 * Persist the latest snapshot to a storage-like sink on every change. The
 * snapshot is JSON-serialised; non-serializable context fields will throw.
 *
 * For replay, pair this with `aifsmjs/replay` and an event log of your own
 * choosing — this middleware only persists the latest snapshot.
 */
export function persist<Ctx, Evt extends { type: string }, States extends string>(opts: {
  key: string;
  storage: StorageLike;
}): Middleware<Ctx, Evt, States> {
  return (mw, next) => {
    next();
    if (mw.changed) {
      opts.storage.setItem(opts.key, JSON.stringify(mw.next));
    }
  };
}

/**
 * Collect every event-snapshot pair into the supplied array. Useful for
 * test assertions, time-travel debugging, or building event logs to feed
 * back into `replay()`.
 */
export type RecordedEntry<Ctx, Evt, States extends string> = Readonly<{
  event: MiddlewareContext<Ctx, Evt, States>["event"];
  prev: MiddlewareContext<Ctx, Evt, States>["prev"];
  next: MiddlewareContext<Ctx, Evt, States>["next"];
  changed: boolean;
}>;

export function recorder<Ctx, Evt extends { type: string }, States extends string>(
  sink: RecordedEntry<Ctx, Evt, States>[],
): Middleware<Ctx, Evt, States> {
  return (mw, next) => {
    next();
    sink.push({
      event: mw.event,
      prev: mw.prev,
      next: mw.next,
      changed: mw.changed,
    });
  };
}
