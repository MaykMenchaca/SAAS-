import { apiClient } from "./client";

export type PrintPreviewResponse = {
  sale_id?: number;
  product_id?: number;
  folio?: string;
  sku?: string;
  sent: boolean;
  content: string;
};

export async function previewSaleTicket(saleId: number) {
  const response = await apiClient.post<PrintPreviewResponse>(`/printing/sales/${saleId}/ticket`, {
    send: false,
  });
  return response.data;
}

export async function printSaleTicket(saleId: number) {
  const response = await apiClient.post<PrintPreviewResponse>(`/printing/sales/${saleId}/ticket`, {
    send: true,
  });
  return response.data;
}

export async function previewProductLabel(productId: number) {
  const response = await apiClient.post<PrintPreviewResponse>(`/printing/products/${productId}/label`, {
    send: false,
  });
  return response.data;
}

export async function printProductLabel(productId: number) {
  const response = await apiClient.post<PrintPreviewResponse>(`/printing/products/${productId}/label`, {
    send: true,
  });
  return response.data;
}
