import type { Snapshot } from "./types.js";

const IS_DEV =
  typeof process !== "undefined" &&
  typeof process.env !== "undefined" &&
  process.env.NODE_ENV !== "production";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Wrap a freshly built snapshot. In dev mode the whole tree is deep-frozen so
 * accidental mutation throws immediately. In production only the top object is
 * frozen, keeping the cost negligible.
 */
export function freezeSnapshot<C, S extends string>(snap: Snapshot<C, S>): Snapshot<C, S> {
  if (IS_DEV) return deepFreeze(snap);
  Object.freeze(snap);
  return snap;
}

export function createSnapshot<C, S extends string>(args: {
  value: S;
  context: C;
  status?: "active" | "final";
}): Snapshot<C, S> {
  return freezeSnapshot({
    value: args.value,
    context: args.context,
    status: args.status ?? "active",
  });
}
