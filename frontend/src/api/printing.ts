import { apiClient } from "./client";

export type PrintPreviewResponse = {
  sale_id?: number;
  product_id?: number;
  folio?: string;
  sku?: string;
  sent: boolean;
  /** true si lo imprimirá el agente de la caja (impresora USB local). */
  queued?: boolean;
  /** Con queued: si el agente de esa caja está conectado. */
  agent_online?: boolean | null;
  content: string;
};

/** Mensaje para el cajero según cómo se envió el ticket (OPS-17). */
export function printResultMessage(result: PrintPreviewResponse): { tone: "success" | "warning"; text: string } {
  if (result.queued && result.agent_online === false) {
    return {
      tone: "warning",
      text: "Ticket enviado a la cola de la caja, pero su agente de impresión no está conectado. Se imprimirá si se conecta en los próximos 10 minutos.",
    };
  }
  if (result.queued) return { tone: "success", text: "Ticket enviado a la impresora de la caja." };
  return { tone: "success", text: "Ticket enviado a la impresora." };
}

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
