import { useQuery } from "@tanstack/react-query";
import { BarChart3, CornerDownLeft, ShoppingCart, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiClient } from "../api/client";
import { getLowStock } from "../api/inventory";
import { qk } from "../api/query-keys";
import type { SalesReport } from "../api/reports";
import { fetchDashboardSummary } from "../api/reports";
import { listSales, saleStatusMeta } from "../api/sales";
import { useCan } from "../components/auth/require-permission";
import {
  Badge,
  Button,
  Corners,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonKPI,
  SkeletonTable,
  Table,
  tableCellClass,
  tableHeadClass,
  tableNumClass,
  tableRowClass,
} from "../components/ui";
import { addLocalDays, localISODate } from "../lib/dates";
import { formatCurrency, formatStock } from "../lib/formatters";
import { useAuthStore } from "../stores/auth-store";
import { formatDelta } from "./dashboard/delta";
import { formatSignedCurrency, negativeTone } from "./reports/helpers";
import { Panel } from "./dashboard/panel";
import { ShiftPanel } from "./dashboard/shift-panel";
import { buildWeek, WeeklyChart } from "./dashboard/weekly-chart";

async function fetchWeeklySales() {
  const now = new Date();
  const response = await apiClient.get<SalesReport>("/reports/sales", {
    params: { from: localISODate(addLocalDays(now, -6)), to: localISODate(now) },
  });
  return response.data;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function saleTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

type Kpi = { label: string; value: string; note: string | null; noteClass: string; valueClass?: string };

export function DashboardPage() {
  const can = useCan();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const dashboardQuery = useQuery({
    queryKey: qk.dashboard(),
    queryFn: fetchDashboardSummary,
    refetchInterval: 60_000,
  });

  const lowStockQuery = useQuery({
    queryKey: qk.lowStock(),
    queryFn: () => getLowStock(),
    // Con roles a medida sin inventario:ver, la consulta daría 403 cada minuto (FE-107)
    enabled: can("inventario:ver"),
    refetchInterval: 60_000,
  });

  const salesQuery = useQuery({
    queryKey: qk.dashboardSales(),
    queryFn: () => listSales(1, 5),
    refetchInterval: 60_000,
  });

  const weeklySalesQuery = useQuery({
    queryKey: qk.dashboardWeeklySales(),
    queryFn: fetchWeeklySales,
    refetchInterval: 60_000,
  });

  const data = dashboardQuery.data;
  const lowStockItems = lowStockQuery.data?.items ?? [];
  const recentSales = salesQuery.data?.items ?? [];
  const week = buildWeek(weeklySalesQuery.data?.daily);
  const topProducts = data?.top_products ?? [];
  const topMax = Math.max(...topProducts.map((p) => Number(p.revenue) || 0), 1);
  const today = capitalize(new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }));
  const monthName = capitalize(new Date().toLocaleDateString("es-MX", { month: "long" }));

  const deltaClass = (delta: string | null) => (delta?.startsWith("−") ? "text-bad" : "text-ok");
  const dayDelta = formatDelta(Number(data?.revenue_today ?? 0), Number(data?.revenue_prev_day ?? 0), "percent");
  const ticketsDelta = formatDelta(data?.sales_today ?? 0, data?.sales_prev_day ?? 0, "count");
  const monthDelta = formatDelta(Number(data?.revenue_month ?? 0), Number(data?.revenue_prev_month ?? 0), "percent");
  const lowCount = data?.low_stock_count ?? 0;

  const kpis: Kpi[] = [
    // Neto de devoluciones sin recortar: un día con solo reembolsos sale en negativo y en rojo
    {
      label: "Ventas hoy",
      value: formatSignedCurrency(data?.revenue_today ?? "0"),
      note: dayDelta ? `${dayDelta} vs. ayer` : null,
      noteClass: deltaClass(dayDelta),
      valueClass: negativeTone(data?.revenue_today ?? "0") || undefined,
    },
    { label: "Tickets hoy", value: String(data?.sales_today ?? 0), note: ticketsDelta, noteClass: deltaClass(ticketsDelta) },
    {
      label: "Stock bajo",
      value: String(lowCount),
      note: lowCount > 0 ? (lowCount === 1 ? "1 alerta" : `${lowCount} alertas`) : null,
      noteClass: "text-warn",
      valueClass: lowCount > 0 ? "text-warn" : undefined,
    },
    {
      label: "Ventas del mes",
      value: formatSignedCurrency(data?.revenue_month ?? "0"),
      note: monthDelta ? `${monthDelta} vs. mes anterior` : null,
      noteClass: deltaClass(monthDelta),
      valueClass: negativeTone(data?.revenue_month ?? "0") || undefined,
    },
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        actions={
          <>
            <Button frame icon={<ShoppingCart aria-hidden="true" size={16} />} onClick={() => navigate("/pos")} size="sm">Nueva venta</Button>
            <Button icon={<Truck aria-hidden="true" size={16} />} onClick={() => navigate("/compras")} size="sm" variant="secondary">Nueva compra</Button>
            <Button icon={<CornerDownLeft aria-hidden="true" size={16} />} onClick={() => navigate("/devoluciones")} size="sm" variant="secondary">Devolución</Button>
            <Button icon={<BarChart3 aria-hidden="true" size={16} />} onClick={() => navigate("/reportes")} size="sm" variant="secondary">Reportes</Button>
          </>
        }
        className="mb-0"
        subtitle={`${today} · Resumen operativo`}
        title="Dashboard"
      />

      {/* Turno: datos reales de las sesiones abiertas (H-27) */}
      {data ? <ShiftPanel sessions={data.open_sessions} userId={user?.id} /> : null}

      {dashboardQuery.isError ? (
        <ErrorState message="No se pudo cargar el dashboard." onRetry={() => void dashboardQuery.refetch()} />
      ) : null}

      {dashboardQuery.isLoading ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI />
        </section>
      ) : !dashboardQuery.isError ? (
        <section aria-label="Indicadores" className="blueprint grid grid-cols-2 gap-px bg-divider lg:grid-cols-4">
          <Corners />
          {kpis.map((kpi) => (
            <div className="grid min-w-0 content-start gap-2.5 bg-bg px-4 pb-4 pt-4 sm:px-5" key={kpi.label}>
              <h2 className="truncate font-heading text-sm font-semibold uppercase tracking-wider text-ink-2">{kpi.label}</h2>
              <p className={`truncate font-heading text-3xl font-semibold leading-none tabular-nums lg:text-4xl ${kpi.valueClass ?? "text-text"}`}>{kpi.value}</p>
              <p className={`min-h-5 text-sm ${kpi.noteClass}`}>{kpi.note}</p>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel note="Ventas diarias · últimos 7 días" title="Rendimiento semanal">
          {weeklySalesQuery.isLoading ? (
            <div className="grid h-56 place-items-center text-sm text-ink-2">Cargando gráfica…</div>
          ) : weeklySalesQuery.isError ? (
            <ErrorState message="No se pudo cargar la gráfica semanal." onRetry={() => void weeklySalesQuery.refetch()} />
          ) : (
            <WeeklyChart days={week} />
          )}
        </Panel>

        <Panel link={{ label: "Ver inventario", to: "/inventario" }} title="Stock crítico">
          {lowStockQuery.isError ? (
            <ErrorState message="No se pudo cargar el stock crítico." onRetry={() => void lowStockQuery.refetch()} />
          ) : lowStockItems.length === 0 ? (
            <EmptyState message={can("inventario:ver") ? "Inventario completo y saludable" : "Sin acceso al inventario"} />
          ) : (
            <ul>
              {lowStockItems.slice(0, 5).map((item) => {
                const qty = Number(item.quantity);
                const min = Number(item.min_stock);
                const isCritical = qty <= min * 0.3;
                return (
                  <li className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 sm:px-5" key={item.id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.product_name}</p>
                      <p className="truncate text-xs uppercase tracking-wide text-ink-2">{item.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-heading text-lg font-semibold tabular-nums ${isCritical ? "text-bad" : "text-warn"}`}>
                        {formatStock(qty)} {item.unit_abbreviation}
                      </p>
                      <p className="text-xs text-ink-2">mín. {formatStock(min)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel link={{ label: "Historial completo", to: "/ventas" }} title="Últimas ventas">
          {salesQuery.isLoading ? (
            <div className="p-3"><SkeletonTable cols={4} rows={3} /></div>
          ) : salesQuery.isError ? (
            <ErrorState message="No se pudieron cargar las ventas." onRetry={() => void salesQuery.refetch()} />
          ) : recentSales.length === 0 ? (
            <EmptyState message="Sin transacciones registradas" />
          ) : (
            <div className="p-2 sm:p-3">
              <Table>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Folio</th>
                    <th className={tableHeadClass}>Hora</th>
                    <th className={tableHeadClass}>Cajero</th>
                    <th className={`${tableHeadClass} ${tableNumClass}`}>Total</th>
                    <th className={tableHeadClass}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.slice(0, 5).map((sale) => {
                    const meta = saleStatusMeta(sale.status);
                    return (
                      <tr className={tableRowClass} key={sale.id}>
                        <td className={`${tableCellClass} whitespace-nowrap font-medium tabular-nums text-acc-text`}>{sale.folio}</td>
                        <td className={`${tableCellClass} tabular-nums text-ink-2`}>{saleTime(sale.created_at)}</td>
                        <td className={tableCellClass}>{sale.username}</td>
                        <td className={`${tableCellClass} ${tableNumClass} font-medium`}>{formatCurrency(sale.total)}</td>
                        <td className={tableCellClass}><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Panel>

        <Panel note={monthName} title="Más vendidos">
          {dashboardQuery.isLoading ? (
            <div className="p-3"><SkeletonTable cols={2} rows={3} /></div>
          ) : topProducts.length === 0 ? (
            <EmptyState message="Sin ventas este mes" />
          ) : (
            <ol className="py-1.5">
              {topProducts.map((product, index) => (
                <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2.5 sm:px-5" key={product.name}>
                  <span className="font-heading text-lg font-semibold text-acc-text">{String(index + 1).padStart(2, "0")}</span>
                  <div className="grid min-w-0 gap-1.5">
                    <span className="truncate font-medium">{product.name}</span>
                    <div aria-hidden="true" className="h-1 bg-line-soft">
                      <div className="h-full bg-accent" style={{ width: `${Math.round(((Number(product.revenue) || 0) / topMax) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{formatCurrency(product.revenue)}</p>
                    <p className="text-xs text-ink-2">{formatStock(product.quantity)} {Number(product.quantity) === 1 ? "ud" : "uds"}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
