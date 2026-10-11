import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Calculator, CircleDollarSign, CornerDownLeft, ReceiptText, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";
import { getLowStock } from "../api/inventory";
import type { OpenSessionSummary } from "../api/reports";
import { fetchDashboardSummary } from "../api/reports";
import { listSales } from "../api/sales";
import { Badge, Button, Card, ErrorState, PageHeader, SkeletonKPI, SkeletonTable } from "../components/ui";
import { addLocalDays, localISODate } from "../lib/dates";
import { formatCurrency, formatStock } from "../lib/formatters";
import { useAuthStore } from "../stores/auth-store";
import { qk } from "../api/query-keys";

async function fetchWeeklySales() {
  const now = new Date();
  const fromStr = localISODate(addLocalDays(now, -6));
  const toStr = localISODate(now);

  const response = await apiClient.get<any>("/reports/sales", {
    params: { from: fromStr, to: toStr },
  });
  return response.data;
}

function rankingClass(index: number): string {
  if (index === 0) return "bg-warning/15 text-warning border-warning/20";
  if (index === 1) return "bg-neutral-border/60 text-neutral-text-secondary border-neutral-border";
  if (index === 2) return "bg-warning/10 text-warning/70 border-warning/10";
  return "bg-primary/10 text-primary-text border-primary/20";
}

/** Variación contra el periodo anterior; null si no hay base de comparación (H-27). */
function formatDelta(current: number, previous: number, kind: "percent" | "count"): string | null {
  if (!previous) return null;
  const diff = current - previous;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  if (kind === "count") return `${sign}${Math.abs(diff)} vs ayer`;
  return `${sign}${Math.abs((diff / previous) * 100).toFixed(1)}%`;
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const dashboardQuery = useQuery({
    queryKey: qk.dashboard(),
    queryFn: fetchDashboardSummary,
    refetchInterval: 60_000,
  });

  const lowStockQuery = useQuery({
    queryKey: qk.lowStock(),
    queryFn: getLowStock,
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
  const lowStockItems = lowStockQuery.data ?? [];
  const recentSales = salesQuery.data?.items ?? [];

  // Generate last 7 days list
  const today = new Date();
  const last7Days = Array.from({ length: 7 }).map((_, i) => addLocalDays(today, i - 6));

  const dailyReportData = weeklySalesQuery.data?.daily ?? [];

  const chartData = last7Days.map((dateObj) => {
    const dateStr = localISODate(dateObj);
    const match = dailyReportData.find((d: any) => d.date === dateStr);
    const dayLabel = dateObj.toLocaleDateString("es-MX", { weekday: "short" }).toUpperCase().replace(".", "");
    return {
      label: dayLabel,
      value: match ? parseFloat(match.revenue) || 0 : 0,
      date: dateStr,
    };
  });

  const chartTotal = chartData.reduce((sum, d) => sum + d.value, 0);
  const maxChartVal = Math.max(...chartData.map((d) => d.value), 1);

  const kpis = [
    {
      icon: CircleDollarSign,
      label: "Ventas hoy",
      tone: "success" as const,
      value: formatCurrency(data?.revenue_today ?? "0"),
      delta: formatDelta(Number(data?.revenue_today ?? 0), Number(data?.revenue_prev_day ?? 0), "percent"),
    },
    {
      icon: ReceiptText,
      label: "Tickets hoy",
      tone: "neutral" as const,
      value: String(data?.sales_today ?? 0),
      delta: formatDelta(data?.sales_today ?? 0, data?.sales_prev_day ?? 0, "count"),
    },
    {
      icon: AlertTriangle,
      label: "Stock bajo",
      tone: "warning" as const,
      value: String(data?.low_stock_count ?? 0),
      delta: (data?.low_stock_count ?? 0) > 0 ? "alertas" : null,
    },
    {
      icon: TrendingUp,
      label: "Ventas mes",
      tone: "neutral" as const,
      value: formatCurrency(data?.revenue_month ?? "0"),
      delta: formatDelta(Number(data?.revenue_month ?? 0), Number(data?.revenue_prev_month ?? 0), "percent"),
    },
  ];

  // maxChartVal already computed dynamically above

  return (
    <div className="grid gap-5">
      {/* Page Title */}
      <PageHeader title="Dashboard" subtitle="Resumen operativo del negocio" />

      {/* Turno: datos reales de las sesiones abiertas (H-27) */}
      {data ? <ShiftBanner sessions={data.open_sessions} userId={user?.id} /> : null}

      {/* Quick Access Shortcuts row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Link
          to="/pos"
          className="flex items-center justify-center gap-2 h-11 rounded-lg bg-primary font-bold text-xs text-on-primary hover:bg-primary-hover shadow-sm transition-colors duration-150 ease-[var(--ease-out-strong)]"
        >
          <ShoppingCart size={15} /> Nueva Venta
        </Link>
        <Link
          to="/compras"
          className="flex items-center justify-center gap-2 h-11 rounded-lg border border-neutral-border bg-neutral-surface font-semibold text-xs text-neutral-text-primary hover:border-primary hover:text-primary-text transition-colors duration-150 ease-[var(--ease-out-strong)]"
        >
          <Truck size={15} /> Nueva Compra
        </Link>
        <Link
          to="/devoluciones"
          className="flex items-center justify-center gap-2 h-11 rounded-lg border border-neutral-border bg-neutral-surface font-semibold text-xs text-neutral-text-primary hover:border-primary hover:text-primary-text transition-colors duration-150 ease-[var(--ease-out-strong)]"
        >
          <CornerDownLeft size={15} /> Devolución
        </Link>
        <Link
          to="/reportes"
          className="flex items-center justify-center gap-2 h-11 rounded-lg border border-neutral-border bg-neutral-surface font-semibold text-xs text-neutral-text-primary hover:border-primary hover:text-primary-text transition-colors duration-150 ease-[var(--ease-out-strong)]"
        >
          <BarChart3 size={15} /> Ver Reportes
        </Link>
        <Link
          to="/corte-caja"
          className="flex items-center justify-center gap-2 h-11 rounded-lg border border-neutral-border bg-neutral-surface font-semibold text-xs text-neutral-text-primary hover:border-primary hover:text-primary-text transition-colors duration-150 ease-[var(--ease-out-strong)] col-span-2 sm:col-span-1"
        >
          <Calculator size={15} /> Corte de Caja
        </Link>
      </div>

      {/* Error state */}
      {dashboardQuery.isError ? (
        <ErrorState message="No se pudo cargar el dashboard." onRetry={() => void dashboardQuery.refetch()} />
      ) : null}

      {/* KPI cards display */}
      {dashboardQuery.isLoading ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI />
        </section>
      ) : !dashboardQuery.isError ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            const toneClasses = {
              success: "bg-success/10 text-success border-success/30",
              neutral: "bg-primary/10 text-primary-text border-primary/20",
              warning: "bg-warning/10 text-warning border-warning/30",
            }[kpi.tone];

            return (
              <Card className="p-4 flex flex-col justify-between min-h-[115px]" key={kpi.label}>
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded border ${toneClasses}`}>
                    <Icon aria-hidden="true" size={16} />
                  </div>
                  {kpi.delta ? (
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        kpi.delta.startsWith("−")
                          ? "bg-danger/10 text-danger"
                          : kpi.tone === "warning"
                            ? "bg-warning/10 text-warning"
                            : "bg-success/10 text-success"
                      }`}
                    >
                      {kpi.delta}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-text-secondary">{kpi.label}</span>
                  <span className="font-mono text-2xl font-bold tracking-tight text-neutral-text-primary lg:text-3xl">{kpi.value}</span>
                </div>
              </Card>
            );
          })}
        </section>
      ) : null}

      {/* Main split sections grid */}
      <section className="grid gap-4 lg:grid-cols-[1fr_320px] min-w-0">
        {/* Weekly sales Bar Chart */}
        <Card className="p-4 flex flex-col justify-between min-w-0 overflow-hidden">
          <div>
            <h2 className="text-xs font-bold uppercase text-neutral-text-secondary tracking-widest">Rendimiento Semanal</h2>
            <p className="text-xs text-neutral-text-muted mt-0.5">Ventas diarias — Últimos 7 días</p>
          </div>

          {weeklySalesQuery.isLoading ? (
            <div className="h-32 flex items-center justify-center text-xs text-neutral-text-secondary animate-pulse">Cargando gráfico...</div>
          ) : weeklySalesQuery.isError ? (
            <div className="h-32 flex items-center justify-center text-xs text-danger">Error al cargar datos</div>
          ) : (
            <div className="flex items-end justify-between gap-2 sm:gap-4 h-32 pt-4 shrink-0 border-b border-neutral-border min-w-0 overflow-hidden">
              {chartData.map((stat) => {
                const pct = (stat.value / maxChartVal) * 100;
                return (
                  <div className="flex flex-col items-center gap-1.5 flex-1 h-full justify-end min-w-0" key={stat.date}>
                    <div
                      className="w-full bg-primary/20 hover:bg-primary rounded-t transition-[height,background-color] duration-300 ease-[var(--ease-out-strong)] relative group cursor-default"
                      style={{ height: `${pct}%` }}
                    >
                      <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-pos-total-bg text-pos-total-text text-xs font-mono font-bold px-1.5 py-0.5 rounded border border-neutral-border/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md z-10">
                        ${stat.value.toFixed(2)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-neutral-text-muted mb-1 truncate">{stat.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-3 text-xs">
            <div className="flex items-center gap-4 text-xs text-neutral-text-secondary">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded bg-primary" />
                <span>Ingreso diario</span>
              </div>
              <div className="text-xs text-neutral-text-muted">
                Promedio: ${(chartTotal / 7).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-xs text-neutral-text-muted mr-1.5">Total semana:</span>
              <span className="font-mono font-bold text-neutral-text-primary">
                ${chartTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </Card>

        {/* Critical Stock list */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 border-b border-neutral-border pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase text-neutral-text-secondary tracking-widest">Stock Crítico</h2>
              <p className="text-xs text-neutral-text-muted mt-0.5">Productos bajo el mínimo</p>
            </div>
            <Link className="text-xs font-bold text-primary-text hover:underline" to="/inventario">Ver todo</Link>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-text-secondary">Inventario completo y saludable</div>
          ) : (
            <div className="divide-y divide-neutral-border max-h-[160px] overflow-y-auto pr-1">
              {lowStockItems.slice(0, 5).map((item) => {
                const qty = Number(item.quantity);
                const min = Number(item.min_stock);
                const isCritical = qty <= min * 0.3; // Very low

                return (
                  <div className="py-2 flex items-center justify-between gap-3 text-xs" key={item.id}>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-neutral-text-primary truncate">{item.product_name}</div>
                      <div className="font-mono text-xs text-neutral-text-muted uppercase mt-0.5">{item.sku}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-mono font-bold ${isCritical ? "text-danger" : "text-warning"}`}>
                        {formatStock(qty)} {item.unit_abbreviation}
                      </div>
                      <div className="text-xs text-neutral-text-muted">Mín: {formatStock(min)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* Bottom Row: Recent Sales & Top Products list */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Recent Sales table */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 border-b border-neutral-border pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase text-neutral-text-secondary tracking-widest">Últimas Ventas</h2>
              <p className="text-xs text-neutral-text-muted mt-0.5">Historial de tickets recientes</p>
            </div>
            <Link className="text-xs font-bold text-primary-text hover:underline" to="/ventas">Historial completo</Link>
          </div>

          {salesQuery.isLoading ? (
            <SkeletonTable cols={4} rows={3} />
          ) : recentSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-text-secondary">Sin transacciones registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-border text-neutral-text-muted uppercase text-xs tracking-wider bg-neutral-bg">
                    <th className="py-2 px-3">Folio</th>
                    <th className="py-2 px-3">Cajero</th>
                    <th className="py-2 px-3">Estado</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-border">
                  {recentSales.slice(0, 5).map((sale) => (
                    <tr className="hover:bg-neutral-surface-raised/50" key={sale.id}>
                      <td className="py-2 px-3 font-mono font-bold text-primary-text">#{sale.folio}</td>
                      <td className="py-2 px-3 text-neutral-text-secondary">{sale.username}</td>
                      <td className="py-2 px-3">
                        <Badge tone={sale.status === "completada" ? "success" : "danger"}>
                          {sale.status === "completada" ? "Completada" : "Cancelada"}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-neutral-text-primary text-right">${Number(sale.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top Products rank */}
        <Card className="p-4">
          <div>
            <h2 className="text-xs font-bold uppercase text-neutral-text-secondary tracking-widest">Productos más vendidos</h2>
            <p className="text-xs text-neutral-text-muted mt-0.5">Top del período mensual</p>
          </div>

          {dashboardQuery.isLoading ? (
            <div className="mt-4"><SkeletonTable cols={2} rows={3} /></div>
          ) : (data?.top_products?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-text-secondary mt-4">Sin ventas este mes</div>
          ) : (
            <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {data!.top_products.map((product, index) => (
                <div
                  className="flex items-center justify-between rounded-md border border-neutral-border p-2.5 transition-colors hover:bg-neutral-surface-raised/40"
                  key={product.name}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold border ${rankingClass(index)}`}>
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-neutral-text-primary truncate">{product.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-bold text-neutral-text-primary">${Number(product.revenue).toFixed(2)}</div>
                    <div className="text-xs text-neutral-text-muted">{formatStock(product.quantity)} {Number(product.quantity) === 1 ? "ud" : "uds"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function ShiftBanner({ sessions, userId }: { sessions: OpenSessionSummary[]; userId?: number }) {
  const own = sessions.find((s) => s.user_id === userId) ?? sessions[0];
  const others = sessions.length - (own ? 1 : 0);

  if (!own) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-border bg-neutral-surface p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-text-muted shrink-0" />
          <div>
            <div className="text-xs font-bold text-neutral-text-primary">Sin turno abierto</div>
            <div className="text-xs text-neutral-text-secondary">Ninguna caja tiene una sesión abierta.</div>
          </div>
        </div>
        <Link to="/pos">
          <Button className="min-h-0 h-8 py-1 px-3 text-xs" variant="secondary">Abrir caja</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-border bg-neutral-surface p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shadow-[0_0_0_3px_rgba(5,150,105,0.15)] shrink-0" />
        <div>
          <div className="text-xs font-bold text-success">Turno abierto · {own.register}</div>
          <div className="text-xs text-neutral-text-secondary">
            Cajero: <span className="font-semibold">{own.user}</span>
            {others > 0 ? ` · ${others === 1 ? "1 caja más abierta" : `${others} cajas más abiertas`}` : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div className="text-right">
          <div className="font-mono text-sm font-semibold text-neutral-text-primary">{formatCurrency(own.revenue)}</div>
          <div className="text-xs text-neutral-text-muted">Vendido en turno</div>
        </div>
        <div className="w-px h-8 bg-neutral-border" />
        <div className="text-right">
          <div className="font-mono text-sm font-semibold text-neutral-text-primary">{own.count}</div>
          <div className="text-xs text-neutral-text-muted">{own.count === 1 ? "Transacción" : "Transacciones"}</div>
        </div>
        <div className="w-px h-8 bg-neutral-border" />
        <Link to="/corte-caja">
          <Button className="min-h-0 h-8 py-1 px-3 text-xs" variant="secondary">Cerrar turno</Button>
        </Link>
      </div>
    </div>
  );
}
