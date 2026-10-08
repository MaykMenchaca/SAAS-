import { apiClient } from "./client";
import type { PaginatedResponse } from "./products";

// ── Types ──────────────────────────────────────────────────────────

export type CashRegisterSession = {
  id: number;
  cash_register_id: number;
  cash_register_name: string;
  user_id: number;
  username: string;
  opening_amount: string;
  closing_amount: string | null;
  expected_cash: string | null;
  difference: string | null;
  status: "abierta" | "cerrada";
  opened_at: string;
  closed_at: string | null;
  close_notes: string | null;
};

export type SaleItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  discount_amount: string;
  tax_rate: string;
  subtotal: string;
  cost_at_sale: string;
  allows_fractions?: boolean;
  returned_quantity?: string;
  available_quantity?: string;
};

export type Payment = {
  id: number;
  method: string;
  amount: string;
  reference: string | null;
  change_amount: string;
};

export type Sale = {
  id: number;
  folio: string;
  client_uuid?: string | null;
  session_id: number;
  user_id: number;
  username: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  status: "completada" | "cancelada";
  cancel_reason: string | null;
  created_at: string;
  items: SaleItem[];
  payments: Payment[];
};

export type SaleListItem = {
  id: number;
  folio: string;
  client_uuid?: string | null;
  total: string;
  status: string;
  created_at: string;
  username: string;
};

export type SaleItemInput = {
  product_id: number;
  quantity: number;
  unit_price: string;
  tax_rate: string;
  discount_percent?: string;
};

export type PaymentInput = {
  method: "efectivo" | "tarjeta" | "transferencia";
  amount: string;
  reference?: string;
  change_amount?: string;
};

export type CreateSalePayload = {
  session_id: number;
  client_uuid?: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
};

export type CashRegisterInfo = {
  id: number;
  name: string;
  is_active: boolean;
};

// ── Cash Register API ──────────────────────────────────────────────

export async function listCashRegisters() {
  const response = await apiClient.get<CashRegisterInfo[]>("/cash-register/");
  return response.data;
}

export async function openCashRegister(cashRegisterId: number, openingAmount: string) {
  const response = await apiClient.post<CashRegisterSession>("/cash-register/open", {
    cash_register_id: cashRegisterId,
    opening_amount: openingAmount,
  });
  return response.data;
}

export async function closeCashRegister(sessionId: number, closingAmount: string, closeNotes?: string) {
  const response = await apiClient.post<CashRegisterSession>(`/cash-register/${sessionId}/close`, {
    closing_amount: closingAmount,
    close_notes: closeNotes || null,
  });
  return response.data;
}

export async function listSessions() {
  const response = await apiClient.get<CashRegisterSession[]>("/cash-register/sessions");
  return response.data;
}

export type SessionSummary = {
  session_id: number;
  opening_amount: string;
  closing_amount: string | null;
  expected_cash: string | null;
  difference: string | null;
  status: string;
  sales_completed: number;
  sales_cancelled: number;
  grand_total: string;
  payment_methods: Record<string, string>;
};

export async function getSessionSummary(sessionId: number) {
  const response = await apiClient.get<SessionSummary>(`/cash-register/${sessionId}/summary`);
  return response.data;
}

// ── Sales API ──────────────────────────────────────────────────────

export type SaleQuoteLine = {
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  discount_amount: string;
  tax_rate: string;
  tax_amount: string;
  subtotal: string;
  total: string;
};

export type SaleQuoteResponse = {
  lines: SaleQuoteLine[];
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
};

export type SaleQuotePayload = {
  items: Array<{
    product_id: number;
    quantity: number;
    discount_percent?: string;
  }>;
  session_id?: number;
};

export async function quoteSale(payload: SaleQuotePayload) {
  const response = await apiClient.post<SaleQuoteResponse>("/sales/quote", payload);
  return response.data;
}

export async function createSale(payload: CreateSalePayload) {
  const response = await apiClient.post<Sale>("/sales/", payload);
  return response.data;
}

export async function cancelSale(saleId: number, reason: string) {
  const response = await apiClient.post<Sale>(`/sales/${saleId}/cancel`, { reason });
  return response.data;
}

export async function listSales(page = 1, perPage = 20) {
  const response = await apiClient.get<PaginatedResponse<SaleListItem>>("/sales/", {
    params: { page, per_page: perPage },
  });
  return response.data;
}

export async function getSale(saleId: number) {
  const response = await apiClient.get<Sale>(`/sales/${saleId}`);
  return response.data;
}

// ── Returns API ───────────────────────────────────────────────────

export type ReturnItemInput = {
  sale_item_id: number;
  quantity: string;
};

export type SaleReturnItem = {
  id: number;
  sale_item_id: number;
  product_id: number;
  quantity: string;
  refund_amount: string;
};

export type SaleReturn = {
  id: number;
  sale_id: number;
  status: string;
  reason: string;
  refund_total: string;
  created_at: string;
  returned_items: SaleReturnItem[];
};

export async function returnSale(saleId: number, reason: string, items: ReturnItemInput[]) {
  const response = await apiClient.post<SaleReturn>(`/sales/${saleId}/return`, { reason, items });
  return response.data;
}
