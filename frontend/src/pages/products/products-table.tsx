import { AlertTriangle, Edit, Package, Printer, RotateCcw, Trash2 } from "lucide-react";

import type { StockItem } from "../../api/inventory";
import type { Product } from "../../api/products";
import { Badge, Button, EmptyState, Table, Tooltip, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatQuantity, formatStock } from "../../lib/formatters";
import { LOW_MARGIN_PCT, costCents, formatCents, formatMargin, marginPct, toCents } from "./pricing";

type ProductsTableProps = {
  canCreate: boolean;
  canDeactivate: boolean;
  canEdit: boolean;
  lowStockByProductId: Map<number, StockItem>;
  onCreate: () => void;
  onDeactivate: (product: Product) => void;
  onLabel: (product: Product) => void;
  onReactivate: (product: Product) => void;
  onSelect: (product: Product) => void;
  products: Product[];
  reactivating: boolean;
  selectedId: number | null;
};

/** Tabla de productos: producto, categoría, costo, precio, margen, stock y estado. */
export function ProductsTable({
  canCreate,
  canDeactivate,
  canEdit,
  lowStockByProductId,
  onCreate,
  onDeactivate,
  onLabel,
  onReactivate,
  onSelect,
  products,
  reactivating,
  selectedId,
}: ProductsTableProps) {
  return (
    <Table>
      <caption className="sr-only">Tabla de productos</caption>
      <thead>
        <tr>
          <th className={tableHeadClass}>Producto</th>
          <th className={tableHeadClass}>Categoría</th>
          <th className={cn(tableHeadClass, tableNumClass)}>Costo</th>
          <th className={cn(tableHeadClass, tableNumClass)}>Precio</th>
          <th className={cn(tableHeadClass, tableNumClass)}>Margen</th>
          <th className={cn(tableHeadClass, tableNumClass)}>Stock</th>
          <th className={tableHeadClass}>Estado</th>
          <th className={tableHeadClass}>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const lowStock = lowStockByProductId.get(product.id);
          const price = toCents(product.sale_price);
          const cost = costCents(product.avg_cost, product.purchase_price);
          const margin = marginPct(price, cost);
          const stock = product.stock_qty != null ? Number(product.stock_qty) : null;
          const outOfStock = stock != null && stock <= 0;
          const selected = product.id === selectedId;

          return (
            <tr className={cn(tableRowClass, selected && "bg-acc-tint shadow-[inset_2px_0_0_var(--color-accent)]")} key={product.id}>
              <td className={cn(tableCellClass, "min-w-56")}>
                <button
                  aria-current={selected || undefined}
                  className="block min-h-11 text-left font-medium text-text hover:text-acc-text lg:min-h-0"
                  onClick={() => onSelect(product)}
                  type="button"
                >
                  {product.name}
                </button>
                <div className="text-xs tracking-wide text-ink-2">
                  {product.sku}
                  {product.barcode ? ` · ${product.barcode}` : ""}
                </div>
              </td>
              <td className={cn(tableCellClass, "text-ink-2")}>{product.category?.name ?? "Sin categoría"}</td>
              <td className={cn(tableCellClass, tableNumClass, "text-ink-2")}>{formatCents(cost)}</td>
              <td className={cn(tableCellClass, tableNumClass, "font-medium")}>{formatCents(price)}</td>
              <td className={cn(tableCellClass, tableNumClass, margin != null && margin < LOW_MARGIN_PCT && "text-warn")}>
                {formatMargin(margin)}
              </td>
              <td className={cn(tableCellClass, tableNumClass, outOfStock ? "text-bad" : lowStock && "text-warn")}>
                {stock == null ? "—" : `${formatQuantity(product.stock_qty, product.unit)} ${product.unit.abbreviation}`}
              </td>
              <td className={tableCellClass}>
                <div className="flex flex-wrap gap-1.5">
                  <Badge dot tone={product.is_active ? "success" : "danger"}>
                    {product.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                  {lowStock ? (
                    <Badge tone="warning">
                      <AlertTriangle aria-hidden="true" size={12} />
                      {formatStock(lowStock.quantity)} / mín. {formatStock(lowStock.min_stock)}
                    </Badge>
                  ) : null}
                </div>
              </td>
              <td className={tableCellClass}>
                <div className="flex gap-1">
                  {canEdit ? (
                    <Tooltip content="Editar">
                      <Button aria-label={`Editar ${product.name}`} className="h-11 w-11 px-0" onClick={() => onSelect(product)} variant="secondary">
                        <Edit aria-hidden="true" size={17} />
                      </Button>
                    </Tooltip>
                  ) : null}
                  <Tooltip content="Imprimir etiqueta">
                    <Button aria-label={`Etiqueta ${product.name}`} className="h-11 w-11 px-0" onClick={() => onLabel(product)} variant="secondary">
                      <Printer aria-hidden="true" size={17} />
                    </Button>
                  </Tooltip>
                  {!canDeactivate ? null : product.is_active ? (
                    <Tooltip content="Desactivar">
                      <Button
                        aria-label={`Desactivar ${product.name}`}
                        className="h-11 w-11 px-0 hover:text-bad"
                        onClick={() => onDeactivate(product)}
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </Button>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Reactivar">
                      <Button
                        aria-label={`Reactivar ${product.name}`}
                        className="h-11 w-11 px-0 hover:text-ok"
                        disabled={reactivating}
                        onClick={() => onReactivate(product)}
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
            <td colSpan={8}>
              <EmptyState
                actionLabel={canCreate ? "Nuevo producto" : undefined}
                icon={<Package size={32} />}
                message="Sin productos registrados."
                onAction={canCreate ? onCreate : undefined}
              />
            </td>
          </tr>
        ) : null}
      </tbody>
    </Table>
  );
}
