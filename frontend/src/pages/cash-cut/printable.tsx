import type { CashRegisterSession, SessionSummary } from "../../api/sales";
import type { DenominationCount } from "./denominations";
import { DENOMINATIONS } from "./denominations";

/** Efectivo esperado: el que calcula el servidor al cerrar; antes del cierre, fondo + cobros en efectivo. */
export function expectedCashOf(summary: SessionSummary | null | undefined): number | null {
  if (!summary) return null;
  return summary.expected_cash !== null
    ? Number(summary.expected_cash)
    : Number(summary.opening_amount) + Number(summary.payment_methods?.efectivo || 0);
}

/** Comprobante de corte (se copia a una ventana de impresión; por eso sus estilos son los de `handlePrint`). */
export function PrintableCashCut({
  session,
  summary,
  counts,
  denominationTotal,
}: {
  session: CashRegisterSession;
  summary: SessionSummary | null;
  counts: DenominationCount;
  denominationTotal: number;
}) {
  const expectedCash = expectedCashOf(summary);
  const difference = expectedCash !== null ? denominationTotal - expectedCash : null;

  return (
    <div>
      <h2>CORTE DE CAJA</h2>
      <p className="text-center" style={{ textAlign: "center", marginBottom: "8px" }}>
        <strong>{session.cash_register_name}</strong><br />
        Cajero: {session.username}<br />
        Apertura: {new Date(session.opened_at).toLocaleString("es-MX")}<br />
        Cierre: {session.closed_at
          ? new Date(session.closed_at).toLocaleString("es-MX")
          : new Date().toLocaleString("es-MX")}
      </p>
      <hr />

      {summary ? (
        <>
          <table>
            <tbody>
              <tr><td>Ventas completadas</td><td>{summary.sales_completed}</td></tr>
              <tr><td>Ventas canceladas</td><td>{summary.sales_cancelled}</td></tr>
              <tr className="total-row"><td>Total vendido</td><td>${Number(summary.grand_total).toFixed(2)}</td></tr>
            </tbody>
          </table>

          {Object.keys(summary.payment_methods).length > 0 ? (
            <>
              <p><strong>Cobros por método:</strong></p>
              <table>
                <tbody>
                  {Object.entries(summary.payment_methods).map(([method, total]) => (
                    <tr key={method}>
                      <td style={{ textTransform: "capitalize" }}>{method}</td>
                      <td>${Number(total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      ) : null}

      <hr />
      <p><strong>Efectivo Contado:</strong></p>
      <table>
        <thead>
          <tr><th>Denom.</th><th>Cant.</th><th>Subtotal</th></tr>
        </thead>
        <tbody>
          {DENOMINATIONS.filter((d) => (counts[d.value] ?? 0) > 0).map((d) => (
            <tr key={d.value}>
              <td>{d.label}</td>
              <td>{counts[d.value]}</td>
              <td>${(d.value * (counts[d.value] ?? 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />

      <table>
        <tbody>
          <tr><td>Fondo inicial</td><td>${Number(session.opening_amount).toFixed(2)}</td></tr>
          <tr><td>Total contado</td><td>${denominationTotal.toFixed(2)}</td></tr>
          {expectedCash !== null ? (
            <tr><td>Efectivo esperado</td><td>${expectedCash.toFixed(2)}</td></tr>
          ) : null}
          {difference !== null ? (
            <tr className={`total-row ${difference < 0 ? "diff-negative" : difference > 0 ? "diff-positive" : ""}`}>
              <td>Diferencia</td>
              <td>{difference > 0 ? "+" : ""}${difference.toFixed(2)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {session.close_notes || summary?.closing_amount ? (
        <div style={{ marginTop: "12px", fontSize: "10px" }}>
          <strong>Observaciones:</strong><br />
          {session.close_notes || "Sin observaciones registradas."}
        </div>
      ) : null}
    </div>
  );
}
