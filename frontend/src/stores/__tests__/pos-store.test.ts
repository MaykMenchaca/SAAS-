import { describe, expect, it } from "vitest";
import { getCartTotals, type CartItem } from "../pos-store";

describe("getCartTotals", () => {
  it("returns zero totals for empty cart", () => {
    const totals = getCartTotals([]);
    expect(totals).toEqual({
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      total: 0,
    });
  });

  it("calculates correct totals for single item without discount or tax", () => {
    const cart: CartItem[] = [
      {
        product_id: 1,
        product_name: "Martillo",
        product_sku: "M-01",
        quantity: 2,
        unit_price: "100.00",
        tax_rate: "0.00",
        discount_percent: "0.00",
        unit_abbreviation: "pz",
      },
    ];
    const totals = getCartTotals(cart);
    expect(totals).toEqual({
      subtotal: 200,
      discountTotal: 0,
      taxTotal: 0,
      total: 200,
    });
  });

  it("calculates correct totals with 16% VAT using HALF_EVEN rounding", () => {
    const cart: CartItem[] = [
      {
        product_id: 1,
        product_name: "Pintura",
        product_sku: "P-01",
        quantity: 1,
        unit_price: "150.00",
        tax_rate: "16.00",
        discount_percent: "0.00",
        unit_abbreviation: "bote",
      },
    ];
    const totals = getCartTotals(cart);
    expect(totals.subtotal).toBe(150);
    expect(totals.discountTotal).toBe(0);
    expect(totals.taxTotal).toBe(24);
    expect(totals.total).toBe(174);
  });

  it("calculates discounts and tax on discounted subtotal", () => {
    const cart: CartItem[] = [
      {
        product_id: 1,
        product_name: "Taladro",
        product_sku: "T-01",
        quantity: 1,
        unit_price: "1000.00",
        tax_rate: "16.00",
        discount_percent: "10.00",
        unit_abbreviation: "pz",
      },
    ];
    const totals = getCartTotals(cart);
    expect(totals.discountTotal).toBe(100);
    expect(totals.subtotal).toBe(900);
    expect(totals.taxTotal).toBe(144);
    expect(totals.total).toBe(1044);
  });

  it("accumulates multiple items with mixed tax and discounts accurately", () => {
    const cart: CartItem[] = [
      {
        product_id: 1,
        product_name: "Item 1",
        product_sku: "IT-01",
        quantity: 3,
        unit_price: "50.00",
        tax_rate: "16.00",
        discount_percent: "0.00",
        unit_abbreviation: "pz",
      },
      {
        product_id: 2,
        product_name: "Item 2",
        product_sku: "IT-02",
        quantity: 1,
        unit_price: "200.00",
        tax_rate: "0.00",
        discount_percent: "5.00",
        unit_abbreviation: "pz",
      },
    ];
    const totals = getCartTotals(cart);
    expect(totals.discountTotal).toBe(10);
    expect(totals.subtotal).toBe(340);
    expect(totals.taxTotal).toBe(24);
    expect(totals.total).toBe(364);
  });
});
