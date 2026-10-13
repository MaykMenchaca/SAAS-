import type { FormEvent } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ReceiptText, Search } from "lucide-react";
import { toast } from "sonner";

import type { SaleListItem } from "../api/sales";
import { listAllSales, listSaleCashiers, listSales, saleStatusMeta } from "../api/sales";
import { qk } from "../api/query-keys";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Segmented, Select, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../components/ui";
import { cn } from "../lib/cn";
import { formatCurrency } from "../lib/formatters";
import { localISODate } from "../lib/dates";
import { downloadTextFile, methodsLabel, salesToCsv } from "./sales-history/csv";
import type { FilterState, RangeKey, StatusKey } from "./sales-history/filters";
import { INITIAL_FILTERS, RANGE_OPTIONS, STATUS_OPTIONS, rangeError, toApiFilters } from "./sales-history/filters";
import { SaleDetail } from "./sales-history/sale-detail";

// ── Página ─────────────────────────────────────────────────────────

export function SalesHistoryPage() {
  const [page, setPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [folioDraft, setFolioDraft] = useState("");
  const [exporting, setExporting] = useState(false);

  const apiFilters = toApiFilters(filters);
  const dateError = rangeError(filters);

  const salesQuery = useQuery({
    queryKey: qk.salesHistory(page, filters.range, filters.status, filters.userId, filters.folio, apiFilters.dateFrom, apiFilters.dateTo),
    queryFn: () => listSales(page, 20, apiFilters),
    enabled: !dateError,
  });
  const cashiersQuery = useQuery({ queryKey: qk.salesHistory("cajeros"), queryFn: listSaleCashiers, staleTime: 60_000 });

  const sales = salesQuery.data?.items ?? [];
  const totalPages = salesQuery.data?.pages ?? 1;
  const total = salesQuery.data?.total ?? 0;

  function change(next: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }

  function submitFolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    change({ folio: folioDraft });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await listAllSales(apiFilters);
      downloadTextFile(`ventas-${localISODate()}.csv`, salesToCsv(all));
      toast.success(`Se exportaron ${all.length} ${all.length === 1 ? "venta" : "ventas"}.`);
    } catch {
      toast.error("No se pudo exportar el historial. Intenta de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          <Button disabled={exporting || Boolean(dateError)} icon={<Download aria-hidden="true" size={16} />} onClick={() => void exportCsv()} variant="secondary">
            {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        }
        className="mb-0"
        subtitle={salesQuery.data ? `${total} ${total === 1 ? "venta" : "ventas"} · transacciones registradas y reimpresión de tickets` : "Transacciones registradas y reimpresión de tickets"}
        title="Historial de ventas"
      />

      <div className="flex flex-wrap items-end gap-3">
        <Segmented<RangeKey>
          aria-label="Periodo"
          onChange={(range) => change({ range })}
          options={RANGE_OPTIONS}
          size="sm"
          value={filters.range}
        />
        <Segmented<StatusKey>
          aria-label="Estado"
          onChange={(status) => change({ status })}
          options={STATUS_OPTIONS}
          size="sm"
          value={filters.status}
        />
        <div className="w-48">
          <Select
            aria-label="Cajero"
            name="cajero"
            onChange={(e) => change({ userId: e.target.value ? Number(e.target.value) : null })}
            options={[{ label: "Todos los cajeros", value: "" }, ...(cashiersQuery.data ?? []).map((c) => ({ label: c.username, value: c.id }))]}
            value={filters.userId ?? ""}
          />
        </div>
        <form className="flex items-end gap-2" onSubmit={submitFolio}>
          <div className="w-56">
            <Input
              icon={<Search aria-hidden="true" size={16} />}
              label="Folio"
              name="folio"
              onChange={(e) => setFolioDraft(e.target.value)}
              placeholder="V-20261011-0001"
              value={folioDraft}
            />
          </div>
          <Button type="submit" variant="secondary">Buscar</Button>
          {filters.folio ? (
            <Button onClick={() => { setFolioDraft(""); change({ folio: "" }); }} variant="ghost">Quitar</Button>
          ) : null}
        </form>
      </div>

      {filters.range === "rango" ? (
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-44">
            <Input label="Desde" name="desde" onChange={(e) => change({ from: e.target.value })} type="date" value={filters.from} />
          </div>
          <div className="w-44">
            <Input label="Hasta" name="hasta" onChange={(e) => change({ to: e.target.value })} type="date" value={filters.to} />
          </div>
          {dateError ? (
            <p className="self-end pb-2.5 text-sm font-medium text-bad" role="alert">{dateError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <section className="grid min-w-0 flex-1 basis-[34rem] gap-3">
          {salesQuery.isLoading ? (
            <SkeletonTable cols={7} rows={8} />
          ) : salesQuery.isError ? (
            <ErrorState onRetry={() => void salesQuery.refetch()} />
          ) : sales.length === 0 ? (
            <Card>
              <EmptyState
                actionHref={filters === INITIAL_FILTERS ? "/pos" : undefined}
                actionLabel={filters === INITIAL_FILTERS ? "Ir al POS" : undefined}
                icon={<ReceiptText size={32} />}
                message={filters === INITIAL_FILTERS ? "Sin ventas registradas." : "Sin ventas con estos filtros."}
              />
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden" frame>
                <Table>
                  <caption className="sr-only">Tabla de ventas</caption>
                  <thead>
                    <tr>
                      <th className={tableHeadClass}>Folio</th>
                      <th className={tableHeadClass}>Fecha</th>
                      <th className={tableHeadClass}>Cajero</th>
                      <th className={`${tableHeadClass} ${tableNumClass}`}>Art.</th>
                      <th className={tableHeadClass}>Método</th>
                      <th className={`${tableHeadClass} ${tableNumClass}`}>Total</th>
                      <th className={tableHeadClass}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale: SaleListItem) => {
                      const meta = saleStatusMeta(sale.status);
                      const active = sale.id === selectedSaleId;
                      return (
                        <tr
                          aria-selected={active}
                          className={cn(tableRowClass, "cursor-pointer", active && "bg-acc-tint shadow-[inset_2px_0_0_var(--color-accent)]")}
                          key={sale.id}
                          onClick={() => setSelectedSaleId(sale.id)}
                        >
                          <td className={tableCellClass}>
                            <button
                              aria-label={`Ver venta ${sale.folio}`}
                              className="min-h-11 whitespace-nowrap font-medium tabular-nums text-acc-text lg:min-h-0"
                              onClick={(e) => { e.stopPropagation(); setSelectedSaleId(sale.id); }}
                              type="button"
                            >
                              {sale.folio}
                            </button>
                          </td>
                          <td className={`${tableCellClass} whitespace-nowrap text-ink-2`}>
                            {new Date(sale.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className={tableCellClass}>{sale.username}</td>
                          <td className={`${tableCellClass} ${tableNumClass}`}>{sale.items_count == null ? "—" : parseFloat(sale.items_count)}</td>
                          <td className={`${tableCellClass} text-ink-2`}>{methodsLabel(sale.payment_methods) || "—"}</td>
                          <td className={`${tableCellClass} ${tableNumClass} font-medium ${sale.status === "cancelada" ? "line-through" : ""}`}>
                            {formatCurrency(sale.total)}
                          </td>
                          <td className={tableCellClass}>
                            <Badge dot tone={meta.tone}>{meta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
                <span>Página {salesQuery.data?.page ?? page} de {totalPages}</span>
                <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
              </div>
            </>
          )}
        </section>

        <aside aria-label="Detalle de la venta" className="flex-1 basis-80 lg:sticky lg:top-5 lg:max-w-md">
          {selectedSaleId !== null ? (
            <SaleDetail key={selectedSaleId} saleId={selectedSaleId} />
          ) : (
            <Card className="p-6 text-center text-ink-2">Selecciona una venta para ver su ticket.</Card>
          )}
        </aside>
      </div>
    </div>
  );
}
