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

/** Catálogo cerrado de motivos de ajuste (mismos códigos que valida el backend). */
export const ADJUST_REASONS = [
  { value: "merma_dano", label: "Merma o daño" },
  { value: "error_captura", label: "Error de captura" },
  { value: "devolucion_proveedor", label: "Devolución a proveedor" },
  { value: "uso_interno", label: "Uso interno" },
  { value: "otro", label: "Otro" },
] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number]["value"];

export type StockAdjustPayload = {
  product_id: number;
  quantity: string;
  reason?: AdjustReason;
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

/** Conteos exactos de los indicadores de inventario (RF-23). */
export type InventorySummary = {
  total_products: number;
  out_of_stock: number;
  below_min: number;
};

export async function getInventorySummary() {
  const response = await apiClient.get<InventorySummary>("/inventory/summary");
  return response.data;
}

/** Stock bajo paginado (H-45). Por defecto la primera página de 100, los más escasos primero. */
export async function getLowStock(params: { page?: number; perPage?: number } = {}) {
  const response = await apiClient.get<PaginatedResponse<StockItem>>("/inventory/low-stock", {
    params: { page: params.page ?? 1, per_page: params.perPage ?? 100 },
  });
  return response.data;
}

export type StockAdjustResult = {
  product_id: number;
  previous_stock: string;
  new_stock: string;
  movement_type: string;
  reason: AdjustReason | null;
  /** Conteo abierto cuya captura de este producto quedó anulada por el ajuste (RF-32); null si no había. */
  count_capture_reset: number | null;
};

export async function adjustStock(payload: StockAdjustPayload) {
  const response = await apiClient.post<StockAdjustResult>("/inventory/adjust", payload);
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

// ── Inventario completo con Excel ───────────────────────────────────

export type ImportRowState = "nuevo" | "cambio" | "igual" | "error";

export type ImportPreviewRow = {
  fila: number;
  sku: string;
  nombre: string | null;
  estado: ImportRowState;
  cambios: { campo: string; antes: string; despues: string }[];
  errores: string[];
};

export type ImportPreview = {
  resumen: { filas: number; nuevos: number; cambios: number; sin_cambios: number; errores: number };
  filas: ImportPreviewRow[];
  categorias_nuevas: string[];
  plan_hash: string;
};

/** Descarga el inventario activo en Excel (también sirve de plantilla para importar). */
export async function exportInventoryExcel() {
  const response = await apiClient.get<Blob>("/inventory/export", { responseType: "blob", timeout: 120_000 });
  const disposition = String(response.headers["content-disposition"] ?? "");
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "inventario.xlsx";
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// El cliente manda JSON por defecto, y con ese Content-Type axios convierte un FormData en JSON: el archivo nunca
// llegaba al servidor. Con multipart/form-data el navegador agrega el boundary correcto
const MULTIPART = { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 };

function excelForm(file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("archivo", file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return form;
}

/** Revisa el Excel sin aplicar nada: nuevos, cambios (antes → después), sin cambios y errores. */
export async function previewInventoryImport(file: File) {
  const response = await apiClient.post<ImportPreview>("/inventory/import/preview", excelForm(file), MULTIPART);
  return response.data;
}

/** Aplica la importación revisada (todo o nada). Si el inventario cambió desde la vista previa responde 409. */
export async function applyInventoryImport(file: File, planHash: string) {
  const response = await apiClient.post<{ resumen: ImportPreview["resumen"]; categorias_nuevas: string[] }>(
    "/inventory/import/apply",
    excelForm(file, { plan_hash: planHash }),
    MULTIPART,
  );
  return response.data;
}
