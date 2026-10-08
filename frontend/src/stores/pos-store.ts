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

type PosState = {
  sessionId: number | null;
  sessionName: string | null;
  cart: CartItem[];
  offlineSalesQueue: CreateSalePayload[];
  setSession: (id: number, name: string) => void;
  clearSession: () => void;
  addToCart: (item: Omit<CartItem, "quantity" | "discount_percent"> & { quantity?: number; discount_percent?: string }) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateDiscount: (productId: number, discount: string) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  addOfflineSale: (sale: CreateSalePayload) => void;
  removeOfflineSale: (index: number) => void;
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

      addOfflineSale: (sale) =>
        set((state) => ({
          offlineSalesQueue: [...state.offlineSalesQueue, sale],
        })),

      removeOfflineSale: (index) =>
        set((state) => ({
          offlineSalesQueue: state.offlineSalesQueue.filter((_, i) => i !== index),
        })),
    }),
    {
      name: "pos-storage",
    },
  ),
);
