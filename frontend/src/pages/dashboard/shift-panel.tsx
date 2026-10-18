import { Calculator } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { OpenSessionSummary } from "../../api/reports";
import { Button } from "../../components/ui";
import { formatSignedCurrency, negativeTone } from "../reports/helpers";

function sinceLabel(iso: string | null): string {
  if (!iso) return "";
  return ` · desde ${new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** Turno del usuario (o, si no tiene, el de la primera caja abierta) con datos reales de `open_sessions`. */
export function ShiftPanel({ sessions, userId }: { sessions: OpenSessionSummary[]; userId?: number }) {
  const navigate = useNavigate();
  const own = sessions.find((s) => s.user_id === userId) ?? sessions[0];
  const others = sessions.length - (own ? 1 : 0);

  if (!own) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-divider px-4 py-3.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg font-semibold">Sin turno abierto</p>
          <p className="text-sm text-ink-2">Ninguna caja tiene una sesión abierta.</p>
        </div>
        <Button onClick={() => navigate("/pos")} size="sm" variant="secondary">Abrir caja</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-stretch border border-divider">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3 px-4 py-3.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-ok" />
        <div className="min-w-0">
          <p className="font-heading text-lg font-semibold text-ok">Turno abierto · {own.register}</p>
          <p className="text-sm text-ink-2">
            Cajero: <span className="font-medium text-text">{own.user}</span>
            {sinceLabel(own.opened_at)}
            {others > 0 ? ` · ${others === 1 ? "1 caja más abierta" : `${others} cajas más abiertas`}` : ""}
          </p>
        </div>
      </div>
      <div className="border-l border-divider px-5 py-3.5">
        {/* Neto del turno: con solo devoluciones queda en negativo (salida de efectivo) */}
        <p className={`font-heading text-2xl font-semibold leading-tight tabular-nums ${negativeTone(own.revenue)}`}>{formatSignedCurrency(own.revenue)}</p>
        <p className="text-xs text-ink-2">Vendido en turno</p>
      </div>
      <div className="border-l border-divider px-5 py-3.5">
        <p className="font-heading text-2xl font-semibold leading-tight tabular-nums">{own.count}</p>
        <p className="text-xs text-ink-2">{own.count === 1 ? "Transacción" : "Transacciones"}</p>
      </div>
      <div className="flex items-center px-4 py-3.5 sm:ml-auto">
        <Button icon={<Calculator aria-hidden="true" size={16} />} onClick={() => navigate("/corte-caja")} size="sm" variant="secondary">
          Cerrar turno
        </Button>
      </div>
    </div>
  );
}
