import { AlertTriangle, CircleDollarSign, PackageSearch, ReceiptText } from "lucide-react";

import { Badge, Card } from "../components/ui";

const kpis = [
  { icon: CircleDollarSign, label: "Ventas hoy", tone: "success", value: "$0.00" },
  { icon: ReceiptText, label: "Tickets", tone: "neutral", value: "0" },
  { icon: AlertTriangle, label: "Stock bajo", tone: "warning", value: "0" },
  { icon: PackageSearch, label: "Productos", tone: "neutral", value: "0" },
] as const;

export function DashboardPage() {
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Dashboard</h1>
          <p className="text-sm text-neutral-text-secondary">Resumen operativo del dia</p>
        </div>
        <Badge tone="warning">Caja sin abrir</Badge>
      </div>

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

      <section className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-4">
          <h2 className="text-base font-semibold text-neutral-text-primary">Actividad reciente</h2>
          <div className="mt-4 rounded-md border border-dashed border-neutral-border p-6 text-sm text-neutral-text-secondary">
            Sin movimientos registrados.
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-base font-semibold text-neutral-text-primary">Caja</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-text-secondary">Estado</dt>
              <dd className="font-semibold text-warning">Cerrada</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-text-secondary">Efectivo inicial</dt>
              <dd className="font-mono font-semibold">$0.00</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-text-secondary">Total vendido</dt>
              <dd className="font-mono font-semibold">$0.00</dd>
            </div>
          </dl>
        </Card>
      </section>
    </div>
  );
}
