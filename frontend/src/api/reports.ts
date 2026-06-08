import { apiClient } from "./client";

// ── Types ──────────────────────────────────────────────────────────

export type SalesReport = {
  period: { from: string; to: string };
  total_sales: number;
  total_revenue: string;
  cancelled_sales: number;
  daily: { date: string; count: number; revenue: string }[];
  payment_methods: { method: string; count: number; net_amount: string }[];
};

export type InventoryValuation = {
  total_valuation: string;
  total_units: string;
  product_count: number;
  items: {
    product_id: number;
    sku: string;
    name: string;
    quantity: string;
    avg_cost: string;
    valuation: string;
  }[];
};

export type TopProduct = {
  product_id: number;
  product_name: string;
  product_sku: string;
  total_quantity: string;
  total_revenue: string;
  sale_count: number;
};

export type TopProductsReport = {
  period: { from: string; to: string };
  sort_by: string;
  items: TopProduct[];
};

export type GrossMarginItem = {
  product_id: number;
  product_name: string;
  product_sku: string;
  total_quantity: string;
  total_revenue: string;
  total_cost: string;
  gross_margin: string;
  margin_percent: string;
};

export type GrossMarginReport = {
  period: { from: string; to: string };
  summary: {
    total_revenue: string;
    total_cost: string;
    gross_margin: string;
    margin_percent: string;
  };
  items: GrossMarginItem[];
};

// ── API calls ─────────────────────────────────────────────────────

export async function fetchSalesReport(from?: string, to?: string) {
  const response = await apiClient.get<SalesReport>("/reports/sales", {
    params: { from: from || undefined, to: to || undefined },
  });
  return response.data;
}

export async function fetchInventoryValuation() {
  const response = await apiClient.get<InventoryValuation>("/reports/inventory-valuation");
  return response.data;
}

export async function fetchTopProducts(params?: { from?: string; to?: string; sort?: string; limit?: number }) {
  const response = await apiClient.get<TopProductsReport>("/reports/top-products", {
    params: {
      from: params?.from || undefined,
      to: params?.to || undefined,
      sort: params?.sort || undefined,
      limit: params?.limit || undefined,
    },
  });
  return response.data;
}

export async function fetchGrossMargin(from?: string, to?: string) {
  const response = await apiClient.get<GrossMarginReport>("/reports/gross-margin", {
    params: { from: from || undefined, to: to || undefined },
  });
  return response.data;
}
