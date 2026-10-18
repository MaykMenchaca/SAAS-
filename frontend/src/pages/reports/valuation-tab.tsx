import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";

import { fetchInventoryValuation } from "../../api/reports";
import { qk } from "../../api/query-keys";
import { EmptyState, ErrorState, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { csvFilename, downloadCsv, safeText } from "./csv";
import { KpiStrip } from "./kpi-strip";
import { ExportButton, ReportPanel } from "./panel";

/** La valuación es al día de hoy: no depende del rango Desde/Hasta. */
export function ValuationTab() {
  const query = useQuery({
    queryKey: qk.reportInventoryValuation(),
    queryFn: fetchInventoryValuation,
  });

  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const data = query.data;
  const items = data?.items ?? [];

  function exportCsv() {
    downloadCsv(
      csvFilename("valuacion_inventario"),
      ["SKU", "Producto", "Stock", "Costo promedio", "Valuación"],
      items.map((item) => [safeText(item.sku), safeText(item.name), item.quantity, item.avg_cost, item.valuation]),
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <ExportButton disabled={query.isLoading || items.length === 0} onClick={exportCsv} />
      </div>
      <KpiStrip
        isLoading={query.isLoading}
        kpis={[
          { label: "Valor total del inventario", value: formatCurrency(data?.total_valuation ?? "0") },
          { label: "Unidades en stock", value: data?.total_units ?? "0" },
          { label: "Productos activos", value: String(data?.product_count ?? 0) },
        ]}
      />

      <ReportPanel
        aside={<span className="font-heading text-2xl font-semibold tabular-nums">{formatCurrency(data?.total_valuation ?? "0")}</span>}
        title="Valuación de inventario a costo promedio"
      >
        {query.isLoading ? (
          <div className="p-4"><SkeletonTable cols={5} rows={6} /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Package size={32} />} message="Sin productos en inventario." />
        ) : (
          <Table>
            <caption className="sr-only">Tabla de valuación de inventario</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>SKU</th>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Stock</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Costo prom.</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Valuación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className={tableRowClass} key={item.product_id}>
                  <td className={`${tableCellClass} font-mono text-xs text-ink-2`}>{item.sku}</td>
                  <td className={`${tableCellClass} font-medium`}>{item.name}</td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{item.quantity}</td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{formatCurrency(item.avg_cost)}</td>
                  <td className={`${tableCellClass} ${tableNumClass} font-medium`}>{formatCurrency(item.valuation)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ReportPanel>
    </div>
  );
}
