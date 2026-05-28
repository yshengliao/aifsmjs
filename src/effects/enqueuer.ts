import type { Enqueuer } from "../fsm/types.js";

/**
 * Build a closure-based Enqueuer that pushes effects into the supplied sink.
 * Each `step()` invocation creates one such enqueuer and discards it
 * afterwards; the sink is the effects array later returned to the caller.
 *
 * Lives in `effects/` because the Enqueuer concept is the effects-domain API
 * — `step()` imports it from here.
 */
export function createEnqueuer(sink: { type: string; payload?: unknown }[]): Enqueuer {
  return Object.freeze({
    effect(type: string, payload?: unknown) {
      if (payload === undefined) {
        sink.push(Object.freeze({ type }));
      } else {
        sink.push(Object.freeze({ type, payload }));
      }
    },
  });
}
