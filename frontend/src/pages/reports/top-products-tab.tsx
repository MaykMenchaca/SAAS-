import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

import { fetchTopProducts } from "../../api/reports";
import { qk } from "../../api/query-keys";
import { EmptyState, ErrorState, Segmented, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { csvFilename, downloadCsv, safeText } from "./csv";
import { shares } from "./helpers";
import { ExportButton, ReportPanel } from "./panel";

type SortBy = "quantity" | "revenue";

export function TopProductsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sortBy, setSortBy] = useState<SortBy>("revenue");

  const query = useQuery({
    queryKey: qk.reportTopProducts(dateFrom, dateTo, sortBy),
    queryFn: () => fetchTopProducts({ from: dateFrom, to: dateTo, sort: sortBy, limit: 20 }),
  });

  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const items = query.data?.items ?? [];
  // Participación: parte de cada producto sobre el total de los productos listados, según el orden elegido.
  const participation = shares(items.map((item) => Number(sortBy === "revenue" ? item.total_revenue : item.total_quantity)));

  function exportCsv() {
    downloadCsv(
      csvFilename("top_productos", dateFrom, dateTo),
      ["#", "SKU", "Producto", "Cantidad", "Ventas", "Ingreso", "Participación %"],
      items.map((item, i) => [
        i + 1,
        safeText(item.product_sku),
        safeText(item.product_name),
        item.total_quantity,
        item.sale_count,
        item.total_revenue,
        participation[i].toFixed(1),
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Ordenar por"
          onChange={setSortBy}
          options={[
            { label: "Por ingreso", value: "revenue" },
            { label: "Por cantidad", value: "quantity" },
          ]}
          value={sortBy}
        />
        <ExportButton disabled={query.isLoading || items.length === 0} onClick={exportCsv} />
      </div>

      <ReportPanel>
        {query.isLoading ? (
          <div className="p-4"><SkeletonTable cols={6} rows={6} /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<TrendingUp size={32} />} message="Sin datos en el periodo." />
        ) : (
          <Table>
            <caption className="sr-only">Tabla de productos más vendidos</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>#</th>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Cantidad</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Ventas</th>
                <th className={`${tableHeadClass} min-w-40`}>Participación</th>
                <th className={`${tableHeadClass} ${tableNumClass}`}>Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr className={tableRowClass} key={item.product_id}>
                  <td className={`${tableCellClass} font-heading text-base font-semibold text-acc-text`}>{index + 1}</td>
                  <td className={tableCellClass}>
                    <div className="font-medium">{item.product_name}</div>
                    <div className="font-mono text-xs text-ink-2">{item.product_sku}</div>
                  </td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{item.total_quantity}</td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{item.sale_count}</td>
                  <td className={tableCellClass}>
                    <div className="flex items-center gap-2">
                      <div
                        aria-hidden="true"
                        className="h-1.5 flex-1 bg-line-soft"
                      >
                        <div className="h-full bg-accent" style={{ width: `${participation[index].toFixed(1)}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-ink-2">{participation[index].toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className={`${tableCellClass} ${tableNumClass} font-medium`}>{formatCurrency(item.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ReportPanel>
    </div>
  );
}
