import { useQuery } from "@tanstack/react-query";

import { getActiveSession } from "../../api/sales";
import { qk } from "../../api/query-keys";
import { formatCurrency } from "../../lib/formatters";
import { cn } from "../../lib/cn";
import { useCan } from "../auth/require-permission";

/** Turno de caja del usuario (datos reales de /cash-register/active), compartido con el POS y las devoluciones. */
export function useActiveShift() {
  const can = useCan();
  const enabled = can("caja:ver");
  const query = useQuery({
    queryKey: qk.activePosSession("mia"),
    queryFn: getActiveSession,
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 30_000,
  });
  return enabled ? (query.data?.session ?? null) : null;
}

function openedAt(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Tarjeta "Caja 1 · Turno abierto · Desde 08:02 · Fondo $1,500.00" del pie del menú. */
export function ShiftCard() {
  const session = useActiveShift();
  return (
    <div className="flex items-center gap-2.5 border border-divider px-2.5 py-2">
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", session ? "bg-ok" : "bg-ink-3")} />
      <div className="min-w-0 flex-1">
        {session ? (
          <>
            <div className="truncate text-[0.8125rem] font-medium">{session.cash_register_name} · Turno abierto</div>
            <div className="truncate text-xs text-ink-2">
              Desde {openedAt(session.opened_at)} · Fondo {formatCurrency(session.opening_amount)}
            </div>
          </>
        ) : (
          <div className="truncate text-[0.8125rem] font-medium text-ink-2">Sin turno abierto</div>
        )}
      </div>
    </div>
  );
}

/** Versión compacta (menú colapsado): solo el punto de estado, con el detalle como título. */
export function ShiftDot() {
  const session = useActiveShift();
  const label = session ? `${session.cash_register_name} · Turno abierto` : "Sin turno abierto";
  return <span aria-label={label} className={cn("h-2 w-2 rounded-full", session ? "bg-ok" : "bg-ink-3")} role="img" title={label} />;
}
