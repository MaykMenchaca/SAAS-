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

/** Stock bajo paginado (H-45). Por defecto la primera página de 100, los más escasos primero. */
export async function getLowStock(params: { page?: number; perPage?: number } = {}) {
  const response = await apiClient.get<PaginatedResponse<StockItem>>("/inventory/low-stock", {
    params: { page: params.page ?? 1, per_page: params.perPage ?? 100 },
  });
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

// ── Inventory Counts ──────────────────────────────────────────────

export type InventoryCountItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  expected_quantity: string;
  counted_quantity: string | null;
  difference: string | null;
  notes: string | null;
};

export type InventoryCount = {
  id: number;
  user_id: number;
  username: string;
  status: string;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  closed_by: number | null;
  closed_by_username: string | null;
  items: InventoryCountItem[];
  total_items: number;
  counted_items: number;
};

export type InventoryCountListItem = {
  id: number;
  username: string;
  status: string;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  total_items: number;
  counted_items: number;
};

export async function createInventoryCount(notes?: string) {
  const response = await apiClient.post<InventoryCount>("/inventory/counts", {
    notes: notes || undefined,
  });
  return response.data;
}

export async function listInventoryCounts(page = 1, perPage = 20) {
  const response = await apiClient.get<PaginatedResponse<InventoryCountListItem>>("/inventory/counts", {
    params: { page, per_page: perPage },
  });
  return response.data;
}

export async function getInventoryCount(countId: number) {
  const response = await apiClient.get<InventoryCount>(`/inventory/counts/${countId}`);
  return response.data;
}

export async function captureCountItem(countId: number, productId: number, countedQuantity: string, notes?: string) {
  const response = await apiClient.patch<InventoryCountItem>(
    `/inventory/counts/${countId}/items/${productId}`,
    {
      counted_quantity: countedQuantity,
      notes: notes || undefined,
    },
  );
  return response.data;
}

export async function closeInventoryCount(countId: number) {
  const response = await apiClient.post<InventoryCount>(`/inventory/counts/${countId}/close`);
  return response.data;
}

export async function cancelInventoryCount(countId: number) {
  const response = await apiClient.post<InventoryCount>(`/inventory/counts/${countId}/cancel`);
  return response.data;
}
