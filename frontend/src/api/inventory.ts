import { apiClient } from "./client";
import type { PaginatedResponse } from "./products";

export type StockItem = {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: string;
  last_updated: string;
  unit_abbreviation: string;
  min_stock: string;
  max_stock: string;
};

export type StockMovement = {
  id: number;
  product_id: number;
  movement_type: string;
  quantity: string;
  previous_stock: string;
  new_stock: string;
  reference_type: string;
  reference_id: number | null;
  notes: string | null;
  user_id: number;
  username: string;
  created_at: string;
};

export type StockAdjustPayload = {
  product_id: number;
  quantity: string;
  notes?: string;
};

type ListStockParams = {
  page?: number;
  perPage?: number;
  search?: string;
};

export async function listStock({ page = 1, perPage = 20, search = "" }: ListStockParams) {
  const response = await apiClient.get<PaginatedResponse<StockItem>>("/inventory/stock", {
    params: {
      page,
      per_page: perPage,
      search: search || undefined,
    },
  });
  return response.data;
}

export async function getProductStock(productId: number) {
  const response = await apiClient.get<StockItem>(`/inventory/stock/${productId}`);
  return response.data;
}

export async function getLowStock() {
  const response = await apiClient.get<StockItem[]>("/inventory/low-stock");
  return response.data;
}

export async function adjustStock(payload: StockAdjustPayload) {
  const response = await apiClient.post<{ product_id: number; new_stock: string; movement_type: string }>(
    "/inventory/adjust",
    payload,
  );
  return response.data;
}

export async function listMovements(productId: number, limit = 50) {
  const response = await apiClient.get<StockMovement[]>(`/inventory/movements/${productId}`, {
    params: { limit },
  });
  return response.data;
}
