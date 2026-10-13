import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useEffect, useState } from "react";

import { listCategories, listProducts } from "../../api/products";
import type { Product } from "../../api/products";
import { qk } from "../../api/query-keys";
import { catalogInfo, loadCatalog, searchOffline } from "../../lib/offline-catalog";
import { useConnectionStore } from "../../stores/connection-store";

/**
 * Catálogo del POS: categorías y productos del servidor con búsqueda (con retardo de 250 ms) y, sin servidor,
 * la copia local guardada en el equipo (OPS-02, OPS-23). La lógica es la de `ProductSearch` original.
 */
export function useCatalog(search: string, categoryId: number | undefined) {
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesQuery = useQuery({
    queryKey: qk.posCategories(),
    queryFn: listCategories,
  });

  const serverReachable = useConnectionStore((s) => s.serverReachable);
  // Redibuja cuando la copia local termina de cargarse desde IndexedDB
  const [, setCatalogLoaded] = useState(0);
  useEffect(() => {
    void loadCatalog().then(() => setCatalogLoaded((n) => n + 1));
  }, []);

  const productsQuery = useQuery({
    queryKey: qk.posProducts(debouncedSearch, categoryId),
    queryFn: () =>
      listProducts({
        page: 1,
        perPage: 50,
        search: debouncedSearch,
        category_id: categoryId,
      }),
    // Sin reintento ni consulta si ya se sabe que no hay servidor (OPS-23)
    retry: 0,
    enabled: serverReachable,
  });

  // Sin servidor (ping fallido o error de red, no un 4xx/5xx), se busca en la copia local (OPS-02)
  const serverDown =
    !serverReachable ||
    (productsQuery.isError && productsQuery.error instanceof AxiosError && !productsQuery.error.response);

  const products: Product[] = serverDown
    ? searchOffline(debouncedSearch, categoryId)
    : (productsQuery.data?.items ?? []);

  return {
    categories: categoriesQuery.data ?? [],
    catalog: catalogInfo(),
    isLoading: productsQuery.isLoading && !serverDown,
    products,
    serverDown,
  };
}
