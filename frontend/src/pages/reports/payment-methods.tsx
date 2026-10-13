import { ArrowDownUp, CreditCard, Wallet } from "lucide-react";

import type { SalesReport } from "../../api/reports";
import { EmptyState, SkeletonTable } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { ReportPanel } from "./panel";

type Method = SalesReport["payment_methods"][number];

const icons: Record<string, typeof CreditCard> = {
  efectivo: Wallet,
  tarjeta: CreditCard,
  transferencia: ArrowDownUp,
};

const sliceStyles = [
  { bg: "bg-accent", stroke: "stroke-accent" },
  { bg: "bg-ok", stroke: "stroke-ok" },
  { bg: "bg-warn", stroke: "stroke-warn" },
  { bg: "bg-ink-2", stroke: "stroke-ink-2" },
];

export function PaymentMethods({ data, isLoading }: { data: Method[]; isLoading: boolean }) {
  return (
    <ReportPanel title="Métodos de pago">
      {isLoading ? (
        <div className="p-4"><SkeletonTable cols={2} rows={3} /></div>
      ) : data.length === 0 ? (
        <EmptyState message="Sin pagos en el periodo." />
      ) : (
        <div className="grid gap-6 p-4 md:grid-cols-2">
          <ul className="grid content-start gap-2">
            {data.map((pm) => {
              const Icon = icons[pm.method] ?? CreditCard;
              return (
                <li className="flex items-center justify-between gap-3 border border-divider px-3 py-2" key={pm.method}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-divider text-ink-2">
                      <Icon aria-hidden="true" size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">{pm.method}</p>
                      <p className="text-xs text-ink-2">{pm.count} {pm.count === 1 ? "transacción" : "transacciones"}</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold">{formatCurrency(pm.net_amount)}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-center border-t border-divider pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <Donut data={data} />
          </div>
        </div>
      )}
    </ReportPanel>
  );
}

function Donut({ data }: { data: Method[] }) {
  const total = data.reduce((acc, pm) => acc + Number(pm.net_amount), 0);
  if (total <= 0) return <p className="text-sm text-ink-2">Sin importes en el periodo.</p>;

  let cumulative = 0;
  const slices = data.map((pm, index) => {
    const percent = Number(pm.net_amount) / total;
    const start = cumulative;
    cumulative += percent;
    return {
      method: pm.method,
      percent,
      style: sliceStyles[index % sliceStyles.length],
      dash: `${(percent * 100).toFixed(2)} ${(100 - percent * 100).toFixed(2)}`,
      offset: (100 - start * 100 + 25).toFixed(2),
    };
  });

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
      <div className="relative h-28 w-28 shrink-0">
        <svg
          aria-label={`Ingreso por método de pago: ${data.map((pm) => `${pm.method} ${formatCurrency(pm.net_amount)}`).join(", ")}`}
          className="h-full w-full -rotate-90"
          role="img"
          viewBox="0 0 42 42"
        >
          <circle className="stroke-divider" cx="21" cy="21" fill="transparent" r="15.91549430918954" strokeWidth="5" />
          {slices.map((slice) => (
            <circle
              className={slice.style.stroke}
              cx="21"
              cy="21"
              fill="transparent"
              key={slice.method}
              r="15.91549430918954"
              strokeDasharray={slice.dash}
              strokeDashoffset={slice.offset}
              strokeWidth="5"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-ink-2">Total</span>
          <span className="text-xs font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
      <ul className="grid w-full max-w-44 gap-1.5 text-xs">
        {slices.map((slice) => (
          <li className="flex items-center justify-between gap-2" key={slice.method}>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${slice.style.bg}`} />
              <span className="capitalize text-ink-2">{slice.method}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums">{(slice.percent * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
