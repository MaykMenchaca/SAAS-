import type { PosCatalogItem, Product } from "../api/products";

/**
 * Copia local del catálogo para que el POS siga agregando productos con el servidor caído
 * (OPS-02). Precios e IVA de esta copia son provisionales: al sincronizar, el servidor recalcula.
 */
const STORAGE_KEY = "pos-catalog-v1";

type StoredCatalog = { generatedAt: string; items: PosCatalogItem[] };

export function saveCatalog(generatedAt: string, items: PosCatalogItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ generatedAt, items } satisfies StoredCatalog));
  } catch {
    // Sin espacio o almacenamiento bloqueado: se sigue con la copia anterior
  }
}

export function loadCatalog(): StoredCatalog | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredCatalog) : null;
  } catch {
    return null;
  }
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
  const items = loadCatalog()?.items ?? [];
  const match =
    items.find((item) => item.barcode && normalize(item.barcode) === target) ??
    items.find((item) => normalize(item.sku) === target);
  return match ? catalogItemToProduct(match) : null;
}

export function searchOffline(query: string, categoryId?: number, limit = 50): Product[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const items = loadCatalog()?.items ?? [];
  return items
    .filter((item) => (categoryId ? item.category_id === categoryId : true))
    .filter((item) => {
      const haystack = normalize(`${item.name} ${item.sku} ${item.barcode ?? ""}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit)
    .map(catalogItemToProduct);
}
