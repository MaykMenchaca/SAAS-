import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CreateSalePayload } from "../api/sales";

export type CartItem = {
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: string;
  tax_rate: string;
  discount_percent: string;
  unit_abbreviation: string;
};

export type QueuedOfflineSale = {
  userId: number;
  sale: CreateSalePayload;
  queuedAt?: string;
  total?: string;
};

/** Venta offline que el servidor rechazó (4xx). No bloquea la cola; espera revisión del usuario. */
export type RejectedOfflineSale = QueuedOfflineSale & {
  error: string;
  rejectedAt: string;
};

/** Id estable de una venta encolada: su client_uuid (fase 1.4). */
export function queuedSaleId(item: QueuedOfflineSale): string {
  return item.sale?.client_uuid ?? "";
}

type PosState = {
  sessionId: number | null;
  sessionName: string | null;
  cart: CartItem[];
  offlineSalesQueue: QueuedOfflineSale[];
  rejectedSales: RejectedOfflineSale[];
  setSession: (id: number, name: string) => void;
  clearSession: () => void;
  addToCart: (item: Omit<CartItem, "quantity" | "discount_percent"> & { quantity?: number; discount_percent?: string }) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateDiscount: (productId: number, discount: string) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  addOfflineSale: (sale: CreateSalePayload, userId?: number, total?: string) => void;
  removeOfflineSaleByUuid: (clientUuid: string) => void;
  rejectOfflineSale: (clientUuid: string, error: string) => void;
  discardRejectedSale: (clientUuid: string) => void;
};

/**
 * Redondeo bancario (HALF_EVEN) para centavos.
 * Si la parte fraccionaria es exactamente 0.5, redondea al entero par más cercano.
 */
export function roundHalfEvenCents(cents: number): number {
  const floor = Math.floor(cents);
  const diff = cents - floor;
  const EPSILON = 1e-9;
  if (Math.abs(diff - 0.5) < EPSILON) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(cents);
}

export function calcLineTotal(item: CartItem): number {
  const qty = item.quantity;
  const priceCents = Math.round(Number(item.unit_price) * 100);
  const discPct = Number(item.discount_percent || 0);
  const taxRate = Number(item.tax_rate || 0);

  const grossCents = qty * priceCents;
  const discCents = roundHalfEvenCents(grossCents * (discPct / 100));
  const subtotalCents = grossCents - discCents;
  const taxCents = roundHalfEvenCents(subtotalCents * (taxRate / 100));
  const totalCents = subtotalCents + taxCents;

  return totalCents / 100;
}

export function getCartTotals(cart: CartItem[]) {
  let subtotalCents = 0;
  let discountTotalCents = 0;
  let taxTotalCents = 0;

  for (const item of cart) {
    const qty = item.quantity;
    const priceCents = Math.round(Number(item.unit_price) * 100);
    const discPct = Number(item.discount_percent || 0);
    const taxRate = Number(item.tax_rate || 0);

    const grossCents = qty * priceCents;
    const lineDiscountCents = roundHalfEvenCents(grossCents * (discPct / 100));
    const lineSubtotalCents = grossCents - lineDiscountCents;
    const lineTaxCents = roundHalfEvenCents(lineSubtotalCents * (taxRate / 100));

    subtotalCents += lineSubtotalCents;
    discountTotalCents += lineDiscountCents;
    taxTotalCents += lineTaxCents;
  }

  const totalCents = subtotalCents + taxTotalCents;

  return {
    subtotal: subtotalCents / 100,
    discountTotal: discountTotalCents / 100,
    taxTotal: taxTotalCents / 100,
    total: totalCents / 100,
  };
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      sessionName: null,
      cart: [],
      offlineSalesQueue: [],
      rejectedSales: [],

      setSession: (id, name) => set({ sessionId: id, sessionName: name }),

      clearSession: () => set({ sessionId: null, sessionName: null, cart: [] }),

      addToCart: (item) => {
        const cart = get().cart;
        const existing = cart.find((c) => c.product_id === item.product_id);

        if (existing) {
          set({
            cart: cart.map((c) =>
              c.product_id === item.product_id ? { ...c, quantity: c.quantity + (item.quantity ?? 1) } : c,
            ),
          });
        } else {
          set({
            cart: [
              ...cart,
              {
                product_id: item.product_id,
                product_name: item.product_name,
                product_sku: item.product_sku,
                unit_price: item.unit_price,
                tax_rate: item.tax_rate,
                unit_abbreviation: item.unit_abbreviation,
                quantity: item.quantity ?? 1,
                discount_percent: item.discount_percent ?? "0.00",
              },
            ],
          });
        }
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(productId);
          return;
        }
        set({
          cart: get().cart.map((c) => (c.product_id === productId ? { ...c, quantity } : c)),
        });
      },

      updateDiscount: (productId, discount) => {
        set({
          cart: get().cart.map((c) => (c.product_id === productId ? { ...c, discount_percent: discount } : c)),
        });
      },

      removeFromCart: (productId) => {
        set({ cart: get().cart.filter((c) => c.product_id !== productId) });
      },

      clearCart: () => set({ cart: [] }),

      addOfflineSale: (sale, userId = 0, total) =>
        set((state) => {
          const queued: QueuedOfflineSale = {
            userId,
            sale: { ...sale, client_uuid: sale.client_uuid ?? crypto.randomUUID(), open_drawer: false },
            queuedAt: new Date().toISOString(),
            total,
          };
          // Un mismo client_uuid nunca se encola dos veces
          if (state.offlineSalesQueue.some((q) => queuedSaleId(q) === queuedSaleId(queued))) {
            return state;
          }
          return { offlineSalesQueue: [...state.offlineSalesQueue, queued] };
        }),

      removeOfflineSaleByUuid: (clientUuid: string) =>
        set((state) => ({
          offlineSalesQueue: state.offlineSalesQueue.filter((q) => queuedSaleId(q) !== clientUuid),
        })),

      rejectOfflineSale: (clientUuid, error) =>
        set((state) => {
          const item = state.offlineSalesQueue.find((q) => queuedSaleId(q) === clientUuid);
          if (!item) return state;
          return {
            offlineSalesQueue: state.offlineSalesQueue.filter((q) => queuedSaleId(q) !== clientUuid),
            rejectedSales: [...state.rejectedSales, { ...item, error, rejectedAt: new Date().toISOString() }],
          };
        }),

      discardRejectedSale: (clientUuid) =>
        set((state) => ({
          rejectedSales: state.rejectedSales.filter((r) => queuedSaleId(r) !== clientUuid),
        })),
    }),
    {
      name: "pos-storage",
      version: 1,
      // v0 -> v1: ventas encoladas sin client_uuid reciben uno para poder sincronizarse y eliminarse por id
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PosState>;
        if (version < 1) {
          state.offlineSalesQueue = (state.offlineSalesQueue ?? []).map((q) => ({
            ...q,
            sale: { ...q.sale, client_uuid: q.sale?.client_uuid ?? crypto.randomUUID(), open_drawer: false },
          }));
          state.rejectedSales = state.rejectedSales ?? [];
        }
        return state as PosState;
      },
    },
  ),
);
