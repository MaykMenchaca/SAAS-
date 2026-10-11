import type { FormEvent } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  BarChart3,
  CircleDollarSign,
  CreditCard,
  Download,
  Package,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";

import type { GrossMarginReport, InventoryValuation, SalesReport, TopProductsReport } from "../api/reports";
import { fetchGrossMargin, fetchInventoryValuation, fetchSalesReport, fetchTopProducts } from "../api/reports";
import { Badge, Button, Card, ErrorState, Input, PageHeader, SkeletonKPI, SkeletonTable, Table, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";
import { addLocalDays, localISODate } from "../lib/dates";
import { formatCurrency } from "../lib/formatters";
import { qk } from "../api/query-keys";

// ── CSV Helper ───────────────────────────────────────────────────

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ────────────────────────────────────────────────────────

type Tab = "ventas" | "productos" | "inventario" | "margen";

const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "ventas", label: "Ventas", icon: ReceiptText },
  { id: "productos", label: "Top Productos", icon: TrendingUp },
  { id: "inventario", label: "Valuación", icon: Package },
  { id: "margen", label: "Margen", icon: CircleDollarSign },
];

function defaultDates() {
  const now = new Date();
  const to = localISODate(now);
  const from = localISODate(addLocalDays(now, -30));
  return { from, to };
}

const paymentIcons: Record<string, typeof CreditCard> = {
  efectivo: Wallet,
  tarjeta: CreditCard,
  transferencia: ArrowDownUp,
};

// ── Main Page ──────────────────────────────────────────────────────

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("ventas");
  const defaults = defaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);

  function handleDateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Queries auto-refetch via queryKey deps
  }

  // La fecha inicial no puede ser posterior a la final (H-49)
  const rangeError =
    activeTab !== "inventario" && dateFrom && dateTo && dateFrom > dateTo
      ? "La fecha inicial debe ser anterior o igual a la final."
      : "";

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Reportes"
        subtitle="Análisis de ventas, inventario y rentabilidad"
      />

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={[
                "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
                activeTab === tab.id
                  ? "bg-neutral-surface text-primary-text shadow-sm"
                  : "text-neutral-text-secondary hover:text-neutral-text-primary",
              ].join(" ")}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Date Range (for tabs that use it) */}
      {activeTab !== "inventario" ? (
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={handleDateSubmit}>
          <Input
            label="Desde"
            name="from"
            onChange={(e) => setDateFrom(e.target.value)}
            type="date"
            value={dateFrom}
          />
          <Input
            label="Hasta"
            name="to"
            onChange={(e) => setDateTo(e.target.value)}
            type="date"
            value={dateTo}
          />
        </form>
      ) : null}

      {rangeError ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
          {rangeError}
        </div>
      ) : null}

      {/* Tab Content */}
      {activeTab === "ventas" && !rangeError ? <SalesTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
      {activeTab === "productos" && !rangeError ? <TopProductsTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
      {activeTab === "inventario" ? <InventoryValuationTab /> : null}
      {activeTab === "margen" && !rangeError ? <GrossMarginTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
    </div>
  );
}

// ── Sales Tab ─────────────────────────────────────────────────────

function SalesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const query = useQuery({
    queryKey: qk.reportSales(dateFrom, dateTo),
    queryFn: () => fetchSalesReport(dateFrom, dateTo),
  });

  const data: SalesReport | undefined = query.data;
  const isLoading = query.isLoading;

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  const kpis = [
    {
      icon: ReceiptText,
      label: "Ventas totales",
      value: isLoading ? "..." : String(data?.total_sales ?? 0),
    },
    {
      icon: CircleDollarSign,
      label: "Ingreso total",
      value: isLoading ? "..." : formatCurrency(data?.total_revenue ?? "0"),
    },
    {
      icon: XCircle,
      label: "Canceladas",
      value: isLoading ? "..." : String(data?.cancelled_sales ?? 0),
    },
  ];

  return (
    <div className="grid gap-4">
      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          <>
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
          </>
        ) : (
          kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card className="p-4" key={kpi.label}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-text-secondary">{kpi.label}</p>
                    <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">{kpi.value}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-neutral-bg text-primary-text">
                    <Icon aria-hidden="true" size={21} />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </section>

      {/* Payment Methods */}
      <Card className="p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-text-primary">Métodos de pago</h2>
        {isLoading ? (
          <SkeletonTable rows={3} cols={2} />
        ) : (data?.payment_methods?.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Sin pagos en el periodo.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid gap-2">
              {data!.payment_methods.map((pm) => {
                const Icon = paymentIcons[pm.method] ?? CreditCard;
                return (
                  <div className="flex items-center justify-between rounded-md border border-neutral-border px-3 py-2" key={pm.method}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-bg text-neutral-text-secondary">
                        <Icon aria-hidden="true" size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold capitalize">{pm.method}</p>
                        <p className="text-xs text-neutral-text-secondary">{pm.count} transacciones</p>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-semibold">${pm.net_amount}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center border-t border-neutral-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
              <PaymentMethodsDonut data={data!.payment_methods} />
            </div>
          </div>
        )}
      </Card>

      {/* Daily breakdown */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-text-primary">Ventas por día</h2>
          {data?.daily && data.daily.length > 0 ? (
            <Button
              icon={<Download aria-hidden="true" size={15} />}
              onClick={() =>
                downloadCsv(
                  `ventas_${dateFrom}_${dateTo}.csv`,
                  ["Fecha", "Ventas", "Ingreso"],
                  data!.daily.map((d) => [d.date, String(d.count), d.revenue]),
                )
              }
              variant="ghost"
            >
              CSV
            </Button>
          ) : null}
        </div>
        {isLoading ? (
          <SkeletonTable rows={6} cols={3} />
        ) : (data?.daily?.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Sin datos en el periodo.</p>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-lg border border-neutral-border bg-neutral-bg/30 p-4">
              <DailySalesChart data={fillMissingDays(data!.daily, dateFrom, dateTo)} />
            </div>
            <div className="max-h-72 overflow-auto">
              <Table>
                <caption className="sr-only">Tabla de ventas diarias</caption>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Fecha</th>
                    <th className={`${tableHeadClass} text-right`}>Ventas</th>
                    <th className={`${tableHeadClass} text-right`}>Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.daily.map((day) => (
                    <tr className={tableRowClass} key={day.date}>
                      <td className={tableCellClass}>
                        {new Date(day.date + "T12:00:00").toLocaleDateString("es-MX", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>{day.count}</td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold`}>${day.revenue}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Top Products Tab ──────────────────────────────────────────────

function TopProductsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sortBy, setSortBy] = useState<"quantity" | "revenue">("revenue");

  const query = useQuery({
    queryKey: qk.reportTopProducts(dateFrom, dateTo, sortBy),
    queryFn: () => fetchTopProducts({ from: dateFrom, to: dateTo, sort: sortBy, limit: 20 }),
  });

  const data: TopProductsReport | undefined = query.data;

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <Button onClick={() => setSortBy("revenue")} variant={sortBy === "revenue" ? "primary" : "secondary"}>
          Por ingreso
        </Button>
        <Button onClick={() => setSortBy("quantity")} variant={sortBy === "quantity" ? "primary" : "secondary"}>
          Por cantidad
        </Button>
      </div>

      <Card className="overflow-hidden">
        {data?.items && data.items.length > 0 ? (
          <div className="flex justify-end px-4 pt-3">
            <Button
              icon={<Download aria-hidden="true" size={15} />}
              onClick={() =>
                downloadCsv(
                  `top_productos_${dateFrom}_${dateTo}.csv`,
                  ["#", "SKU", "Producto", "Cantidad", "Ventas", "Ingreso"],
                  data!.items.map((item, i) => [
                    String(i + 1),
                    item.product_sku,
                    item.product_name,
                    item.total_quantity,
                    String(item.sale_count),
                    item.total_revenue,
                  ]),
                )
              }
              variant="ghost"
            >
              CSV
            </Button>
          </div>
        ) : null}
        {query.isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">
            <TrendingUp aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
            Sin datos en el periodo.
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Tabla de productos mas vendidos</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>#</th>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} text-right`}>Cantidad</th>
                <th className={`${tableHeadClass} text-right`}>Ventas</th>
                <th className={`${tableHeadClass} text-right`}>Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((item, index) => (
                <tr className={tableRowClass} key={item.product_id}>
                  <td className={tableCellClass}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary-text">
                      {index + 1}
                    </span>
                  </td>
                  <td className={tableCellClass}>
                    <div className="font-semibold">{item.product_name}</div>
                    <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                  </td>
                  <td className={`${tableCellClass} text-right font-mono`}>{item.total_quantity}</td>
                  <td className={`${tableCellClass} text-right font-mono`}>{item.sale_count}</td>
                  <td className={`${tableCellClass} text-right font-mono font-semibold`}>${item.total_revenue}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Inventory Valuation Tab ───────────────────────────────────────

function InventoryValuationTab() {
  const query = useQuery({
    queryKey: qk.reportInventoryValuation(),
    queryFn: fetchInventoryValuation,
  });

  const data: InventoryValuation | undefined = query.data;
  const isLoading = query.isLoading;

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="grid gap-4">
      {/* Summary KPIs */}
      <section className="grid gap-3 sm:grid-cols-3">
        {isLoading ? (
          <>
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
          </>
        ) : (
          <>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">Valor total del inventario</p>
              <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">
                ${data?.total_valuation ?? "0.00"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">Unidades en stock</p>
              <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">
                {data?.total_units ?? "0"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">Productos activos</p>
              <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">
                {data?.product_count ?? 0}
              </p>
            </Card>
          </>
        )}
      </section>

      <Card className="overflow-hidden">
        {data?.items && data.items.length > 0 ? (
          <div className="flex justify-end px-4 pt-3">
            <Button
              icon={<Download aria-hidden="true" size={15} />}
              onClick={() =>
                downloadCsv(
                  "valuacion_inventario.csv",
                  ["SKU", "Producto", "Stock", "Costo Promedio", "Valuación"],
                  data!.items.map((item) => [
                    item.sku,
                    item.name,
                    item.quantity,
                    item.avg_cost,
                    item.valuation,
                  ]),
                )
              }
              variant="ghost"
            >
              CSV
            </Button>
          </div>
        ) : null}
        {isLoading ? (
          <SkeletonTable rows={6} cols={4} />
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">
            <Package aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
            Sin productos en inventario.
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Tabla de valuacion de inventario</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} text-right`}>Stock</th>
                <th className={`${tableHeadClass} text-right`}>Costo prom.</th>
                <th className={`${tableHeadClass} text-right`}>Valuación</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((item) => (
                <tr className={tableRowClass} key={item.product_id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold">{item.name}</div>
                    <div className="font-mono text-xs text-neutral-text-secondary">{item.sku}</div>
                  </td>
                  <td className={`${tableCellClass} text-right font-mono`}>{item.quantity}</td>
                  <td className={`${tableCellClass} text-right font-mono`}>${item.avg_cost}</td>
                  <td className={`${tableCellClass} text-right font-mono font-semibold`}>${item.valuation}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Gross Margin Tab ──────────────────────────────────────────────

function GrossMarginTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const query = useQuery({
    queryKey: qk.reportGrossMargin(dateFrom, dateTo),
    queryFn: () => fetchGrossMargin(dateFrom, dateTo),
  });

  const data: GrossMarginReport | undefined = query.data;
  const isLoading = query.isLoading;
  const marginPct = Number(data?.summary?.margin_percent ?? 0);

  if (query.isError) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="grid gap-4">
      {/* Summary */}
      <section className="grid gap-3 sm:grid-cols-4">
        {isLoading ? (
          <>
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
            <SkeletonKPI />
          </>
        ) : (
          <>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">Ingreso total</p>
              <p className="mt-2 font-mono text-xl font-bold text-neutral-text-primary">
                ${data?.summary?.total_revenue ?? "0.00"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">Costo total</p>
              <p className="mt-2 font-mono text-xl font-bold text-neutral-text-primary">
                ${data?.summary?.total_cost ?? "0.00"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">Margen bruto</p>
              <p className="mt-2 font-mono text-xl font-bold text-success">
                ${data?.summary?.gross_margin ?? "0.00"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold text-neutral-text-secondary">% Margen</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="font-mono text-xl font-bold text-neutral-text-primary">
                  {`${data?.summary?.margin_percent ?? "0"}%`}
                </p>
                {marginPct >= 30 ? (
                  <TrendingUp aria-hidden="true" className="text-success" size={20} />
                ) : (
                  <TrendingDown aria-hidden="true" className="text-warning" size={20} />
                )}
              </div>
            </Card>
          </>
        )}
      </section>

      <Card className="overflow-hidden">
        {data?.items && data.items.length > 0 ? (
          <div className="flex justify-end px-4 pt-3">
            <Button
              icon={<Download aria-hidden="true" size={15} />}
              onClick={() =>
                downloadCsv(
                  `margen_bruto_${dateFrom}_${dateTo}.csv`,
                  ["SKU", "Producto", "Cantidad", "Ingreso", "Costo", "Margen", "% Margen"],
                  data!.items.map((item) => [
                    item.product_sku,
                    item.product_name,
                    item.total_quantity,
                    item.total_revenue,
                    item.total_cost,
                    item.gross_margin,
                    `${item.margin_percent}%`,
                  ]),
                )
              }
              variant="ghost"
            >
              CSV
            </Button>
          </div>
        ) : null}
        {isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">
            <CircleDollarSign aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
            Sin ventas en el periodo.
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Tabla de margen bruto</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} text-right`}>Cant.</th>
                <th className={`${tableHeadClass} text-right`}>Ingreso</th>
                <th className={`${tableHeadClass} text-right`}>Costo</th>
                <th className={`${tableHeadClass} text-right`}>Margen</th>
                <th className={`${tableHeadClass} text-right`}>%</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((item) => {
                const pct = Number(item.margin_percent);
                return (
                  <tr className={tableRowClass} key={item.product_id}>
                    <td className={tableCellClass}>
                      <div className="font-semibold">{item.product_name}</div>
                      <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                    </td>
                    <td className={`${tableCellClass} text-right font-mono`}>{item.total_quantity}</td>
                    <td className={`${tableCellClass} text-right font-mono`}>${item.total_revenue}</td>
                    <td className={`${tableCellClass} text-right font-mono text-neutral-text-secondary`}>${item.total_cost}</td>
                    <td className={`${tableCellClass} text-right font-mono font-semibold text-success`}>${item.gross_margin}</td>
                    <td className={tableCellClass}>
                      <div className="flex justify-end">
                        <Badge tone={pct >= 30 ? "success" : pct >= 15 ? "warning" : "danger"}>
                          {item.margin_percent}%
                        </Badge>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function PaymentMethodsDonut({ data }: { data: { method: string; count: number; net_amount: string }[] }) {
  const total = data.reduce((acc, curr) => acc + Number(curr.net_amount), 0);
  if (total === 0) return null;

  let cumulativePercent = 0;
  const slices = data.map((pm, index) => {
    const amount = Number(pm.net_amount);
    const percent = amount / total;
    const startPercent = cumulativePercent;
    cumulativePercent += percent;

    const colors = [
      "stroke-primary",
      "stroke-success",
      "stroke-warning",
      "stroke-info",
    ];
    const colorClass = colors[index % colors.length];

    const radius = 15.91549430918954;
    const strokeDasharray = `${(percent * 100).toFixed(2)} ${(100 - percent * 100).toFixed(2)}`;
    const strokeDashoffset = `${(100 - startPercent * 100 + 25).toFixed(2)}`;

    return {
      method: pm.method,
      percent,
      strokeDasharray,
      strokeDashoffset,
      colorClass,
      radius,
    };
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row w-full">
      <div className="relative h-28 w-28 shrink-0">
        <svg
          aria-label={`Ingreso por método de pago: ${data.map((pm) => `${pm.method} ${formatCurrency(pm.net_amount)}`).join(", ")}`}
          className="h-full w-full -rotate-90"
          role="img"
          viewBox="0 0 42 42"
        >
          <circle
            cx="21"
            cy="21"
            r="15.91549430918954"
            fill="transparent"
            className="stroke-neutral-border"
            strokeWidth="5"
          />
          {slices.map((slice) => (
            <circle
              key={slice.method}
              cx="21"
              cy="21"
              r={slice.radius}
              fill="transparent"
              className={slice.colorClass}
              strokeWidth="5"
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={slice.strokeDashoffset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-neutral-text-secondary">Total</span>
          <span className="text-xs font-bold text-neutral-text-primary">${total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      <div className="grid gap-1.5 w-full text-xs max-w-40">
        {slices.map((slice) => (
          <div className="flex items-center justify-between" key={slice.method}>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${slice.colorClass.replace("stroke-", "bg-").replace("[", "").replace("]", "")}`} />
              <span className="capitalize text-neutral-text-secondary">{slice.method}</span>
            </div>
            <span className="font-mono font-semibold text-neutral-text-primary">
              {(slice.percent * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DailyPoint = { date: string; count: number; revenue: string };

/** "2026-10-06" como fecha local (sin desfase de zona horaria). */
function parseLocalDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Rellena con 0 los días sin ventas para que la gráfica no salte días (H-49). Máximo 366 días. */
function fillMissingDays(daily: DailyPoint[], from: string, to: string): DailyPoint[] {
  if (!from || !to || from > to) return daily;
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const out: DailyPoint[] = [];
  let cursor = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (cursor <= end && out.length < 366) {
    const iso = localISODate(cursor);
    out.push(byDate.get(iso) ?? { date: iso, count: 0, revenue: "0.00" });
    cursor = addLocalDays(cursor, 1);
  }
  return out;
}

function DailySalesChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((d) => Number(d.revenue)), 1);
  const chartHeight = 100;
  const chartWidth = 500;
  const paddingX = 20;
  const paddingY = 10;

  const step = (chartWidth - paddingX * 2) / Math.max(data.length - 1, 1);
  const bars = data.map((d, index) => {
    const val = Number(d.revenue);
    const barHeight = (val / maxRevenue) * (chartHeight - paddingY * 2);
    const x = paddingX + index * step;
    const y = chartHeight - paddingY - barHeight;

    return {
      x,
      y,
      width: Math.max(step * 0.5, 4),
      height: Math.max(barHeight, 2),
      date: d.date,
      revenue: val,
    };
  });

  return (
    <div className="w-full">
      <div className="relative w-full h-[120px]">
        <svg
          aria-label={`Ventas por día del ${formatShortDate(data[0].date)} al ${formatShortDate(data[data.length - 1].date)}; máximo ${formatCurrency(maxRevenue)}`}
          className="w-full h-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <line
            x1={paddingX}
            y1={paddingY}
            x2={chartWidth - paddingX}
            y2={paddingY}
            className="stroke-neutral-border"
            strokeDasharray="2 2"
          />
          <line
            x1={paddingX}
            y1={chartHeight / 2}
            x2={chartWidth - paddingX}
            y2={chartHeight / 2}
            className="stroke-neutral-border"
            strokeDasharray="2 2"
          />
          <line
            x1={paddingX}
            y1={chartHeight - paddingY}
            x2={chartWidth - paddingX}
            y2={chartHeight - paddingY}
            className="stroke-neutral-border"
          />

          {bars.map((bar) => (
            <g key={bar.date}>
              <rect
                x={bar.x - bar.width / 2}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                className="fill-primary/20 hover:fill-primary/70 transition-colors"
                rx="1"
              />
              <rect
                x={bar.x - bar.width / 2}
                y={bar.y}
                width={bar.width}
                height={2}
                className="fill-primary"
                rx="0.5"
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="flex justify-between px-2 text-xs text-neutral-text-secondary mt-1">
        <span>{formatShortDate(data[0].date)}</span>
        {data.length > 2 ? <span>{formatShortDate(data[Math.floor(data.length / 2)].date)}</span> : null}
        <span>{formatShortDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}
