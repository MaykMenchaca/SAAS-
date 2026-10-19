import type { FormEvent } from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileDown, FileUp, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { invalidateInventory } from "../api/invalidate";
import type { StockItem } from "../api/inventory";
import { exportInventoryExcel, getInventorySummary, listStock } from "../api/inventory";
import { qk } from "../api/query-keys";
import { fetchInventoryValuation } from "../api/reports";
import { useCan } from "../components/auth/require-permission";
import { Button, ErrorState, FilterChip, Input, PageHeader, Pagination, SkeletonKPI, SkeletonTable } from "../components/ui";
import { formatCurrency } from "../lib/formatters";
import { ExcelImportModal } from "./inventory/excel-import-modal";
import { InventoryTabs } from "./inventory/inventory-tabs";
import { isBelowMin } from "./inventory/stock-level";
import { StockKpis } from "./inventory/stock-kpis";
import { StockPanel } from "./inventory/stock-panel";
import { StockTable } from "./inventory/stock-table";

type StockFilter = "all" | "low" | "normal";

export function InventoryPage() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

  const canAdjust = can("inventario:ajustar");
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const stockQuery = useQuery({
    queryKey: qk.stock(page, search),
    queryFn: () => listStock({ page, search }),
  });

  // Indicadores: conteos exactos del servidor (RF-23; antes salían de las primeras 100 filas de low-stock)
  // y valor a costo (valuación)
  const summaryQuery = useQuery({
    queryKey: qk.inventorySummary(),
    queryFn: getInventorySummary,
  });
  const valuationQuery = useQuery({
    queryKey: qk.reportInventoryValuation(),
    queryFn: fetchInventoryValuation,
    enabled: can("reportes:ver"),
  });

  const stocks = stockQuery.data?.items ?? [];
  const totalPages = stockQuery.data?.pages ?? 1;

  const filteredStocks = stocks.filter((item) => {
    if (stockFilter === "all") return true;
    const below = isBelowMin(Number(item.quantity), Number(item.min_stock));
    return stockFilter === "low" ? below : !below;
  });

  // Si el producto elegido está en la lista actual, se usa el dato fresco (tras ajustar)
  const panelItem = selected ? stocks.find((item) => item.id === selected.id) ?? selected : null;

  const summary = summaryQuery.data;
  const kpis = [
    { label: "Productos", value: summary ? String(summary.total_products) : "—" },
    { label: "Bajo mínimo", tone: "warn" as const, value: summary ? String(summary.below_min) : "—" },
    { label: "Agotados", tone: "bad" as const, value: summary ? String(summary.out_of_stock) : "—" },
    {
      label: "Valor a costo",
      value: valuationQuery.data ? formatCurrency(valuationQuery.data.total_valuation) : "—",
    },
  ];

  async function handleExport() {
    setExporting(true);
    try {
      await exportInventoryExcel();
    } catch {
      toast.error("No se pudo exportar el inventario.");
    } finally {
      setExporting(false);
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Inventario"
        subtitle="Existencias, ajustes y conteos físicos"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={exporting}
              icon={<FileDown aria-hidden="true" size={18} />}
              onClick={() => void handleExport()}
              variant="secondary"
            >
              {exporting ? "Exportando…" : "Exportar a Excel"}
            </Button>
            {canAdjust ? (
              <>
                <Button icon={<FileUp aria-hidden="true" size={18} />} onClick={() => setImportOpen(true)} variant="secondary">
                  Importar desde Excel
                </Button>
                <Link to="/inventario/conteo">
                  <Button frame icon={<ClipboardList aria-hidden="true" size={18} />}>
                    Conteo físico
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        }
      />
      {importOpen ? <ExcelImportModal onClose={() => setImportOpen(false)} /> : null}

      <InventoryTabs active="existencias" />

      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SkeletonKPI />
          <SkeletonKPI />
          <SkeletonKPI />
          <SkeletonKPI />
        </div>
      ) : (
        <StockKpis items={kpis} />
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div aria-label="Filtrar por nivel de stock" className="flex flex-wrap gap-2" role="group">
          <FilterChip active={stockFilter === "all"} label="Todo" onClick={() => setStockFilter("all")} />
          <FilterChip active={stockFilter === "low"} label="Bajo mínimo" onClick={() => setStockFilter("low")} />
          <FilterChip active={stockFilter === "normal"} label="Normal" onClick={() => setStockFilter("normal")} />
        </div>
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={handleSearch}>
          <div className="min-w-0 sm:w-80 sm:max-w-full">
            <Input
              icon={<Search aria-hidden="true" size={16} />}
              label="Buscar"
              name="search"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre, SKU o código"
              value={searchInput}
            />
          </div>
          <Button className="w-full sm:w-auto" type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          {stockQuery.isLoading ? (
            <SkeletonTable cols={5} rows={8} />
          ) : stockQuery.isError ? (
            <ErrorState onRetry={() => void stockQuery.refetch()} />
          ) : (
            <StockTable canAdjust={canAdjust} items={filteredStocks} onSelect={setSelected} selectedId={panelItem?.id ?? null} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
            <span>
              Página {stockQuery.data?.page ?? page} de {totalPages}
            </span>
            <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
          </div>
        </div>

        <div className="min-w-0 xl:sticky xl:top-5">
          {panelItem ? (
            <StockPanel
              canAdjust={canAdjust}
              item={panelItem}
              key={panelItem.id}
              onAdjusted={() => invalidateInventory(queryClient)}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="border border-divider p-6 text-sm text-ink-2">
              Elige un producto de la tabla para ver sus movimientos{canAdjust ? " y ajustar su stock" : ""}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
