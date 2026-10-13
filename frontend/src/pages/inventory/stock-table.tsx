import { Boxes, Package } from "lucide-react";

import type { StockItem } from "../../api/inventory";
import { Badge, Button, EmptyState, Table, Tooltip, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatStock } from "../../lib/formatters";
import { levelBar, stockLevel } from "./stock-level";

const LEVEL_UI = {
  agotado: { badge: "danger", label: "Agotado", text: "text-bad", bar: "bg-bad" },
  bajo: { badge: "warning", label: "Stock bajo", text: "text-warn", bar: "bg-warn" },
  normal: { badge: "success", label: "Normal", text: "text-text", bar: "bg-accent" },
} as const;

type StockTableProps = {
  canAdjust: boolean;
  items: StockItem[];
  onSelect: (item: StockItem) => void;
  selectedId: number | null;
};

/** Tabla de existencias con barra de nivel (mínimo y máximo) y estado. */
export function StockTable({ canAdjust, items, onSelect, selectedId }: StockTableProps) {
  return (
    <Table>
      <caption className="sr-only">Tabla de inventario</caption>
      <thead>
        <tr>
          <th className={tableHeadClass}>Producto</th>
          <th className={cn(tableHeadClass, tableNumClass)}>Stock</th>
          <th className={cn(tableHeadClass, "min-w-40")}>Nivel (mín / máx)</th>
          <th className={tableHeadClass}>Estado</th>
          <th className={tableHeadClass}>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const qty = Number(item.quantity);
          const min = Number(item.min_stock);
          const max = Number(item.max_stock);
          const level = stockLevel(qty, min);
          const ui = LEVEL_UI[level];
          const bar = levelBar(qty, min, max);
          const selected = item.id === selectedId;

          return (
            <tr className={cn(tableRowClass, selected && "bg-acc-tint shadow-[inset_2px_0_0_var(--color-accent)]")} key={item.id}>
              <td className={cn(tableCellClass, "min-w-48")}>
                <button
                  aria-current={selected || undefined}
                  className="block min-h-11 text-left font-medium text-text hover:text-acc-text lg:min-h-0"
                  onClick={() => onSelect(item)}
                  type="button"
                >
                  {item.product_name}
                </button>
                <div className="text-xs tracking-wide text-ink-2">{item.sku}</div>
              </td>
              <td className={cn(tableCellClass, tableNumClass, "whitespace-nowrap font-heading text-lg font-semibold", ui.text)}>
                {formatStock(item.quantity)} {item.unit_abbreviation}
              </td>
              <td className={tableCellClass}>
                <div aria-label={`Nivel de ${item.product_name}`} className="relative h-2 bg-line-soft" role="img">
                  <div className={cn("absolute inset-y-0 left-0", ui.bar)} style={{ width: `${bar.fill}%` }} />
                  {bar.minMark != null ? (
                    <div className="absolute -inset-y-0.5 w-px bg-text" style={{ left: `${bar.minMark}%` }} />
                  ) : null}
                </div>
                <div className="mt-1 flex justify-between gap-2 text-xs tabular-nums text-ink-2">
                  <span>mín {formatStock(item.min_stock)}</span>
                  <span>máx {Number(item.max_stock) > 0 ? formatStock(item.max_stock) : "—"}</span>
                </div>
              </td>
              <td className={tableCellClass}>
                <Badge dot tone={ui.badge}>
                  {ui.label}
                </Badge>
              </td>
              <td className={tableCellClass}>
                {canAdjust ? (
                  <Tooltip content="Ajustar stock">
                    <Button
                      aria-label={`Ajustar stock de ${item.product_name}`}
                      className="h-11 w-11 px-0"
                      onClick={() => onSelect(item)}
                      variant="secondary"
                    >
                      <Package aria-hidden="true" size={17} />
                    </Button>
                  </Tooltip>
                ) : null}
              </td>
            </tr>
          );
        })}

        {items.length === 0 ? (
          <tr>
            <td colSpan={5}>
              <EmptyState actionHref="/productos" actionLabel="Ir a Productos" icon={<Boxes size={32} />} message="Sin productos en inventario." />
            </td>
          </tr>
        ) : null}
      </tbody>
    </Table>
  );
}
