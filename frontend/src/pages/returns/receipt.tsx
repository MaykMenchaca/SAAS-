import { CircleCheck } from "lucide-react";

import type { RefundMethod, SaleReturn } from "../../api/sales";
import { Button, Card } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

/** Paso 3: comprobante de la devolución registrada (folio D-, reembolso del servidor y método). */
export function ReturnReceipt({ onRestart, result }: { onRestart: () => void; result: SaleReturn }) {
  const method = (result.refund_method ?? "efectivo") as RefundMethod;
  const restocked = result.restocked !== false;
  return (
    <Card className="grid max-w-2xl gap-4 p-5 sm:p-7" frame>
      <div className="flex items-center gap-2.5 text-ok">
        <CircleCheck aria-hidden="true" size={26} />
        <h2 className="text-3xl">Devolución registrada</h2>
      </div>
      <dl className="grid grid-cols-1 border border-divider sm:grid-cols-3">
        <div className="px-4 py-3">
          <dt className="text-sm text-ink-2">Folio</dt>
          <dd className="font-medium tabular-nums">{result.folio ?? `D-${result.id}`}</dd>
        </div>
        <div className="border-t border-divider px-4 py-3 sm:border-l sm:border-t-0">
          <dt className="text-sm text-ink-2">Reembolso</dt>
          <dd className="font-heading text-2xl font-semibold tabular-nums">{formatCurrency(result.refund_total)}</dd>
        </div>
        <div className="border-t border-divider px-4 py-3 sm:border-l sm:border-t-0">
          <dt className="text-sm text-ink-2">Método</dt>
          <dd className="font-medium">{REFUND_METHOD_LABEL[method]}</dd>
        </div>
      </dl>
      <p className="text-ink-2">
        {restocked
          ? "Los artículos regresaron al inventario y el movimiento quedó en el historial del producto."
          : "Los artículos no se regresaron al inventario (merma)."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRestart}>Nueva devolución</Button>
      </div>
    </Card>
  );
}
