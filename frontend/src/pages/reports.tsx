import { useState } from "react";
import { CircleDollarSign, Package, ReceiptText, TrendingUp } from "lucide-react";

import { Input, PageHeader, Segmented } from "../components/ui";
import { cn } from "../lib/cn";
import type { Preset } from "./reports/helpers";
import { formatLongDate, matchPreset, PRESETS, presetRange, validateRange } from "./reports/helpers";
import { MarginTab } from "./reports/margin-tab";
import { SalesTab } from "./reports/sales-tab";
import { TopProductsTab } from "./reports/top-products-tab";
import { ValuationTab } from "./reports/valuation-tab";

type Tab = "ventas" | "productos" | "inventario" | "margen";

const tabs: { id: Tab; label: string; icon: typeof ReceiptText }[] = [
  { id: "ventas", label: "Ventas", icon: ReceiptText },
  { id: "productos", label: "Top productos", icon: TrendingUp },
  { id: "inventario", label: "Valuación", icon: Package },
  { id: "margen", label: "Margen", icon: CircleDollarSign },
];

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("ventas");
  const [range, setRange] = useState(() => presetRange("30"));
  const dateFrom = range.from;
  const dateTo = range.to;

  const usesRange = activeTab !== "inventario";
  const rangeError = usesRange ? validateRange(dateFrom, dateTo) : "";
  const preset = matchPreset(dateFrom, dateTo);

  const subtitle = !usesRange
    ? "Valuación del inventario al día de hoy"
    : dateFrom && dateTo && !rangeError
      ? `Del ${formatLongDate(dateFrom)} al ${formatLongDate(dateTo)}`
      : "Análisis de ventas, inventario y rentabilidad";

  return (
    <div className="grid gap-5">
      <PageHeader subtitle={subtitle} title="Reportes" />

      {usesRange ? (
        <div className="flex flex-wrap items-end gap-3">
          <Segmented<Preset | "custom">
            aria-label="Rango rápido"
            onChange={(value) => {
              if (value !== "custom") setRange(presetRange(value));
            }}
            options={[
              ...PRESETS.map((p) => ({ label: p.label, value: p.id as Preset | "custom" })),
              ...(preset ? [] : [{ label: "Personalizado", value: "custom" as const }]),
            ]}
            size="sm"
            value={preset ?? "custom"}
          />
          <div className="w-full sm:w-44">
            <Input
              label="Desde"
              name="from"
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              type="date"
              value={dateFrom}
            />
          </div>
          <div className="w-full sm:w-44">
            <Input
              label="Hasta"
              name="to"
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              type="date"
              value={dateTo}
            />
          </div>
        </div>
      ) : null}

      {rangeError ? (
        <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
          {rangeError}
        </div>
      ) : null}

      <div aria-label="Reportes" className="flex gap-6 overflow-x-auto border-b border-divider" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              aria-selected={selected}
              className={cn(
                "-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 font-heading text-lg font-semibold transition-colors duration-150",
                selected ? "border-accent text-text" : "border-transparent text-ink-2 hover:text-text",
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {activeTab === "ventas" && !rangeError ? <SalesTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
        {activeTab === "productos" && !rangeError ? <TopProductsTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
        {activeTab === "inventario" ? <ValuationTab /> : null}
        {activeTab === "margen" && !rangeError ? <MarginTab dateFrom={dateFrom} dateTo={dateTo} /> : null}
      </div>
    </div>
  );
}
