import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Calculator, CheckCircle2, DollarSign, Printer, ReceiptText } from "lucide-react";

import type { CashRegisterSession, SessionSummary } from "../api/sales";
import { closeCashRegister, getSessionSummary, listSessions } from "../api/sales";
import { Badge, Button, Card, Modal, Table, tableCellClass, tableHeadClass, Toast } from "../components/ui";

// ── Denomination Config ──────────────────────────────────────────

type Denomination = { label: string; value: number; type: "bill" | "coin" };

const DENOMINATIONS: Denomination[] = [
  { label: "$1,000", value: 1000, type: "bill" },
  { label: "$500", value: 500, type: "bill" },
  { label: "$200", value: 200, type: "bill" },
  { label: "$100", value: 100, type: "bill" },
  { label: "$50", value: 50, type: "bill" },
  { label: "$20", value: 20, type: "bill" },
  { label: "$10", value: 10, type: "coin" },
  { label: "$5", value: 5, type: "coin" },
  { label: "$2", value: 2, type: "coin" },
  { label: "$1", value: 1, type: "coin" },
  { label: "$0.50", value: 0.5, type: "coin" },
];

type DenominationCount = Record<number, number>;

function calcDenominationTotal(counts: DenominationCount): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d.value * (counts[d.value] ?? 0), 0);
}

// ── Main Page ────────────────────────────────────────────────────

export function CashCutPage() {
  const [selectedSession, setSelectedSession] = useState<CashRegisterSession | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: listSessions,
  });

  const openSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "abierta");
  const closedSessions = (sessionsQuery.data ?? [])
    .filter((s) => s.status === "cerrada")
    .slice(0, 10);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-text-primary">Corte de Caja</h1>
        <p className="text-sm text-neutral-text-secondary">
          Conteo de denominaciones, cierre de sesion y resumen
        </p>
      </div>

      {/* Open sessions — ready to close */}
      {openSessions.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold uppercase text-neutral-text-secondary">
            Sesiones abiertas
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {openSessions.map((session) => (
              <Card className="p-4" key={session.id}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-neutral-text-primary">
                    {session.cash_register_name}
                  </span>
                  <Badge tone="success">Abierta</Badge>
                </div>
                <div className="mb-3 grid gap-1 text-sm text-neutral-text-secondary">
                  <div>
                    Cajero: <span className="font-medium text-neutral-text-primary">{session.username}</span>
                  </div>
                  <div>
                    Apertura:{" "}
                    <span className="font-mono font-medium text-neutral-text-primary">
                      ${session.opening_amount}
                    </span>
                  </div>
                  <div>
                    {new Date(session.opened_at).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <Button
                  className="w-full"
                  icon={<Calculator aria-hidden="true" size={17} />}
                  onClick={() => setSelectedSession(session)}
                >
                  Hacer corte
                </Button>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Card className="p-8 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={36} />
          <p className="text-sm text-neutral-text-secondary">No hay sesiones abiertas</p>
        </Card>
      )}

      {/* Recent closed sessions */}
      {closedSessions.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold uppercase text-neutral-text-secondary">
            Sesiones recientes cerradas
          </h2>
          <Card className="overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Caja</th>
                  <th className={tableHeadClass}>Cajero</th>
                  <th className={`${tableHeadClass} text-right`}>Apertura</th>
                  <th className={`${tableHeadClass} text-right`}>Cierre</th>
                  <th className={`${tableHeadClass} text-right`}>Diferencia</th>
                  <th className={tableHeadClass}>Fecha cierre</th>
                  <th className={tableHeadClass}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {closedSessions.map((session) => {
                  const diff = Number(session.difference ?? 0);
                  return (
                    <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={session.id}>
                      <td className={tableCellClass}>
                        <span className="font-medium">{session.cash_register_name}</span>
                      </td>
                      <td className={tableCellClass}>{session.username}</td>
                      <td className={`${tableCellClass} text-right font-mono`}>
                        ${session.opening_amount}
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>
                        ${session.closing_amount}
                      </td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold ${diff < 0 ? "text-danger" : diff > 0 ? "text-warning" : ""}`}>
                        {diff > 0 ? "+" : ""}${diff.toFixed(2)}
                      </td>
                      <td className={`${tableCellClass} text-sm text-neutral-text-secondary`}>
                        {session.closed_at
                          ? new Date(session.closed_at).toLocaleString("es-MX", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className={tableCellClass}>
                        <Button
                          aria-label="Ver resumen"
                          className="h-11 w-11 px-0"
                          onClick={() => setSelectedSession(session)}
                          variant="secondary"
                        >
                          <ReceiptText aria-hidden="true" size={17} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </section>
      ) : null}

      {/* Cash Cut Modal */}
      {selectedSession ? (
        <CashCutModal
          onClose={() => setSelectedSession(null)}
          session={selectedSession}
        />
      ) : null}
    </div>
  );
}

// ── Cash Cut Modal ───────────────────────────────────────────────

function CashCutModal({
  session,
  onClose,
}: {
  session: CashRegisterSession;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const isOpen = session.status === "abierta";

  const [counts, setCounts] = useState<DenominationCount>(() => {
    const initial: DenominationCount = {};
    for (const d of DENOMINATIONS) initial[d.value] = 0;
    return initial;
  });
  const [closeNotes, setCloseNotes] = useState("");
  const [closed, setClosed] = useState(false);

  const denominationTotal = calcDenominationTotal(counts);

  const summaryQuery = useQuery({
    queryKey: ["session-summary", session.id],
    queryFn: () => getSessionSummary(session.id),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeCashRegister(session.id, denominationTotal.toFixed(2), closeNotes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["session-summary", session.id] });
      setClosed(true);
    },
  });

  const closeError = closeMutation.error
    ? closeMutation.error instanceof AxiosError
      ? closeMutation.error.response?.data?.error ?? "No se pudo cerrar la caja."
      : "No se pudo cerrar la caja."
    : "";

  const summary = summaryQuery.data;
  const expectedCash = summary?.expected_cash ? Number(summary.expected_cash) : null;
  const difference = expectedCash !== null ? denominationTotal - expectedCash : null;

  function setDenomCount(value: number, count: number) {
    setCounts((prev) => ({ ...prev, [value]: Math.max(0, count) }));
  }

  function handleClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    closeMutation.mutate();
  }

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Corte de Caja</title>
          <style>
            body { font-family: monospace; font-size: 12px; padding: 16px; max-width: 360px; margin: 0 auto; }
            h2 { text-align: center; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid #ddd; }
            td:last-child, th:last-child { text-align: right; }
            .total-row { font-weight: bold; border-top: 2px solid #000; }
            .diff-negative { color: red; }
            .diff-positive { color: green; }
            hr { border: none; border-top: 1px dashed #999; margin: 12px 0; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            {closed || !isOpen ? "Cerrar" : "Cancelar"}
          </Button>
          {(closed || !isOpen) ? (
            <Button icon={<Printer aria-hidden="true" size={17} />} onClick={handlePrint}>
              Imprimir corte
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      title={isOpen ? "Corte de caja" : `Resumen — ${session.cash_register_name}`}
    >
      <div className="grid gap-4">
        {/* Summary KPIs */}
        {summaryQuery.isLoading ? (
          <p className="py-4 text-center text-sm text-neutral-text-secondary">Cargando resumen...</p>
        ) : summary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Ventas" value={String(summary.sales_completed)} />
            <KpiCard label="Canceladas" value={String(summary.sales_cancelled)} />
            <KpiCard label="Total vendido" value={`$${summary.grand_total}`} />
            <KpiCard label="Apertura" value={`$${summary.opening_amount}`} />
          </div>
        ) : null}

        {/* Payment methods breakdown */}
        {summary?.payment_methods && Object.keys(summary.payment_methods).length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-text-secondary">
              Ventas por metodo de pago
            </p>
            <div className="grid gap-1.5">
              {Object.entries(summary.payment_methods).map(([method, total]) => (
                <div
                  className="flex items-center justify-between rounded-md border border-neutral-border px-3 py-2 text-sm"
                  key={method}
                >
                  <div className="flex items-center gap-2">
                    <DollarSign aria-hidden="true" className="text-neutral-text-secondary" size={15} />
                    <span className="capitalize">{method}</span>
                  </div>
                  <span className="font-mono font-semibold">${total}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Denomination counting (only for open sessions) */}
        {isOpen && !closed ? (
          <form className="grid gap-4" onSubmit={handleClose}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-text-secondary">
                Conteo de denominaciones
              </p>
              <div className="grid gap-1.5">
                {/* Bills */}
                <p className="text-xs font-medium text-neutral-text-secondary">Billetes</p>
                {DENOMINATIONS.filter((d) => d.type === "bill").map((d) => (
                  <DenominationRow
                    count={counts[d.value] ?? 0}
                    denomination={d}
                    key={d.value}
                    onChange={(count) => setDenomCount(d.value, count)}
                  />
                ))}
                {/* Coins */}
                <p className="mt-2 text-xs font-medium text-neutral-text-secondary">Monedas</p>
                {DENOMINATIONS.filter((d) => d.type === "coin").map((d) => (
                  <DenominationRow
                    count={counts[d.value] ?? 0}
                    denomination={d}
                    key={d.value}
                    onChange={(count) => setDenomCount(d.value, count)}
                  />
                ))}
              </div>
            </div>

            {/* Count total + difference */}
            <div className="rounded-md bg-neutral-text-primary px-4 py-3 text-white">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Total contado</span>
                <span className="font-mono font-bold">${denominationTotal.toFixed(2)}</span>
              </div>
              {expectedCash !== null ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Efectivo esperado</span>
                    <span className="font-mono">${expectedCash.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-slate-600 pt-1">
                    <span className="text-sm text-slate-300">Diferencia</span>
                    <span
                      className={`font-mono font-bold ${
                        difference !== null && difference < 0
                          ? "text-red-400"
                          : difference !== null && difference > 0
                            ? "text-yellow-300"
                            : "text-green-400"
                      }`}
                    >
                      {difference !== null && difference > 0 ? "+" : ""}
                      ${difference !== null ? difference.toFixed(2) : "0.00"}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            {/* Notes */}
            <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
              <span>Notas del corte (opcional)</span>
              <textarea
                className="min-h-16 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Observaciones..."
                value={closeNotes}
              />
            </label>

            {closeError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
                {closeError}
              </div>
            ) : null}

            <Button disabled={closeMutation.isPending} type="submit" variant="danger">
              {closeMutation.isPending ? "Cerrando..." : "Cerrar caja"}
            </Button>
          </form>
        ) : null}

        {/* Success message after closing */}
        {closed ? (
          <Toast tone="success">Caja cerrada correctamente. Puedes imprimir el corte.</Toast>
        ) : null}

        {/* Printable report (hidden, used for print) */}
        <div className="hidden">
          <div ref={printRef}>
            <PrintableCashCut
              counts={counts}
              denominationTotal={closed ? denominationTotal : Number(session.closing_amount ?? 0)}
              session={session}
              summary={summary ?? null}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Denomination Row ─────────────────────────────────────────────

function DenominationRow({
  denomination,
  count,
  onChange,
}: {
  denomination: Denomination;
  count: number;
  onChange: (count: number) => void;
}) {
  const lineTotal = denomination.value * count;

  return (
    <div className="flex items-center gap-3 rounded-md border border-neutral-border bg-neutral-surface px-3 py-1.5">
      <span className="w-16 text-sm font-semibold text-neutral-text-primary">
        {denomination.label}
      </span>
      <span className="text-xs text-neutral-text-secondary">×</span>
      <input
        className="h-8 w-16 rounded border border-neutral-border bg-neutral-bg text-center font-mono text-sm outline-none focus:border-primary"
        min="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        type="number"
        value={count || ""}
      />
      <span className="ml-auto font-mono text-sm text-neutral-text-secondary">
        = ${lineTotal.toFixed(2)}
      </span>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-center">
      <div className="text-xs text-neutral-text-secondary">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-bold text-neutral-text-primary">{value}</div>
    </div>
  );
}

// ── Printable Cash Cut Report ────────────────────────────────────

function PrintableCashCut({
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
  const expectedCash = summary?.expected_cash ? Number(summary.expected_cash) : null;
  const difference = expectedCash !== null ? denominationTotal - expectedCash : null;

  return (
    <div>
      <h2>CORTE DE CAJA</h2>
      <p style={{ textAlign: "center", marginBottom: "12px" }}>
        {session.cash_register_name}<br />
        Cajero: {session.username}<br />
        {session.closed_at
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
              <tr className="total-row"><td>Total vendido</td><td>${summary.grand_total}</td></tr>
            </tbody>
          </table>

          {Object.keys(summary.payment_methods).length > 0 ? (
            <>
              <p><strong>Desglose por metodo:</strong></p>
              <table>
                <tbody>
                  {Object.entries(summary.payment_methods).map(([method, total]) => (
                    <tr key={method}>
                      <td style={{ textTransform: "capitalize" }}>{method}</td>
                      <td>${total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </>
      ) : null}

      <hr />
      <p><strong>Conteo de denominaciones:</strong></p>
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
          <tr><td>Monto apertura</td><td>${session.opening_amount}</td></tr>
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
    </div>
  );
}
