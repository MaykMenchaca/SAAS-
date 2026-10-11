import { apiClient } from "./client";
import type { PaginatedResponse } from "./products";

// ── Types ──────────────────────────────────────────────────────────

export type Supplier = {
  id: number;
  name: string;
  rfc: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type SupplierCreatePayload = {
  name: string;
  rfc?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
};

export type SupplierUpdatePayload = Partial<SupplierCreatePayload>;

export type PurchaseOrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: string;
  received_quantity: string;
  unit_cost: string;
  tax_rate: string;
  subtotal: string;
};

export type PurchaseOrder = {
  id: number;
  folio: string;
  supplier_id: number;
  supplier_name: string;
  user_id: number;
  username: string;
  status: "borrador" | "enviada" | "parcial" | "recibida" | "cancelada";
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string | null;
  expected_date: string | null;
  created_at: string;
  items: PurchaseOrderItem[];
};

export type PurchaseOrderListItem = {
  id: number;
  folio: string;
  supplier_name: string;
  status: string;
  total: string;
  created_at: string;
  expected_date: string | null;
};

export type OrderItemInput = {
  product_id: number;
  quantity: string;
  unit_cost: string;
  tax_rate?: string;
};

export type CreateOrderPayload = {
  supplier_id?: number | null;
  items: OrderItemInput[];
  notes?: string;
  expected_date?: string;
};

export type ReceiveItemInput = {
  order_item_id: number;
  received_quantity: string;
};

// ── Supplier API ──────────────────────────────────────────────────

/** Proveedores activos paginados (H-45). Por defecto hasta 100, suficiente para los selectores. */
export async function listSuppliers(params: { page?: number; perPage?: number } = {}) {
  const response = await apiClient.get<PaginatedResponse<Supplier>>("/purchases/suppliers", {
    params: { page: params.page ?? 1, per_page: params.perPage ?? 100 },
  });
  return response.data;
}

export async function createSupplier(payload: SupplierCreatePayload) {
  const response = await apiClient.post<Supplier>("/purchases/suppliers", payload);
  return response.data;
}

export async function updateSupplier(supplierId: number, payload: SupplierUpdatePayload) {
  const response = await apiClient.patch<Supplier>(`/purchases/suppliers/${supplierId}`, payload);
  return response.data;
}

export async function deactivateSupplier(supplierId: number) {
  const response = await apiClient.delete<Supplier>(`/purchases/suppliers/${supplierId}`);
  return response.data;
}

// ── Purchase Order API ────────────────────────────────────────────

export async function listOrders(params?: { page?: number; perPage?: number; status?: string }) {
  const response = await apiClient.get<PaginatedResponse<PurchaseOrderListItem>>("/purchases/orders", {
    params: {
      page: params?.page ?? 1,
      per_page: params?.perPage ?? 20,
      status: params?.status || undefined,
    },
  });
  return response.data;
}

export async function getOrder(orderId: number) {
  const response = await apiClient.get<PurchaseOrder>(`/purchases/orders/${orderId}`);
  return response.data;
}

export async function createOrder(payload: CreateOrderPayload) {
  const response = await apiClient.post<PurchaseOrder>("/purchases/orders", payload);
  return response.data;
}

export async function sendOrder(orderId: number) {
  const response = await apiClient.post<PurchaseOrder>(`/purchases/orders/${orderId}/send`);
  return response.data;
}

export async function cancelOrder(orderId: number) {
  const response = await apiClient.post<PurchaseOrder>(`/purchases/orders/${orderId}/cancel`);
  return response.data;
}

export async function receiveOrder(orderId: number, items: ReceiveItemInput[]) {
  const response = await apiClient.post<PurchaseOrder>(`/purchases/orders/${orderId}/receive`, { items });
  return response.data;
}
