// Example 03 — e-commerce checkout funnel. Demonstrates that aifsmjs scales
// down to plain web flows (no game / canvas involvement). Shows:
//   • narrowed event union with payload (CartItem)
//   • guarded transition (cart must be non-empty before paying)
//   • effects for side outputs (analytics, payment gateway)
//   • replay() to reproduce a customer's funnel from an event log
//
// Run with: pnpm example:checkout-funnel

import {
  type Implementations,
  assign,
  createRuntime,
  initialSnapshot,
  setup,
} from "../../src/index.js";
import { replay } from "../../src/replay/index.js";

type CartItem = { id: string; price: number; qty: number };

type Ctx = {
  cart: CartItem[];
  subtotal: number;
  shippingAddressOk: boolean;
  paymentMethod: "card" | "wallet" | null;
  orderId: string | null;
};

type Evt =
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "GO_TO_SHIPPING" }
  | { type: "SET_ADDRESS"; ok: boolean }
  | { type: "GO_TO_PAYMENT" }
  | { type: "CHOOSE_PAYMENT"; method: "card" | "wallet" }
  | { type: "PLACE_ORDER" }
  | { type: "ORDER_CONFIRMED"; orderId: string }
  | { type: "RESET" };

type States = "cart" | "shipping" | "payment" | "review" | "placing" | "confirmed";

const machine = setup<Ctx, Evt>().defineMachine({
  id: "checkout",
  initial: "cart",
  context: {
    cart: [],
    subtotal: 0,
    shippingAddressOk: false,
    paymentMethod: null,
    orderId: null,
  },
  states: {
    cart: {
      on: {
        ADD_ITEM: { actions: ["pushItem", "track:item_added"] },
        REMOVE_ITEM: { actions: ["pullItem"] },
        GO_TO_SHIPPING: {
          target: "shipping",
          guard: "cartHasItems",
        },
      },
    },
    shipping: {
      on: {
        SET_ADDRESS: { actions: ["setAddress"] },
        GO_TO_PAYMENT: {
          target: "payment",
          guard: "shippingReady",
        },
      },
    },
    payment: {
      on: {
        CHOOSE_PAYMENT: { actions: ["setMethod"] },
        PLACE_ORDER: {
          target: "review",
          guard: "paymentReady",
        },
      },
    },
    review: {
      on: {
        PLACE_ORDER: {
          target: "placing",
          actions: ["submitOrder"],
        },
      },
    },
    placing: {
      on: {
        ORDER_CONFIRMED: { target: "confirmed", actions: ["recordOrderId"] },
      },
    },
    confirmed: {
      entry: ["track:purchase"],
      on: { RESET: { target: "cart", actions: ["resetCart"] } },
    },
  },
});

const impl: Implementations<Ctx, Evt> = {
  guards: {
    cartHasItems: ({ context }) => context.cart.length > 0,
    shippingReady: ({ context }) => context.shippingAddressOk,
    paymentReady: ({ context }) => context.paymentMethod !== null,
  },
  actions: {
    pushItem: assign(({ context, event }) => {
      if (event.type !== "ADD_ITEM") return {};
      const cart = [...context.cart, event.item];
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      return { cart, subtotal };
    }),
    pullItem: assign(({ context, event }) => {
      if (event.type !== "REMOVE_ITEM") return {};
      const cart = context.cart.filter((i) => i.id !== event.id);
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      return { cart, subtotal };
    }),
    setAddress: assign(({ event }) =>
      event.type === "SET_ADDRESS" ? { shippingAddressOk: event.ok } : {},
    ),
    setMethod: assign(({ event }) =>
      event.type === "CHOOSE_PAYMENT" ? { paymentMethod: event.method } : {},
    ),
    submitOrder: ({ enqueue }) => {
      enqueue.effect("payment.charge", {});
    },
    recordOrderId: assign(({ event }) =>
      event.type === "ORDER_CONFIRMED" ? { orderId: event.orderId } : {},
    ),
    resetCart: assign(() => ({
      cart: [],
      subtotal: 0,
      shippingAddressOk: false,
      paymentMethod: null,
      orderId: null,
    })),
    "track:item_added": ({ enqueue, event }) => {
      enqueue.effect("analytics", { name: "item_added", payload: event });
    },
    "track:purchase": ({ enqueue, context }) => {
      enqueue.effect("analytics", { name: "purchase", payload: { orderId: context.orderId } });
    },
  },
  effects: {
    "payment.charge": (_, { context }) => {
      // In a real app this would call the payment gateway. For the demo we
      // just log; the runtime captures async rejections on the 'error' event.
      console.log(`charging $${context.subtotal} ${context.paymentMethod}…`);
    },
    analytics: (effect) => {
      console.log(`analytics: ${(effect.payload as { name: string })?.name ?? "?"}`);
    },
  },
};

const runtime = createRuntime(machine, impl);

const log: Evt[] = [];
runtime.on("transition", (e) => {
  console.log(`→ ${e.prev.value} → ${e.next.value} via ${e.event.type}`);
  if (e.event.type !== "@@aifsmjs/RESET") log.push(e.event as Evt);
});

runtime.send({ type: "ADD_ITEM", item: { id: "sku-1", price: 1290, qty: 1 } });
runtime.send({ type: "ADD_ITEM", item: { id: "sku-2", price: 480, qty: 2 } });
runtime.send({ type: "GO_TO_SHIPPING" });
runtime.send({ type: "SET_ADDRESS", ok: true });
runtime.send({ type: "GO_TO_PAYMENT" });
runtime.send({ type: "CHOOSE_PAYMENT", method: "wallet" });
runtime.send({ type: "PLACE_ORDER" });
runtime.send({ type: "PLACE_ORDER" }); // transition: review → placing
runtime.send({ type: "ORDER_CONFIRMED", orderId: "ord-42" });

console.log(`\nfinal: ${runtime.getSnapshot().value} (orderId=${runtime.getSnapshot().context.orderId})`);

// --- Replay the captured log; the resulting snapshot must equal the live one
const replayed = replay(initialSnapshot(machine), log, machine, impl);
console.log(`replay match: ${replayed.snapshot.value === runtime.getSnapshot().value}`);
