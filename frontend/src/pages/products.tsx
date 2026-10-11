import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, Edit, Package, PackagePlus, Plus, Printer, RotateCcw, Search, Trash2, Tag, Scale } from "lucide-react";
import { toast } from "sonner";

import { getLowStock } from "../api/inventory";
import { previewProductLabel, printProductLabel } from "../api/printing";
import type { Category, Product, ProductPayload, UnitOfMeasure } from "../api/products";
import {
  createCategory,
  createProduct,
  deactivateProduct,
  reactivateProduct,
  listCategories,
  listProducts,
  listUnits,
  updateProduct,
  updateCategory,
  deactivateCategory,
  createUnit,
  updateUnit,
  deleteUnit,
} from "../api/products";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, Select, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";
import { formatStock } from "../lib/formatters";
import { qk } from "../api/query-keys";

type ProductFormState = {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category_id: string;
  unit_id: string;
  purchase_price: string;
  avg_cost: string;
  sale_price: string;
  tax_rate: string;
  min_stock: string;
  max_stock: string;
};

const emptyForm: ProductFormState = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category_id: "",
  unit_id: "",
  purchase_price: "0.00",
  avg_cost: "0.00",
  sale_price: "",
  tax_rate: "16.00",
  min_stock: "0.000",
  max_stock: "0.000",
};

function productToForm(product: Product): ProductFormState {
  return {
    sku: product.sku,
    barcode: product.barcode ?? "",
    name: product.name,
    description: product.description ?? "",
    category_id: product.category_id ? String(product.category_id) : "",
    unit_id: String(product.unit_id),
    purchase_price: product.purchase_price,
    avg_cost: product.avg_cost,
    sale_price: product.sale_price,
    tax_rate: product.tax_rate,
    min_stock: product.min_stock,
    max_stock: product.max_stock,
  };
}

function formToPayload(form: ProductFormState): ProductPayload {
  return {
    sku: form.sku.trim(),
    barcode: form.barcode.trim() || null,
    name: form.name.trim(),
    description: form.description.trim() || null,
    category_id: form.category_id ? Number(form.category_id) : null,
    unit_id: Number(form.unit_id),
    purchase_price: form.purchase_price,
    avg_cost: form.avg_cost,
    sale_price: form.sale_price,
    tax_rate: form.tax_rate,
    min_stock: form.min_stock,
    max_stock: form.max_stock,
  };
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [labelProductId, setLabelProductId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"productos" | "categorias" | "unidades">("productos");

  const [showInactive, setShowInactive] = useState(false);

  const productsQuery = useQuery({
    queryKey: qk.products(page, search, showInactive),
    queryFn: () => listProducts({ page, search, includeInactive: showInactive }),
  });

  const categoriesQuery = useQuery({
    queryKey: qk.categories(),
    queryFn: listCategories,
  });

  const unitsQuery = useQuery({
    queryKey: qk.units(),
    queryFn: listUnits,
  });

  const lowStockQuery = useQuery({
    queryKey: qk.lowStock(),
    queryFn: getLowStock,
  });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductPayload }) => updateProduct(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      closeModal();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateProduct,
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: qk.products() });
      await queryClient.invalidateQueries({ queryKey: qk.stock() });
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
    () => new Map((lowStockQuery.data ?? []).map((item) => [item.product_id, item])),
    [lowStockQuery.data],
  );

  function openCreateModal() {
    setEditingProduct(null);
    setIsModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setIsModalOpen(true);
  }

  function closeModal() {
    setEditingProduct(null);
    setIsModalOpen(false);
    createMutation.reset();
    updateMutation.reset();
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Productos"
        subtitle="Catálogo, categorías y unidades de medida"
        actions={
          activeTab === "productos" ? (
            <Button icon={<PackagePlus aria-hidden="true" size={18} />} onClick={openCreateModal}>
              Nuevo
            </Button>
          ) : undefined
        }
      />

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "productos"
              ? "bg-neutral-surface text-primary-text shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("productos")}
          type="button"
        >
          <Package aria-hidden="true" size={16} />
          Productos
        </button>
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "categorias"
              ? "bg-neutral-surface text-primary-text shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("categorias")}
          type="button"
        >
          <Tag aria-hidden="true" size={16} />
          Categorías
        </button>
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "unidades"
              ? "bg-neutral-surface text-primary-text shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("unidades")}
          type="button"
        >
          <Scale aria-hidden="true" size={16} />
          Unidades
        </button>
      </nav>

      {activeTab === "productos" ? (
        <section className="grid gap-3">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
            <Input
              label="Buscar"
              name="search"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="SKU, código o nombre"
              value={searchInput}
            />
            <div className="flex items-end">
              <Button className="w-full sm:w-auto" icon={<Search aria-hidden="true" size={18} />} type="submit">
                Buscar
              </Button>
            </div>
            <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium text-neutral-text-primary sm:whitespace-nowrap">
              <input
                checked={showInactive}
                className="h-5 w-5 accent-primary"
                onChange={(event) => {
                  setShowInactive(event.target.checked);
                  setPage(1);
                }}
                type="checkbox"
              />
              Mostrar inactivos
            </label>
          </form>

          {productsQuery.isLoading ? (
            <SkeletonTable rows={8} cols={6} />
          ) : productsQuery.isError ? (
            <ErrorState onRetry={() => void productsQuery.refetch()} />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <caption className="sr-only">Tabla de productos</caption>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Producto</th>
                    <th className={tableHeadClass}>Categoría</th>
                    <th className={tableHeadClass}>Unidad</th>
                    <th className={`${tableHeadClass} text-right`}>Precio</th>
                    <th className={tableHeadClass}>Estado</th>
                    <th className={tableHeadClass}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const lowStock = lowStockByProductId.get(product.id);

                    return (
                      <tr className={tableRowClass} key={product.id}>
                        <td className={tableCellClass}>
                          <div className="font-semibold text-neutral-text-primary">{product.name}</div>
                          <div className="font-mono text-xs text-neutral-text-secondary">{product.sku}</div>
                        </td>
                        <td className={tableCellClass}>{product.category?.name ?? "Sin categoría"}</td>
                        <td className={tableCellClass}>{product.unit.abbreviation}</td>
                        <td className={`${tableCellClass} text-right font-mono font-semibold`}>${product.sale_price}</td>
                        <td className={tableCellClass}>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge dot tone={product.is_active ? "success" : "danger"}>
                              {product.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                            {lowStock ? (
                              <Badge tone="warning">
                                <AlertTriangle aria-hidden="true" className="mr-1 inline" size={12} />
                                {formatStock(lowStock.quantity)} / mín. {formatStock(lowStock.min_stock)}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="flex gap-2">
                            <Tooltip content="Editar">
                              <Button
                                aria-label={`Editar ${product.name}`}
                                className="h-11 w-11 px-0"
                                onClick={() => openEditModal(product)}
                                variant="secondary"
                              >
                                <Edit aria-hidden="true" size={17} />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Imprimir etiqueta">
                              <Button
                                aria-label={`Etiqueta ${product.name}`}
                                className="h-11 w-11 px-0"
                                onClick={() => setLabelProductId(product.id)}
                                variant="secondary"
                              >
                                <Printer aria-hidden="true" size={17} />
                              </Button>
                            </Tooltip>
                            {product.is_active ? (
                              <Tooltip content="Desactivar">
                                <Button
                                  aria-label={`Desactivar ${product.name}`}
                                  className="h-11 w-11 px-0 hover:text-danger hover:bg-danger/10"
                                  onClick={() => setConfirmDeactivateId(product.id)}
                                  variant="ghost"
                                >
                                  <Trash2 aria-hidden="true" size={17} />
                                </Button>
                              </Tooltip>
                            ) : (
                              <Tooltip content="Reactivar">
                                <Button
                                  aria-label={`Reactivar ${product.name}`}
                                  className="h-11 w-11 px-0 hover:text-success hover:bg-success/10"
                                  disabled={reactivateMutation.isPending}
                                  onClick={() => reactivateMutation.mutate(product.id)}
                                  variant="ghost"
                                >
                                  <RotateCcw aria-hidden="true" size={17} />
                                </Button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon={<Package size={32} />} message="Sin productos registrados." actionLabel="Nuevo producto" onAction={openCreateModal} />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
            <span>Página {productsQuery.data?.page ?? page} de {totalPages}</span>
            <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
          </div>
        </section>
      ) : activeTab === "categorias" ? (
        <CategoriesTab />
      ) : (
        <UnitsTab />
      )}

      <ProductFormModal
        categories={categoriesQuery.data ?? []}
        error={createMutation.error ?? updateMutation.error}
        isLoading={createMutation.isPending || updateMutation.isPending}
        onClose={closeModal}
        onSubmit={(payload) => {
          if (editingProduct) {
            updateMutation.mutate({ id: editingProduct.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
        open={isModalOpen}
        product={editingProduct}
        units={unitsQuery.data ?? []}
      />

      {labelProductId !== null ? (
        <LabelPreviewModal onClose={() => setLabelProductId(null)} productId={labelProductId} />
      ) : null}

      {confirmDeactivateId ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmDeactivateId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  deactivateMutation.mutate(confirmDeactivateId, {
                    onSuccess: () => setConfirmDeactivateId(null),
                  });
                }}
                variant="danger"
              >
                {deactivateMutation.isPending ? "Desactivando..." : "Desactivar"}
              </Button>
            </>
          }
          onClose={() => setConfirmDeactivateId(null)}
          open
          title="Confirmar desactivacion"
        >
          <p className="text-sm text-neutral-text-secondary">
            El producto sera desactivado y no aparecera en el POS. Puedes reactivarlo mas tarde.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

type ProductFormModalProps = {
  categories: Category[];
  error: Error | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (payload: ProductPayload) => void;
  open: boolean;
  product: Product | null;
  units: UnitOfMeasure[];
};

function ProductFormModal({
  categories,
  error,
  isLoading,
  onClose,
  onSubmit,
  open,
  product,
  units,
}: ProductFormModalProps) {
  const initialForm = useMemo(() => (product ? productToForm(product) : emptyForm), [product]);
  const [form, setForm] = useState<ProductFormState>(initialForm);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const queryClient = useQueryClient();
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: async (newCategory) => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      setField("category_id", String(newCategory.id));
      setShowCreateCategoryModal(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
      toast.success("Categoría creada con éxito.");
    },
  });

  const errorMessage = getErrorMessage(error);
  const canSubmit = Boolean(form.sku.trim() && form.name.trim() && form.unit_id && form.sale_price);
  const canSubmitCategory = Boolean(newCategoryName.trim());

  function setField(field: keyof ProductFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit(formToPayload(form));
  }

  function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitCategory) return;
    createCategoryMutation.mutate({
      name: newCategoryName.trim(),
      description: newCategoryDescription.trim() || undefined,
    });
  }

  return (
    <>
      <Modal
        footer={
          <>
            <Button onClick={onClose} variant="secondary">
              Cancelar
            </Button>
            <Button disabled={!canSubmit || isLoading} form="product-form" type="submit">
              {isLoading ? "Guardando" : "Guardar"}
            </Button>
          </>
        }
        onClose={onClose}
        open={open}
        title={product ? "Editar producto" : "Nuevo producto"}
      >
        <form className="grid gap-4" id="product-form" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="SKU" name="sku" onChange={(event) => setField("sku", event.target.value)} value={form.sku} />
            <Input
              label="Código"
              name="barcode"
              onChange={(event) => setField("barcode", event.target.value)}
              value={form.barcode}
            />
          </div>
          <Input label="Nombre" name="name" onChange={(event) => setField("name", event.target.value)} value={form.name} />
          <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
            <span>Descripción</span>
            <textarea
              className="min-h-20 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setField("description", event.target.value)}
              value={form.description}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Categoría"
                  name="category_id"
                  onChange={(event) => setField("category_id", event.target.value)}
                  options={categories.map((category) => ({ value: category.id, label: category.name }))}
                  placeholder="Sin categoría"
                  value={form.category_id}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateCategoryModal(true)}
                className="h-11 px-3 flex items-center justify-center shrink-0"
                title="Nueva Categoría"
              >
                <Plus size={16} />
              </Button>
            </div>
            <Select
              label="Unidad"
              name="unit_id"
              onChange={(event) => setField("unit_id", event.target.value)}
              options={units.map((unit) => ({ value: unit.id, label: `${unit.name} (${unit.abbreviation})` }))}
              placeholder="Seleccionar"
              value={form.unit_id}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Costo"
              name="purchase_price"
              onChange={(event) => setField("purchase_price", event.target.value)}
              type="number"
              value={form.purchase_price}
            />
            <Input
              label="Promedio"
              name="avg_cost"
              onChange={(event) => setField("avg_cost", event.target.value)}
              type="number"
              value={form.avg_cost}
            />
            <Input
              label="Precio"
              name="sale_price"
              onChange={(event) => setField("sale_price", event.target.value)}
              type="number"
              value={form.sale_price}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="IVA %" name="tax_rate" onChange={(event) => setField("tax_rate", event.target.value)} type="number" value={form.tax_rate} />
            <Input label="Min" name="min_stock" onChange={(event) => setField("min_stock", event.target.value)} type="number" value={form.min_stock} />
            <Input label="Max" name="max_stock" onChange={(event) => setField("max_stock", event.target.value)} type="number" value={form.max_stock} />
          </div>

          {units.length === 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
              No hay unidades de medida registradas.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
              {errorMessage}
            </div>
          ) : null}
        </form>
      </Modal>

      {showCreateCategoryModal && (
        <Modal
          open={showCreateCategoryModal}
          onClose={() => setShowCreateCategoryModal(false)}
          title="Nueva Categoría"
          footer={
            <>
              <Button onClick={() => setShowCreateCategoryModal(false)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={!canSubmitCategory || createCategoryMutation.isPending}
                form="category-create-form"
                type="submit"
              >
                {createCategoryMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </>
          }
        >
          <form id="category-create-form" onSubmit={handleCreateCategory} className="grid gap-4">
            <Input
              label="Nombre de la Categoría"
              name="new-category-name"
              onChange={(e) => setNewCategoryName(e.target.value)}
              value={newCategoryName}
              required
            />
            <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
              <span>Descripción (Opcional)</span>
              <textarea
                className="min-h-20 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                value={newCategoryDescription}
              />
            </label>
            {createCategoryMutation.isError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
                Error al crear la categoría.
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}

function getErrorMessage(error: Error | null) {
  if (!error) {
    return "";
  }

  if (error instanceof AxiosError) {
    const details = error.response?.data?.details;
    if (details && typeof details === "object") {
      return Object.values(details).flat().join(" ");
    }
    return error.response?.data?.error ?? "No se pudo guardar.";
  }

  return "No se pudo guardar.";
}

// ── Label Preview Modal ───────────────────────────────────────────

function LabelPreviewModal({ productId, onClose }: { productId: number; onClose: () => void }) {
  const previewQuery = useQuery({
    queryKey: qk.labelPreview(productId),
    queryFn: () => previewProductLabel(productId),
  });

  const printMutation = useMutation({
    mutationFn: () => printProductLabel(productId),
  });

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cerrar
          </Button>
          <Button
            disabled={printMutation.isPending || previewQuery.isLoading}
            icon={<Printer aria-hidden="true" size={18} />}
            onClick={() => printMutation.mutate()}
          >
            {printMutation.isPending ? "Imprimiendo..." : "Imprimir"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Vista previa de etiqueta"
    >
      {previewQuery.isLoading ? (
        <div className="py-8 text-center text-sm text-neutral-text-secondary">Generando vista previa...</div>
      ) : previewQuery.isError ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
          No se pudo generar la vista previa.
        </div>
      ) : (
        <pre className="max-h-80 overflow-auto rounded-md bg-neutral-800 p-4 font-mono text-xs leading-relaxed text-neutral-100">
          {previewQuery.data?.content ?? ""}
        </pre>
      )}
      {printMutation.isSuccess ? (
        <div className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          Etiqueta enviada a impresión.
        </div>
      ) : null}
      {printMutation.isError ? (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
          Error al imprimir la etiqueta.
        </div>
      ) : null}
    </Modal>
  );
}

function CategoriesTab() {
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: qk.categories(),
    queryFn: listCategories,
  });

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      closeCategoryModal();
      toast.success("Categoría creada con éxito.");
    },
    onError: () => {
      toast.error("Error al crear la categoría.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; description?: string } }) =>
      updateCategory(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      closeCategoryModal();
      toast.success("Categoría actualizada con éxito.");
    },
    onError: () => {
      toast.error("Error al actualizar la categoría.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      toast.success("Categoría desactivada con éxito.");
    },
    onError: () => {
      toast.error("Error al desactivar la categoría.");
    },
  });

  function openCreateModal() {
    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryDescription("");
    setIsCategoryModalOpen(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryDescription(category.description ?? "");
    setIsCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryDescription("");
    setIsCategoryModalOpen(false);
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-text-primary">Administrar Categorías</h2>
          <p className="text-xs text-neutral-text-secondary">Clasificación de productos</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreateModal}>
          Nueva Categoría
        </Button>
      </div>

      {categoriesQuery.isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : categoriesQuery.isError ? (
        <ErrorState onRetry={() => void categoriesQuery.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <caption className="sr-only">Tabla de categorías</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Categoría</th>
                <th className={tableHeadClass}>Descripción</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr className={tableRowClass} key={category.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-neutral-text-primary">{category.name}</div>
                  </td>
                  <td className={tableCellClass}>
                    <span className="text-sm text-neutral-text-secondary">{category.description ?? "—"}</span>
                  </td>
                  <td className={tableCellClass}>
                    <Badge dot tone={category.is_active ? "success" : "danger"}>
                      {category.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex gap-2">
                      <Tooltip content="Editar">
                        <Button
                          aria-label={`Editar ${category.name}`}
                          className="h-11 w-11 px-0"
                          onClick={() => openEditModal(category)}
                          variant="secondary"
                        >
                          <Edit aria-hidden="true" size={17} />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Desactivar">
                        <Button
                          aria-label={`Desactivar ${category.name}`}
                          className="h-11 w-11 px-0 hover:text-danger hover:bg-danger/10"
                          disabled={!category.is_active}
                          onClick={() => setConfirmDeactivateId(category.id)}
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" size={17} />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<Tag size={32} />}
                      message="Sin categorías registradas."
                      actionLabel="Nueva categoría"
                      onAction={openCreateModal}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {isCategoryModalOpen && (
        <Modal
          open={isCategoryModalOpen}
          onClose={closeCategoryModal}
          title={editingCategory ? "Editar Categoría" : "Nueva Categoría"}
          footer={
            <>
              <Button onClick={closeCategoryModal} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={!newCategoryName.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  if (editingCategory) {
                    updateMutation.mutate({
                      id: editingCategory.id,
                      payload: { name: newCategoryName.trim(), description: newCategoryDescription.trim() || undefined }
                    });
                  } else {
                    createMutation.mutate({
                      name: newCategoryName.trim(),
                      description: newCategoryDescription.trim() || undefined
                    });
                  }
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Input
              label="Nombre"
              onChange={(e) => setNewCategoryName(e.target.value)}
              value={newCategoryName}
              required
            />
            <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
              <span>Descripción (Opcional)</span>
              <textarea
                className="min-h-20 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                value={newCategoryDescription}
              />
            </label>
          </div>
        </Modal>
      )}

      {confirmDeactivateId && (
        <Modal
          open={confirmDeactivateId !== null}
          onClose={() => setConfirmDeactivateId(null)}
          title="Confirmar desactivación"
          footer={
            <>
              <Button onClick={() => setConfirmDeactivateId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  if (confirmDeactivateId) {
                    deactivateMutation.mutate(confirmDeactivateId, {
                      onSuccess: () => setConfirmDeactivateId(null),
                    });
                  }
                }}
                variant="danger"
              >
                Desactivar
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-text-secondary">
            La categoría será desactivada. Los productos existentes mantendrán su relación pero no aparecerá para nuevos registros.
          </p>
        </Modal>
      )}
    </div>
  );
}

function UnitsTab() {
  const queryClient = useQueryClient();
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [unitAbbreviation, setUnitAbbreviation] = useState("");
  const [unitAllowsFractions, setUnitAllowsFractions] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const unitsQuery = useQuery({
    queryKey: qk.units(),
    queryFn: listUnits,
  });

  const createMutation = useMutation({
    mutationFn: createUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.units() });
      closeUnitModal();
      toast.success("Unidad de medida creada con éxito.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof AxiosError ? err.response?.data?.error ?? "Error al crear la unidad." : "Error al crear la unidad.";
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; abbreviation: string; allows_fractions: boolean } }) =>
      updateUnit(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.units() });
      closeUnitModal();
      toast.success("Unidad de medida actualizada con éxito.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof AxiosError ? err.response?.data?.error ?? "Error al actualizar la unidad." : "Error al actualizar la unidad.";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.units() });
      toast.success("Unidad de medida eliminada con éxito.");
      setConfirmDeleteId(null);
    },
    onError: (err: unknown) => {
      const details = err instanceof AxiosError ? err.response?.data?.details?.error?.[0] || err.response?.data?.error : null;
      toast.error(details ?? "No se puede eliminar la unidad porque está asociada a productos.");
      setConfirmDeleteId(null);
    },
  });

  function openCreateModal() {
    setEditingUnit(null);
    setUnitName("");
    setUnitAbbreviation("");
    setUnitAllowsFractions(false);
    setIsUnitModalOpen(true);
  }

  function openEditModal(unit: UnitOfMeasure) {
    setEditingUnit(unit);
    setUnitName(unit.name);
    setUnitAbbreviation(unit.abbreviation);
    setUnitAllowsFractions(unit.allows_fractions);
    setIsUnitModalOpen(true);
  }

  function closeUnitModal() {
    setEditingUnit(null);
    setUnitName("");
    setUnitAbbreviation("");
    setUnitAllowsFractions(false);
    setIsUnitModalOpen(false);
  }

  const units = unitsQuery.data ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-text-primary">Unidades de Medida</h2>
          <p className="text-xs text-neutral-text-secondary">Unidades para control de stock</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreateModal}>
          Nueva Unidad
        </Button>
      </div>

      {unitsQuery.isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : unitsQuery.isError ? (
        <ErrorState onRetry={() => void unitsQuery.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <caption className="sr-only">Tabla de unidades de medida</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Nombre</th>
                <th className={tableHeadClass}>Abreviatura</th>
                <th className={tableHeadClass}>Permite Fracciones</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr className={tableRowClass} key={unit.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-neutral-text-primary">{unit.name}</div>
                  </td>
                  <td className={tableCellClass}>
                    <span className="font-mono text-sm text-neutral-text-secondary">{unit.abbreviation}</span>
                  </td>
                  <td className={tableCellClass}>
                    <Badge dot tone={unit.allows_fractions ? "success" : "neutral"}>
                      {unit.allows_fractions ? "Sí" : "No"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex gap-2">
                      <Tooltip content="Editar">
                        <Button
                          aria-label={`Editar ${unit.name}`}
                          className="h-11 w-11 px-0"
                          onClick={() => openEditModal(unit)}
                          variant="secondary"
                        >
                          <Edit aria-hidden="true" size={17} />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Eliminar">
                        <Button
                          aria-label={`Eliminar ${unit.name}`}
                          className="h-11 w-11 px-0 hover:text-danger hover:bg-danger/10"
                          onClick={() => setConfirmDeleteId(unit.id)}
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" size={17} />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {isUnitModalOpen && (
        <Modal
          open={isUnitModalOpen}
          onClose={closeUnitModal}
          title={editingUnit ? "Editar Unidad de Medida" : "Nueva Unidad de Medida"}
          footer={
            <>
              <Button onClick={closeUnitModal} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={!unitName.trim() || !unitAbbreviation.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  const payload = {
                    name: unitName.trim(),
                    abbreviation: unitAbbreviation.trim(),
                    allows_fractions: unitAllowsFractions,
                  };
                  if (editingUnit) {
                    updateMutation.mutate({ id: editingUnit.id, payload });
                  } else {
                    createMutation.mutate(payload);
                  }
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Input
              label="Nombre"
              onChange={(e) => setUnitName(e.target.value)}
              value={unitName}
              required
            />
            <Input
              label="Abreviatura"
              onChange={(e) => setUnitAbbreviation(e.target.value)}
              value={unitAbbreviation}
              required
            />
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-text-primary">
              <input
                type="checkbox"
                checked={unitAllowsFractions}
                onChange={(e) => setUnitAllowsFractions(e.target.checked)}
                className="rounded border-neutral-border bg-neutral-surface text-primary-text focus:ring-primary/20 h-4 w-4"
              />
              <span>Permite cantidades fraccionadas (Ej. 1.5 kg)</span>
            </label>
          </div>
        </Modal>
      )}

      {confirmDeleteId && (
        <Modal
          open={confirmDeleteId !== null}
          onClose={() => setConfirmDeleteId(null)}
          title="Confirmar eliminación"
          footer={
            <>
              <Button onClick={() => setConfirmDeleteId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirmDeleteId) {
                    deleteMutation.mutate(confirmDeleteId);
                  }
                }}
                variant="danger"
              >
                Eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-text-secondary">
            ¿Estás seguro de eliminar esta unidad de medida? Esta acción no se puede deshacer y fallará si hay productos asociados a ella.
          </p>
        </Modal>
      )}
    </div>
  );
}
