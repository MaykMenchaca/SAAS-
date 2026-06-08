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
import { Badge, Button, Card, Input, Table, tableCellClass, tableHeadClass } from "../components/ui";

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
  { id: "inventario", label: "Valuacion", icon: Package },
  { id: "margen", label: "Margen", icon: CircleDollarSign },
];

function defaultDates() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Reportes</h1>
          <p className="text-sm text-neutral-text-secondary">Analisis de ventas, inventario y rentabilidad</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={[
                "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
                activeTab === tab.id
                  ? "bg-neutral-surface text-primary shadow-sm"
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

      {/* Tab Content */}
      {activeTab === "ventas" ? <SalesTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
      {activeTab === "productos" ? <TopProductsTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
      {activeTab === "inventario" ? <InventoryValuationTab /> : null}
      {activeTab === "margen" ? <GrossMarginTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
    </div>
  );
}

// ── Sales Tab ─────────────────────────────────────────────────────

function SalesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const query = useQuery({
    queryKey: ["report-sales", dateFrom, dateTo],
    queryFn: () => fetchSalesReport(dateFrom, dateTo),
  });

  const data: SalesReport | undefined = query.data;
  const isLoading = query.isLoading;

  const kpis = [
    {
      icon: ReceiptText,
      label: "Ventas totales",
      value: isLoading ? "..." : String(data?.total_sales ?? 0),
    },
    {
      icon: CircleDollarSign,
      label: "Ingreso total",
      value: isLoading ? "..." : `$${data?.total_revenue ?? "0.00"}`,
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

      {/* Payment Methods */}
      <Card className="p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-text-primary">Metodos de pago</h2>
        {isLoading ? (
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Cargando...</p>
        ) : (data?.payment_methods?.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Sin pagos en el periodo.</p>
        ) : (
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
        )}
      </Card>

      {/* Daily breakdown */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-text-primary">Ventas por dia</h2>
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
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Cargando...</p>
        ) : (data?.daily?.length ?? 0) === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Sin datos en el periodo.</p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <Table>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Fecha</th>
                  <th className={`${tableHeadClass} text-right`}>Ventas</th>
                  <th className={`${tableHeadClass} text-right`}>Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {data!.daily.map((day) => (
                  <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={day.date}>
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
        )}
      </Card>
    </div>
  );
}

// ── Top Products Tab ──────────────────────────────────────────────

function TopProductsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [sortBy, setSortBy] = useState<"quantity" | "revenue">("revenue");

  const query = useQuery({
    queryKey: ["report-top-products", dateFrom, dateTo, sortBy],
    queryFn: () => fetchTopProducts({ from: dateFrom, to: dateTo, sort: sortBy, limit: 20 }),
  });

  const data: TopProductsReport | undefined = query.data;

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
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">Cargando...</p>
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">
            <TrendingUp aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
            Sin datos en el periodo.
          </p>
        ) : (
          <Table>
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
                <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={item.product_id}>
                  <td className={tableCellClass}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
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
    queryKey: ["report-inventory-valuation"],
    queryFn: fetchInventoryValuation,
  });

  const data: InventoryValuation | undefined = query.data;
  const isLoading = query.isLoading;

  return (
    <div className="grid gap-4">
      {/* Summary KPIs */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">Valor total del inventario</p>
          <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">
            ${isLoading ? "..." : data?.total_valuation ?? "0.00"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">Unidades en stock</p>
          <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">
            {isLoading ? "..." : data?.total_units ?? "0"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">Productos activos</p>
          <p className="mt-2 font-mono text-2xl font-bold text-neutral-text-primary">
            {isLoading ? "..." : data?.product_count ?? 0}
          </p>
        </Card>
      </section>

      <Card className="overflow-hidden">
        {data?.items && data.items.length > 0 ? (
          <div className="flex justify-end px-4 pt-3">
            <Button
              icon={<Download aria-hidden="true" size={15} />}
              onClick={() =>
                downloadCsv(
                  "valuacion_inventario.csv",
                  ["SKU", "Producto", "Stock", "Costo Promedio", "Valuacion"],
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
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">Cargando...</p>
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">
            <Package aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
            Sin productos en inventario.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} text-right`}>Stock</th>
                <th className={`${tableHeadClass} text-right`}>Costo prom.</th>
                <th className={`${tableHeadClass} text-right`}>Valuacion</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((item) => (
                <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={item.product_id}>
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
    queryKey: ["report-gross-margin", dateFrom, dateTo],
    queryFn: () => fetchGrossMargin(dateFrom, dateTo),
  });

  const data: GrossMarginReport | undefined = query.data;
  const isLoading = query.isLoading;
  const marginPct = Number(data?.summary?.margin_percent ?? 0);

  return (
    <div className="grid gap-4">
      {/* Summary */}
      <section className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">Ingreso total</p>
          <p className="mt-2 font-mono text-xl font-bold text-neutral-text-primary">
            ${isLoading ? "..." : data?.summary?.total_revenue ?? "0.00"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">Costo total</p>
          <p className="mt-2 font-mono text-xl font-bold text-neutral-text-primary">
            ${isLoading ? "..." : data?.summary?.total_cost ?? "0.00"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">Margen bruto</p>
          <p className="mt-2 font-mono text-xl font-bold text-success">
            ${isLoading ? "..." : data?.summary?.gross_margin ?? "0.00"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold text-neutral-text-secondary">% Margen</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="font-mono text-xl font-bold text-neutral-text-primary">
              {isLoading ? "..." : `${data?.summary?.margin_percent ?? "0"}%`}
            </p>
            {!isLoading ? (
              marginPct >= 30 ? (
                <TrendingUp aria-hidden="true" className="text-success" size={20} />
              ) : (
                <TrendingDown aria-hidden="true" className="text-warning" size={20} />
              )
            ) : null}
          </div>
        </Card>
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
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">Cargando...</p>
        ) : (data?.items?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-text-secondary">
            <CircleDollarSign aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
            Sin ventas en el periodo.
          </p>
        ) : (
          <Table>
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
                  <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={item.product_id}>
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
