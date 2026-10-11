import type { PosCatalogItem, Product } from "../api/products";

/**
 * Copia local del catálogo para que el POS siga agregando productos con el servidor caído
 * (OPS-02). Se guarda en IndexedDB, no en localStorage, para no competir por la cuota con la
 * cola de ventas offline (OPS-15), y se mantiene parseada en memoria para buscar sin bloquear.
 * Precios e IVA de esta copia son provisionales: al sincronizar, el servidor recalcula.
 */
const DB_NAME = "pos-offline";
const STORE = "catalog";
const KEY = "current";
const LEGACY_STORAGE_KEY = "pos-catalog-v1";
/** A partir de esta antigüedad se avisa que los precios pueden estar desactualizados (OPS-16). */
export const CATALOG_STALE_HOURS = 24;

type StoredCatalog = { generatedAt: string; items: PosCatalogItem[] };

let memory: StoredCatalog | null = null;
let loading: Promise<StoredCatalog | null> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(): Promise<StoredCatalog | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as StoredCatalog | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(value: StoredCatalog): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Carga la copia guardada en memoria (una vez). También limpia la copia vieja de localStorage. */
export function loadCatalog(): Promise<StoredCatalog | null> {
  if (memory) return Promise.resolve(memory);
  if (!loading) {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // sin acceso a localStorage: no hay nada que limpiar
    }
    loading = idbGet()
      .then((stored) => {
        memory = memory ?? stored;
        return memory;
      })
      .catch(() => memory)
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export async function saveCatalog(generatedAt: string, items: PosCatalogItem[]) {
  memory = { generatedAt, items };
  try {
    await idbPut(memory);
  } catch {
    // Sin IndexedDB o sin espacio: la copia queda solo en memoria hasta recargar
  }
}

/** Fecha de la copia local y si ya es vieja (OPS-16). */
export function catalogInfo(): { generatedAt: Date; stale: boolean } | null {
  if (!memory) return null;
  const generatedAt = new Date(memory.generatedAt);
  const ageHours = (Date.now() - generatedAt.getTime()) / 3_600_000;
  return { generatedAt, stale: ageHours > CATALOG_STALE_HOURS };
}

/** Minúsculas y sin acentos, para buscar "tornillo" igual que "Tornillo" o "pintura" igual que "pintúra". */
function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Adapta un artículo del catálogo local a la forma de Product que usa el POS. Sin dato de stock. */
export function catalogItemToProduct(item: PosCatalogItem): Product {
  return {
    id: item.id,
    sku: item.sku,
    barcode: item.barcode,
    name: item.name,
    description: null,
    category_id: item.category_id,
    unit_id: 0,
    purchase_price: "0.00",
    avg_cost: "0.00",
    sale_price: item.sale_price,
    tax_rate: item.tax_rate,
    min_stock: "0.000",
    max_stock: "0.000",
    is_active: true,
    category: null,
    unit: { id: 0, name: "", abbreviation: item.unit.abbreviation, allows_fractions: item.unit.allows_fractions },
  };
}

export function findByCodeOffline(code: string): Product | null {
  const target = normalize(code);
  const items = memory?.items ?? [];
  const match =
    items.find((item) => item.barcode && normalize(item.barcode) === target) ??
    items.find((item) => normalize(item.sku) === target);
  return match ? catalogItemToProduct(match) : null;
}

export function searchOffline(query: string, categoryId?: number, limit = 50): Product[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const items = memory?.items ?? [];
  return items
    .filter((item) => (categoryId ? item.category_id === categoryId : true))
    .filter((item) => {
      const haystack = normalize(`${item.name} ${item.sku} ${item.barcode ?? ""}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit)
    .map(catalogItemToProduct);
}
