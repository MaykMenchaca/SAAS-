import { Button, Corners, EmptyState, Pagination, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import type { CashRegisterSession } from "../../api/sales";
import { formatCurrency } from "../../lib/formatters";
import { formatSigned } from "./denominations";

const PER_PAGE = 10;

function formatClosed(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Historial de cortes cerrados con paginación local y "Ver arqueo". */
export function HistoryTable({
  onOpen,
  onPageChange,
  page,
  sessions,
}: {
  onOpen: (session: CashRegisterSession) => void;
  onPageChange: (page: number) => void;
  page: number;
  sessions: CashRegisterSession[];
}) {
  if (sessions.length === 0) {
    return (
      <section className="blueprint">
        <Corners />
        <EmptyState message="No hay cortes de caja cerrados registrados." />
      </section>
    );
  }

  const totalPages = Math.max(1, Math.ceil(sessions.length / PER_PAGE));
  const visible = sessions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <section className="grid gap-3">
      <div className="blueprint p-2 sm:p-3">
        <Corners />
        <Table>
          <caption className="sr-only">Sesiones de caja cerradas</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>Caja</th>
              <th className={tableHeadClass}>Cajero</th>
              <th className={`${tableHeadClass} ${tableNumClass}`}>Fondo apertura</th>
              <th className={`${tableHeadClass} ${tableNumClass}`}>Efectivo esperado</th>
              <th className={`${tableHeadClass} ${tableNumClass}`}>Efectivo cerrado</th>
              <th className={`${tableHeadClass} ${tableNumClass}`}>Diferencia</th>
              <th className={tableHeadClass}>Cierre</th>
              <th className={tableHeadClass}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((session) => {
              const diff = Number(session.difference ?? 0);
              const tone = Math.abs(diff) < 0.01 ? "text-ink-2" : diff < 0 ? "text-bad" : "text-warn";
              return (
                <tr className={tableRowClass} key={session.id}>
                  <td className={`${tableCellClass} whitespace-nowrap font-medium`}>{session.cash_register_name}</td>
                  <td className={tableCellClass}>{session.username}</td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{formatCurrency(session.opening_amount)}</td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{session.expected_cash !== null ? formatCurrency(session.expected_cash) : "—"}</td>
                  <td className={`${tableCellClass} ${tableNumClass}`}>{formatCurrency(session.closing_amount ?? 0)}</td>
                  <td className={`${tableCellClass} ${tableNumClass} font-medium ${tone}`}>{formatSigned(diff)}</td>
                  <td className={`${tableCellClass} whitespace-nowrap text-ink-2`}>{formatClosed(session.closed_at)}</td>
                  <td className={`${tableCellClass} text-right`}>
                    <Button
                      aria-label={`Ver arqueo de ${session.cash_register_name}, sesión ${session.id}`}
                      onClick={() => onOpen(session)}
                      size="sm"
                      variant="ghost"
                    >
                      Ver arqueo
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
          <span>Página {page} de {totalPages}</span>
          <Pagination onPageChange={onPageChange} page={page} totalPages={totalPages} />
        </div>
      ) : null}
    </section>
  );
}
