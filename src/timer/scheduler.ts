export type AfterHandle = Readonly<{
  cancel(): void;
}>;

export type SetTimeoutFn = (fn: () => void, ms: number) => unknown;
export type ClearTimeoutFn = (handle: unknown) => void;

export type AfterOptions = Readonly<{
  /**
   * If supplied and aborted, the callback never runs and any pending timer is
   * cleared. Aborting after fire is a no-op.
   */
  signal?: AbortSignal;
  /**
   * Override `setTimeout` (testing, SSR, custom loops). Defaults to globalThis.
   */
  setTimeout?: SetTimeoutFn;
  /**
   * Override `clearTimeout`. Must match the `setTimeout` you injected.
   */
  clearTimeout?: ClearTimeoutFn;
}>;

const NOOP: AfterHandle = Object.freeze({ cancel: () => {} });

function resolveTimers(opts: AfterOptions | undefined): {
  st: SetTimeoutFn;
  ct: ClearTimeoutFn;
} {
  return {
    st: opts?.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
    ct: opts?.clearTimeout ?? ((h) => globalThis.clearTimeout(h as number)),
  };
}

/**
 * Schedule `fn` to run after `ms` milliseconds. Returns a handle whose
 * `cancel()` clears the pending timer. Optional `signal` aborts the timer when
 * triggered. Aborting after the callback fires is a no-op.
 *
 * Per Node guidance, the abort listener is registered with `{ once: true }` to
 * avoid leaking listeners when the same signal is reused across many timers.
 */
export function after(ms: number, fn: () => void, opts?: AfterOptions): AfterHandle {
  if (opts?.signal?.aborted) return NOOP;

  const { st, ct } = resolveTimers(opts);
  let fired = false;
  let cancelled = false;

  const handle = st(() => {
    fired = true;
    /* v8 ignore next — defensive race guard: cancel() sets cancelled=true and clears the timer, but if a custom setTimeout fires after clear, this short-circuits fn(). */
    if (cancelled) return;
    fn();
  }, ms);

  const cancel = () => {
    if (fired || cancelled) return;
    cancelled = true;
    ct(handle);
  };

  if (opts?.signal) {
    opts.signal.addEventListener("abort", cancel, { once: true });
  }

  return Object.freeze({ cancel });
}

export type Scheduler = Readonly<{
  after(ms: number, fn: () => void, opts?: AfterOptions): AfterHandle;
  cancelAll(): void;
  readonly size: number;
}>;

/**
 * Build a scheduler that tracks every pending `after()` so they can be
 * cancelled together (e.g. on machine destroy). Each `after` returns a handle
 * whose `cancel()` also removes it from the tracking set.
 *
 * `defaults` are merged into every call — typically you inject `setTimeout` /
 * `clearTimeout` once at construction.
 */
export function createScheduler(defaults?: AfterOptions): Scheduler {
  const pending = new Set<AfterHandle>();

  const sched: Scheduler = {
    after(ms, fn, opts) {
      const merged: AfterOptions = { ...defaults, ...opts };
      // Forward-reference slot so `wrapped` can find the tracked handle
      // before it is constructed below.
      const slot: { ref?: AfterHandle } = {};
      const wrapped = () => {
        if (slot.ref) pending.delete(slot.ref);
        fn();
      };
      const inner = after(ms, wrapped, merged);
      const handle: AfterHandle = Object.freeze({
        cancel() {
          inner.cancel();
          if (slot.ref) pending.delete(slot.ref);
        },
      });
      slot.ref = handle;
      pending.add(handle);
      return handle;
    },
    cancelAll() {
      for (const h of pending) h.cancel();
      pending.clear();
    },
    get size() {
      return pending.size;
    },
  };
  return sched;
}
