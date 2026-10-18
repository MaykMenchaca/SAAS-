import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";

import { getLowStock } from "../api/inventory";
import type { Product, ProductPayload } from "../api/products";
import {
  createProduct,
  deactivateProduct,
  listCategories,
  listProducts,
  listUnits,
  reactivateProduct,
  updateProduct,
} from "../api/products";
import { qk } from "../api/query-keys";
import { useCan } from "../components/auth/require-permission";
import { Button, ErrorState, FilterChip, Input, Modal, PageHeader, Pagination, SkeletonTable, Toggle } from "../components/ui";
import { cn } from "../lib/cn";
import { CategoriesTab } from "./products/categories-tab";
import { LabelPreviewModal } from "./products/label-preview-modal";
import { ProductPanel } from "./products/product-panel";
import { ProductsTable } from "./products/products-table";
import { UnitsTab } from "./products/units-tab";

type TabId = "productos" | "categorias" | "unidades";
const TABS: { id: TabId; label: string }[] = [
  { id: "productos", label: "Productos" },
  { id: "categorias", label: "Categorías" },
  { id: "unidades", label: "Unidades" },
];

/** Qué muestra el panel lateral: nada, el alta de un producto o la ficha de uno existente. */
type PanelState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; productId: number };

export function ProductsPage() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saved, setSaved] = useState(false);
  const [labelProductId, setLabelProductId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [productToDeactivate, setProductToDeactivate] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("productos");
  const [showInactive, setShowInactive] = useState(false);

  const canEdit = can("productos:editar");
  const canCreate = can("productos:crear");
  const canDeactivate = can("productos:desactivar");

  const productsQuery = useQuery({
    queryKey: [...qk.products(page, search, showInactive), categoryFilter],
    queryFn: () =>
      listProducts({ page, search, includeInactive: showInactive, category_id: categoryFilter ?? undefined }),
  });

  const categoriesQuery = useQuery({ queryKey: qk.categories(), queryFn: listCategories });
  const unitsQuery = useQuery({ queryKey: qk.units(), queryFn: listUnits });

  const lowStockQuery = useQuery({
    queryKey: qk.lowStock(),
    queryFn: () => getLowStock(),
    enabled: can("inventario:ver"),
  });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      setSelectedProduct(product);
      setPanel({ mode: "edit", productId: product.id });
      setSaved(true);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductPayload }) => updateProduct(id, payload),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      setSelectedProduct(product);
      setSaved(true);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateProduct,
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      setSelectedProduct((current) => (current?.id === product.id ? product : current));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateProduct,
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      await queryClient.invalidateQueries({ queryKey: qk.stock() });
      setSelectedProduct((current) => (current?.id === product.id ? product : current));
      toast.success(`${product.name} reactivado.`);
    },
    onError: (error) => {
      const message =
        error instanceof AxiosError ? error.response?.data?.error ?? "No se pudo reactivar." : "No se pudo reactivar.";
      toast.error(message);
    },
  });

  const products = productsQuery.data?.items ?? [];
  const totalPages = productsQuery.data?.pages ?? 1;
  const lowStockByProductId = useMemo(
    () => new Map((lowStockQuery.data?.items ?? []).map((item) => [item.product_id, item])),
    [lowStockQuery.data],
  );
  const categories = categoriesQuery.data ?? [];
  const units = unitsQuery.data ?? [];

  // La ficha del panel se toma de la lista cuando sigue ahí (datos frescos tras guardar)
  const panelProduct =
    panel.mode === "edit"
      ? products.find((item) => item.id === panel.productId) ?? selectedProduct
      : null;

  function resetMutations() {
    createMutation.reset();
    updateMutation.reset();
    setSaved(false);
  }

  function openCreate() {
    resetMutations();
    setSelectedProduct(null);
    setPanel({ mode: "create" });
    scrollToPanel();
  }

  function openProduct(product: Product) {
    resetMutations();
    setSelectedProduct(product);
    setPanel({ mode: "edit", productId: product.id });
    scrollToPanel();
  }

  function closePanel() {
    resetMutations();
    setSelectedProduct(null);
    setPanel({ mode: "closed" });
  }

  function scrollToPanel() {
    // En móvil el panel queda debajo de la tabla: se lleva a la vista
    window.setTimeout(() => document.getElementById("product-panel")?.scrollIntoView?.({ block: "start" }), 0);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function pickCategory(id: number | null) {
    setCategoryFilter(id);
    setPage(1);
  }

  const total = productsQuery.data?.total;
  const subtitle =
    activeTab === "productos" && total != null
      ? `${total} ${total === 1 ? "producto" : "productos"} · ${categories.length} ${categories.length === 1 ? "categoría" : "categorías"} · ${units.length} ${units.length === 1 ? "unidad de medida" : "unidades de medida"}`
      : "Catálogo, categorías y unidades de medida";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Productos"
        subtitle={subtitle}
        actions={
          activeTab === "productos" && canCreate ? (
            <Button frame icon={<PackagePlus aria-hidden="true" size={18} />} onClick={openCreate}>
              Nuevo producto
            </Button>
          ) : undefined
        }
      />

      <div aria-label="Secciones del catálogo" className="-mt-2 flex gap-7 overflow-x-auto border-b border-divider" role="tablist">
        {TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={cn(
              "-mb-px min-h-11 shrink-0 border-b-2 font-heading text-lg font-semibold transition-colors duration-150",
              activeTab === tab.id ? "border-accent text-text" : "border-transparent text-ink-2 hover:text-text",
            )}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "productos" ? (
        <section className="grid gap-4">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSearch}>
            <div className="min-w-0 sm:w-80 sm:max-w-full">
              <Input
                icon={<Search aria-hidden="true" size={16} />}
                label="Buscar"
                name="search"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="SKU, código o nombre"
                value={searchInput}
              />
            </div>
            <Button className="w-full sm:w-auto" type="submit" variant="secondary">
              Buscar
            </Button>
            <Toggle
              checked={showInactive}
              label="Mostrar inactivos"
              onChange={(checked) => {
                setShowInactive(checked);
                setPage(1);
              }}
            />
          </form>

          <div aria-label="Filtrar por categoría" className="flex flex-wrap gap-2" role="group">
            <FilterChip active={categoryFilter === null} label="Todas" onClick={() => pickCategory(null)} />
            {categories
              .filter((category) => category.is_active)
              .map((category) => (
                <FilterChip
                  active={categoryFilter === category.id}
                  key={category.id}
                  label={category.name}
                  onClick={() => pickCategory(category.id)}
                />
              ))}
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
              {productsQuery.isLoading ? (
                <SkeletonTable cols={6} rows={8} />
              ) : productsQuery.isError ? (
                <ErrorState onRetry={() => void productsQuery.refetch()} />
              ) : (
                <ProductsTable
                  canCreate={canCreate}
                  canDeactivate={canDeactivate}
                  canEdit={canEdit}
                  lowStockByProductId={lowStockByProductId}
                  onCreate={openCreate}
                  onDeactivate={setProductToDeactivate}
                  onLabel={(product) => setLabelProductId(product.id)}
                  onReactivate={(product) => reactivateMutation.mutate(product.id)}
                  onSelect={openProduct}
                  products={products}
                  reactivating={reactivateMutation.isPending}
                  selectedId={panel.mode === "edit" ? panel.productId : null}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
                <span>
                  Página {productsQuery.data?.page ?? page} de {totalPages}
                </span>
                <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
              </div>
            </div>

            <div className="min-w-0 xl:sticky xl:top-5">
              {panel.mode === "closed" || (panel.mode === "edit" && !panelProduct) ? (
                <div className="border border-divider p-6 text-sm text-ink-2">
                  Elige un producto de la tabla para ver su ficha{canCreate ? " o crea uno nuevo" : ""}.
                </div>
              ) : (
                <ProductPanel
                  canDeactivate={canDeactivate}
                  canEdit={panel.mode === "create" ? canCreate : canEdit}
                  categories={categories}
                  error={createMutation.error ?? updateMutation.error}
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  key={panel.mode === "edit" ? `p-${panel.productId}` : "nuevo"}
                  onClose={closePanel}
                  onDeactivate={setProductToDeactivate}
                  onLabel={(product) => setLabelProductId(product.id)}
                  onReactivate={(product) => reactivateMutation.mutate(product.id)}
                  onSubmit={(payload) => {
                    setSaved(false);
                    if (panelProduct) {
                      updateMutation.mutate({ id: panelProduct.id, payload });
                    } else {
                      createMutation.mutate(payload);
                    }
                  }}
                  product={panelProduct}
                  saved={saved}
                  units={units}
                />
              )}
            </div>
          </div>
        </section>
      ) : activeTab === "categorias" ? (
        <CategoriesTab />
      ) : (
        <UnitsTab />
      )}

      {labelProductId !== null ? (
        <LabelPreviewModal onClose={() => setLabelProductId(null)} productId={labelProductId} />
      ) : null}

      {productToDeactivate ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setProductToDeactivate(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  deactivateMutation.mutate(productToDeactivate.id, {
                    onSuccess: () => setProductToDeactivate(null),
                  });
                }}
                variant="danger"
              >
                {deactivateMutation.isPending ? "Desactivando..." : "Desactivar"}
              </Button>
            </>
          }
          onClose={() => setProductToDeactivate(null)}
          open
          title="Confirmar desactivación"
        >
          <p className="text-sm text-ink-2">
            {productToDeactivate.name} será desactivado y no aparecerá en el POS. Puedes reactivarlo más tarde.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
