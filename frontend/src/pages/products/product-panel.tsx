import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Lock, Plus, Printer, X } from "lucide-react";

import type { Category, Product, ProductPayload, UnitOfMeasure } from "../../api/products";
import { Button, Card, Input, Select } from "../../components/ui";
import { cn } from "../../lib/cn";
import { getErrorMessage } from "./error-message";
import type { ProductFormState } from "./form-state";
import { emptyForm, formToPayload, productToForm } from "./form-state";
import { NewCategoryModal } from "./new-category-modal";
import {
  LOW_MARGIN_PCT,
  costCents,
  formatCents,
  formatMargin,
  marginPct,
  priceWithTaxCents,
  profitCents,
  toCents,
} from "./pricing";
import { alertClass, textareaClass } from "./styles";

type ProductPanelProps = {
  canDeactivate: boolean;
  canEdit: boolean;
  categories: Category[];
  error: Error | null;
  isLoading: boolean;
  onClose: () => void;
  onDeactivate: (product: Product) => void;
  onLabel: (product: Product) => void;
  onReactivate: (product: Product) => void;
  onSubmit: (payload: ProductPayload) => void;
  /** Muestra "Cambios guardados." tras guardar. */
  saved: boolean;
  /** `null` = alta de un producto nuevo. */
  product: Product | null;
  units: UnitOfMeasure[];
};

/**
 * Panel lateral de producto: alta, edición o consulta (solo lectura según permisos).
 * Calcula en vivo el precio con IVA, la utilidad y el margen a partir de los campos.
 */
export function ProductPanel({
  canDeactivate,
  canEdit,
  categories,
  error,
  isLoading,
  onClose,
  onDeactivate,
  onLabel,
  onReactivate,
  onSubmit,
  product,
  saved,
  units,
}: ProductPanelProps) {
  const initialForm = useMemo(() => (product ? productToForm(product) : emptyForm), [product]);
  const [form, setForm] = useState<ProductFormState>(initialForm);
  const [showNewCategory, setShowNewCategory] = useState(false);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  const readOnly = !canEdit;
  const errorMessage = getErrorMessage(error);
  const canSubmit = Boolean(form.sku.trim() && form.name.trim() && form.unit_id && form.sale_price);

  const price = toCents(form.sale_price);
  const cost = costCents(form.avg_cost, form.purchase_price);
  const margin = marginPct(price, cost);

  function setField(field: keyof ProductFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || readOnly) return;
    onSubmit(formToPayload(form));
  }

  const kicker = product ? `${readOnly ? "Consulta" : "Editar"} · ${product.sku}` : "Alta";

  return (
    <Card aria-label="Panel de producto" className="flex flex-col" frame id="product-panel">
      <header className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3.5">
        <div className="min-w-0">
          <div className="font-heading text-sm font-semibold uppercase tracking-widest text-acc-text">{kicker}</div>
          <h2 className="mt-0.5 break-words text-2xl leading-tight">{product ? product.name : "Nuevo producto"}</h2>
        </div>
        <Button aria-label="Cerrar panel" onClick={onClose} variant="icon">
          <X aria-hidden="true" size={16} />
        </Button>
      </header>

      <form className="grid gap-4 px-4 py-4" id="product-form" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="SKU" name="sku" onChange={(e) => setField("sku", e.target.value)} readOnly={readOnly} value={form.sku} />
          <Input label="Código de barras" name="barcode" onChange={(e) => setField("barcode", e.target.value)} readOnly={readOnly} value={form.barcode} />
        </div>
        <Input label="Nombre" name="name" onChange={(e) => setField("name", e.target.value)} readOnly={readOnly} value={form.name} />
        <label className="grid gap-1.5 text-sm font-medium text-ink-2">
          <span>Descripción</span>
          <textarea className={textareaClass} onChange={(e) => setField("description", e.target.value)} readOnly={readOnly} value={form.description} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select
                disabled={readOnly}
                label="Categoría"
                name="category_id"
                onChange={(e) => setField("category_id", e.target.value)}
                options={categories.map((category) => ({ value: category.id, label: category.name }))}
                placeholder="Sin categoría"
                value={form.category_id}
              />
            </div>
            {!readOnly ? (
              <Button aria-label="Nueva categoría" onClick={() => setShowNewCategory(true)} title="Nueva categoría" type="button" variant="secondary">
                <Plus aria-hidden="true" size={16} />
              </Button>
            ) : null}
          </div>
          <Select
            disabled={readOnly}
            label="Unidad"
            name="unit_id"
            onChange={(e) => setField("unit_id", e.target.value)}
            options={units.map((unit) => ({ value: unit.id, label: `${unit.name} (${unit.abbreviation})` }))}
            placeholder="Seleccionar"
            value={form.unit_id}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input className="tabular-nums" label="Costo" name="purchase_price" onChange={(e) => setField("purchase_price", e.target.value)} readOnly={readOnly} type="number" value={form.purchase_price} />
          <Input className="tabular-nums" label="Promedio" name="avg_cost" onChange={(e) => setField("avg_cost", e.target.value)} readOnly={readOnly} type="number" value={form.avg_cost} />
          <Input className="tabular-nums" label="Precio de venta" name="sale_price" onChange={(e) => setField("sale_price", e.target.value)} readOnly={readOnly} type="number" value={form.sale_price} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input className="tabular-nums" label="IVA %" name="tax_rate" onChange={(e) => setField("tax_rate", e.target.value)} readOnly={readOnly} type="number" value={form.tax_rate} />
          <Input className="tabular-nums" label="Stock mínimo" name="min_stock" onChange={(e) => setField("min_stock", e.target.value)} readOnly={readOnly} type="number" value={form.min_stock} />
          <Input className="tabular-nums" label="Stock máximo" name="max_stock" onChange={(e) => setField("max_stock", e.target.value)} readOnly={readOnly} type="number" value={form.max_stock} />
        </div>

        <dl className="grid grid-cols-3 border border-divider" data-testid="product-metrics">
          <div className="min-w-0 px-3 py-2.5">
            <dt className="text-xs text-ink-2">Precio c/IVA</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">{formatCents(priceWithTaxCents(price, form.tax_rate))}</dd>
          </div>
          <div className="min-w-0 border-l border-divider px-3 py-2.5">
            <dt className="text-xs text-ink-2">Utilidad</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">{formatCents(profitCents(price, cost))}</dd>
          </div>
          <div className="min-w-0 border-l border-divider px-3 py-2.5">
            <dt className="text-xs text-ink-2">Margen</dt>
            <dd className={cn("font-heading text-xl font-semibold tabular-nums", margin != null && margin < LOW_MARGIN_PCT && "text-warn")}>
              {formatMargin(margin)}
            </dd>
          </div>
        </dl>

        {units.length === 0 ? (
          <div className="border border-warn bg-warn-tint px-3 py-2 text-sm font-medium text-warn">No hay unidades de medida registradas.</div>
        ) : null}

        {errorMessage ? (
          <div className={alertClass} role="alert">
            {errorMessage}
          </div>
        ) : null}

        {readOnly ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-2">
            <Lock aria-hidden="true" size={14} />
            Tu rol solo puede consultar el catálogo.
          </p>
        ) : null}

        {saved && !errorMessage ? (
          <p className="flex items-center gap-1.5 text-sm text-ok" role="status">
            <CircleCheck aria-hidden="true" size={14} />
            Cambios guardados.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!readOnly ? (
            <Button className="flex-1" disabled={!canSubmit || isLoading} frame type="submit">
              {isLoading ? "Guardando" : product ? "Guardar cambios" : "Crear producto"}
            </Button>
          ) : null}
          {product ? (
            <Button icon={<Printer aria-hidden="true" size={15} />} onClick={() => onLabel(product)} type="button" variant="secondary">
              Etiqueta
            </Button>
          ) : null}
          {product && canDeactivate ? (
            product.is_active ? (
              <Button className="text-bad" onClick={() => onDeactivate(product)} type="button" variant="ghost">
                Desactivar
              </Button>
            ) : (
              <Button onClick={() => onReactivate(product)} type="button" variant="ghost">
                Reactivar
              </Button>
            )
          ) : null}
        </div>
      </form>

      {showNewCategory ? (
        <NewCategoryModal onClose={() => setShowNewCategory(false)} onCreated={(id) => setField("category_id", String(id))} />
      ) : null}
    </Card>
  );
}
