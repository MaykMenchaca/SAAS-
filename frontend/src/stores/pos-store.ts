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

function calcLineTotal(item: CartItem): number {
  const qty = item.quantity;
  const price = Number(item.unit_price);
  const disc = Number(item.discount_percent) / 100;
  const tax = Number(item.tax_rate) / 100;
  const gross = qty * price;
  const afterDisc = gross - gross * disc;
  return afterDisc + afterDisc * tax;
}

export function getCartTotals(cart: CartItem[]) {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const item of cart) {
    const qty = item.quantity;
    const price = Number(item.unit_price);
    const disc = Number(item.discount_percent) / 100;
    const tax = Number(item.tax_rate) / 100;
    const gross = qty * price;
    const lineDiscount = gross * disc;
    const afterDisc = gross - lineDiscount;
    const lineTax = afterDisc * tax;

    subtotal += afterDisc;
    discountTotal += lineDiscount;
    taxTotal += lineTax;
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total: Math.round((subtotal + taxTotal) * 100) / 100,
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

export { calcLineTotal };
