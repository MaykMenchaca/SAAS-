import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";

import { fetchGrossMargin } from "../../api/reports";
import { qk } from "../../api/query-keys";
import { Badge, EmptyState, ErrorState, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { csvFilename, downloadCsv, safeText } from "./csv";
import { KpiStrip } from "./kpi-strip";
import { ExportButton, ReportPanel } from "./panel";

export function MarginTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const query = useQuery({
    queryKey: qk.reportGrossMargin(dateFrom, dateTo),
    queryFn: () => fetchGrossMargin(dateFrom, dateTo),
  });

  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const data = query.data;
  const items = data?.items ?? [];
  const summary = data?.summary;

  function exportCsv() {
    downloadCsv(
      csvFilename("margen_bruto", dateFrom, dateTo),
      ["SKU", "Producto", "Cantidad", "Ingreso", "Costo", "Margen", "Margen %"],
      items.map((item) => [
        safeText(item.product_sku),
        safeText(item.product_name),
        item.total_quantity,
        item.total_revenue,
        item.total_cost,
        item.gross_margin,
        item.margin_percent,
      ]),
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
          { label: "Ingreso total", value: formatCurrency(summary?.total_revenue ?? "0") },
          { label: "Costo total", value: formatCurrency(summary?.total_cost ?? "0") },
          { label: "Margen bruto", tone: "ok", value: formatCurrency(summary?.gross_margin ?? "0") },
          { label: "% Margen", value: `${summary?.margin_percent ?? "0"}%` },
        ]}
      />

      <ReportPanel
        aside={
          <span className="text-sm text-ink-2">
            Margen total{" "}
            <span className="font-heading text-2xl font-semibold tabular-nums text-text">{summary?.margin_percent ?? "0"}%</span>
          </span>
        }
        title="Margen bruto por producto"
      >
        {query.isLoading ? (
          <div className="p-4"><SkeletonTable cols={6} rows={6} /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<CircleDollarSign size={32} />} message="Sin ventas en el periodo." />
        ) : (
          <Table>
            <caption className="sr-only">Tabla de margen bruto por producto</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Cant.</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Ingreso</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Costo</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Margen</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>%</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const pct = Number(item.margin_percent);
                return (
                  <tr className={tableRowClass} key={item.product_id}>
                    <td className={tableCellClass}>
                      <div className="font-medium">{item.product_name}</div>
                      <div className="font-mono text-xs text-ink-2">{item.product_sku}</div>
                    </td>
                    <td className={`${tableCellClass} ${tableNumClass}`}>{item.total_quantity}</td>
                    <td className={`${tableCellClass} ${tableNumClass}`}>{formatCurrency(item.total_revenue)}</td>
                    <td className={`${tableCellClass} ${tableNumClass} text-ink-2`}>{formatCurrency(item.total_cost)}</td>
                    <td className={`${tableCellClass} ${tableNumClass} font-medium`}>{formatCurrency(item.gross_margin)}</td>
                    <td className={`${tableCellClass} ${tableNumClass}`}>
                      <Badge tone={pct >= 30 ? "success" : pct >= 15 ? "warning" : "danger"}>{item.margin_percent}%</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </ReportPanel>
    </div>
  );
}
