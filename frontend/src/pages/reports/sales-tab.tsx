import { useQuery } from "@tanstack/react-query";

import { fetchSalesReport } from "../../api/reports";
import { qk } from "../../api/query-keys";
import { EmptyState, ErrorState, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { csvFilename, downloadCsv } from "./csv";
import { DailyChart } from "./daily-chart";
import { averageTicket, fillMissingDays, formatSignedCurrency, negativeTone, parseLocalDate } from "./helpers";
import { KpiStrip } from "./kpi-strip";
import { ExportButton, ReportPanel } from "./panel";
import { PaymentMethods } from "./payment-methods";

export function SalesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const query = useQuery({
    queryKey: qk.reportSales(dateFrom, dateTo),
    queryFn: () => fetchSalesReport(dateFrom, dateTo),
  });

  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const data = query.data;
  const isLoading = query.isLoading;
  const daily = data?.daily ?? [];
  const maxDay = Math.max(0, ...daily.map((d) => Number(d.revenue)));

  const kpis = [
    { label: "Ventas totales", value: String(data?.total_sales ?? 0) },
    { label: "Ingreso total", value: formatSignedCurrency(data?.total_revenue ?? "0") },
    { label: "Ticket promedio", value: formatCurrency(averageTicket(data?.total_revenue ?? 0, data?.total_sales ?? 0)) },
    { label: "Canceladas", tone: (data?.cancelled_sales ?? 0) > 0 ? ("bad" as const) : undefined, value: String(data?.cancelled_sales ?? 0) },
  ];

  function exportCsv() {
    downloadCsv(
      csvFilename("ventas", dateFrom, dateTo),
      ["Fecha", "Ventas", "Ingreso"],
      daily.map((d) => [d.date, d.count, d.revenue]),
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <ExportButton disabled={isLoading || daily.length === 0} onClick={exportCsv} />
      </div>
      <KpiStrip isLoading={isLoading} kpis={kpis} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ReportPanel aside={daily.length > 0 ? <span className="text-sm text-ink-2">Máximo {formatCurrency(maxDay)}</span> : undefined} title="Ingreso diario">
          {isLoading ? (
            <div className="p-4"><SkeletonTable cols={3} rows={5} /></div>
          ) : daily.length === 0 ? (
            <EmptyState message="Sin datos en el periodo." />
          ) : (
            <DailyChart data={fillMissingDays(daily, dateFrom, dateTo)} />
          )}
        </ReportPanel>

        <ReportPanel title="Ventas por día">
          {isLoading ? (
            <div className="p-4"><SkeletonTable cols={3} rows={6} /></div>
          ) : daily.length === 0 ? (
            <EmptyState message="Sin datos en el periodo." />
          ) : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <caption className="sr-only">Tabla de ventas diarias</caption>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Fecha</th>
                    <th className={`${tableHeadClass} ${tableNumClass}`}>Ventas</th>
                    <th className={`${tableHeadClass} ${tableNumClass}`}>Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map((day) => (
                    <tr className={tableRowClass} key={day.date}>
                      <td className={tableCellClass}>
                        {parseLocalDate(day.date).toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" })}
                      </td>
                      <td className={`${tableCellClass} ${tableNumClass}`}>{day.count}</td>
                      <td className={`${tableCellClass} ${tableNumClass} font-medium ${negativeTone(day.revenue)}`}>{formatSignedCurrency(day.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </ReportPanel>
      </div>

      <PaymentMethods data={data?.payment_methods ?? []} isLoading={isLoading} />
    </div>
  );
}
