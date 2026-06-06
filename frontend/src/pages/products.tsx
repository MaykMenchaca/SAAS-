import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Edit, PackagePlus, Search, Trash2 } from "lucide-react";

import type { Category, Product, ProductPayload, UnitOfMeasure } from "../api/products";
import {
  createProduct,
  deactivateProduct,
  listCategories,
  listProducts,
  listUnits,
  updateProduct,
} from "../api/products";
import { Badge, Button, Card, Input, Modal, Table, tableCellClass, tableHeadClass } from "../components/ui";

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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products", page, search],
    queryFn: () => listProducts({ page, search }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const unitsQuery = useQuery({
    queryKey: ["units"],
    queryFn: listUnits,
  });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductPayload }) => updateProduct(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      closeModal();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const products = productsQuery.data?.items ?? [];
  const totalPages = productsQuery.data?.pages ?? 1;

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Productos</h1>
          <p className="text-sm text-neutral-text-secondary">Catalogo y precios de venta</p>
        </div>
        <Button icon={<PackagePlus aria-hidden="true" size={18} />} onClick={openCreateModal}>
          Nuevo
        </Button>
      </div>

      <section className="grid gap-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
          <Input
            label="Buscar"
            name="search"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="SKU, codigo o nombre"
            value={searchInput}
          />
          <div className="flex items-end">
            <Button className="w-full sm:w-auto" icon={<Search aria-hidden="true" size={18} />} type="submit">
              Buscar
            </Button>
          </div>
        </form>

        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th className={tableHeadClass}>Producto</th>
                <th className={tableHeadClass}>Categoria</th>
                <th className={tableHeadClass}>Unidad</th>
                <th className={tableHeadClass}>Precio</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={product.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-neutral-text-primary">{product.name}</div>
                    <div className="font-mono text-xs text-neutral-text-secondary">{product.sku}</div>
                  </td>
                  <td className={tableCellClass}>{product.category?.name ?? "Sin categoria"}</td>
                  <td className={tableCellClass}>{product.unit.abbreviation}</td>
                  <td className={`${tableCellClass} font-mono font-semibold`}>${product.sale_price}</td>
                  <td className={tableCellClass}>
                    <Badge tone={product.is_active ? "success" : "danger"}>
                      {product.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex gap-2">
                      <Button
                        aria-label={`Editar ${product.name}`}
                        className="h-11 w-11 px-0"
                        onClick={() => openEditModal(product)}
                        variant="secondary"
                      >
                        <Edit aria-hidden="true" size={17} />
                      </Button>
                      <Button
                        aria-label={`Desactivar ${product.name}`}
                        className="h-11 w-11 px-0"
                        disabled={deactivateMutation.isPending || !product.is_active}
                        onClick={() => deactivateMutation.mutate(product.id)}
                        variant="danger"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {!productsQuery.isLoading && products.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={6}>
                    Sin productos registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
          <span>
            Pagina {productsQuery.data?.page ?? page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button disabled={page <= 1 || productsQuery.isFetching} onClick={() => setPage((value) => value - 1)} variant="secondary">
              Anterior
            </Button>
            <Button disabled={page >= totalPages || productsQuery.isFetching} onClick={() => setPage((value) => value + 1)} variant="secondary">
              Siguiente
            </Button>
          </div>
        </div>
      </section>

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

  const errorMessage = getErrorMessage(error);
  const canSubmit = Boolean(form.sku.trim() && form.name.trim() && form.unit_id && form.sale_price);

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

  return (
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
            label="Codigo"
            name="barcode"
            onChange={(event) => setField("barcode", event.target.value)}
            value={form.barcode}
          />
        </div>
        <Input label="Nombre" name="name" onChange={(event) => setField("name", event.target.value)} value={form.name} />
        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Descripcion</span>
          <textarea
            className="min-h-20 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setField("description", event.target.value)}
            value={form.description}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
            <span>Categoria</span>
            <select
              className="min-h-11 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setField("category_id", event.target.value)}
              value={form.category_id}
            >
              <option value="">Sin categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
            <span>Unidad</span>
            <select
              className="min-h-11 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setField("unit_id", event.target.value)}
              value={form.unit_id}
            >
              <option value="">Seleccionar</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.abbreviation})
                </option>
              ))}
            </select>
          </label>
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
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-warning">
            No hay unidades de medida registradas.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
            {errorMessage}
          </div>
        ) : null}
      </form>
    </Modal>
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
