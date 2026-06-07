import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, PackageSearch, ReceiptText, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { apiClient } from "../api/client";
import { getLowStock } from "../api/inventory";
import { Badge, Button, Card } from "../components/ui";

type DashboardData = {
  sales_today: number;
  revenue_today: string;
  sales_week: number;
  revenue_week: string;
  sales_month: number;
  revenue_month: string;
  top_products: { name: string; quantity: string; revenue: string }[];
  low_stock_count: number;
};

async function fetchDashboard() {
  const response = await apiClient.get<DashboardData>("/reports/dashboard");
  return response.data;
}

export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 60_000, // auto-refresh every minute
  });
  const lowStockQuery = useQuery({
    queryKey: ["low-stock"],
    queryFn: getLowStock,
    refetchInterval: 60_000,
  });

  const data = dashboardQuery.data;
  const isLoading = dashboardQuery.isLoading;
  const lowStockItems = lowStockQuery.data ?? [];

  const kpis = [
    {
      icon: CircleDollarSign,
      label: "Ventas hoy",
      tone: "success" as const,
      value: isLoading ? "..." : `$${data?.revenue_today ?? "0.00"}`,
    },
    {
      icon: ReceiptText,
      label: "Tickets hoy",
      tone: "neutral" as const,
      value: isLoading ? "..." : String(data?.sales_today ?? 0),
    },
    {
      icon: TrendingUp,
      label: "Ventas semana",
      tone: "neutral" as const,
      value: isLoading ? "..." : `$${data?.revenue_week ?? "0.00"}`,
    },
    {
      icon: AlertTriangle,
      label: "Stock bajo",
      tone: "warning" as const,
      value: isLoading ? "..." : String(data?.low_stock_count ?? 0),
    },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Dashboard</h1>
          <p className="text-sm text-neutral-text-secondary">Resumen operativo del dia</p>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card className="p-4" key={kpi.label}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-text-secondary">{kpi.label}</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">{kpi.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-neutral-bg text-primary">
                  <Icon aria-hidden="true" size={21} />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {(data?.low_stock_count ?? 0) > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-warning" size={20} />
              <div className="min-w-0">
                <p className="font-semibold text-neutral-text-primary">
                  {data?.low_stock_count} producto{data?.low_stock_count === 1 ? "" : "s"} bajo minimo
                </p>
                <p className="mt-1 text-sm text-neutral-text-secondary">
                  {lowStockItems.slice(0, 3).map((item) => item.product_name).join(", ") || "Revisa inventario"}
                  {lowStockItems.length > 3 ? ` y ${lowStockItems.length - 3} mas` : ""}
                </p>
              </div>
            </div>
            <Link to="/inventario">
              <Button icon={<PackageSearch aria-hidden="true" size={17} />} variant="secondary">
                Revisar
              </Button>
            </Link>
          </div>
        </section>
      ) : null}

      {/* Bottom row */}
      <section className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        {/* Top products */}
        <Card className="p-4">
          <h2 className="text-base font-semibold text-neutral-text-primary">Productos mas vendidos (mes)</h2>
          {isLoading ? (
            <div className="mt-4 text-center text-sm text-neutral-text-secondary">Cargando...</div>
          ) : (data?.top_products?.length ?? 0) === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-neutral-border p-6 text-center text-sm text-neutral-text-secondary">
              <PackageSearch aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={28} />
              Sin ventas este mes.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {data!.top_products.map((product, index) => (
                <div
                  className="flex items-center justify-between rounded-md border border-neutral-border px-3 py-2"
                  key={product.name}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-neutral-text-primary">{product.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold">${product.revenue}</div>
                    <div className="text-xs text-neutral-text-secondary">{product.quantity} uds</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Monthly summary */}
        <Card className="p-4">
          <h2 className="text-base font-semibold text-neutral-text-primary">Resumen del mes</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-text-secondary">Ventas completadas</dt>
              <dd className="font-mono font-semibold">{isLoading ? "..." : data?.sales_month ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-text-secondary">Ingreso total</dt>
              <dd className="font-mono font-semibold text-primary">${isLoading ? "..." : data?.revenue_month ?? "0.00"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-text-secondary">Alertas de stock</dt>
              <dd>
                <Badge tone={(data?.low_stock_count ?? 0) > 0 ? "warning" : "success"}>
                  {isLoading ? "..." : data?.low_stock_count ?? 0}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>
      </section>
    </div>
  );
}
