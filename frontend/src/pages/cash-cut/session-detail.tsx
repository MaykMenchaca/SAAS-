import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, CheckCircle2, Lock, Printer } from "lucide-react";
import { toast } from "sonner";

import { qk } from "../../api/query-keys";
import type { CashRegisterSession } from "../../api/sales";
import { closeCashRegister, getSessionSummary } from "../../api/sales";
import { Badge, Button, Corners, ErrorState, Modal, PageHeader, Skeleton } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { usePosStore } from "../../stores/pos-store";
import { CashCount } from "./cash-count";
import {
  calcDenominationTotal,
  cashDifference,
  differenceTone,
  emptyCounts,
  formatSigned,
} from "./denominations";
import type { DenominationCount, DifferenceTone } from "./denominations";
import { expectedCashOf, PrintableCashCut } from "./printable";

const TONE_CLASSES: Record<DifferenceTone, { box: string; label: string }> = {
  empty: { box: "border-divider text-ink-2", label: "Ingresa el monto contado" },
  ok: { box: "border-ok bg-ok-tint text-ok", label: "Cuadra" },
  short: { box: "border-bad bg-bad-tint text-bad", label: "Faltante" },
  over: { box: "border-warn bg-warn-tint text-warn", label: "Sobrante" },
};

function SummaryRow({ bold, label, muted, top, value }: { bold?: boolean; label: string; muted?: boolean; top?: boolean; value: string }) {
  return (
    <div className={`flex justify-between gap-3 px-4 py-1.5 sm:px-5 ${top ? "border-t border-divider" : ""} ${muted ? "text-ink-2" : "text-text"} ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function methodLabel(method: string) {
  return `Ventas con ${method === "transferencia" ? "transferencia" : method}`;
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Detalle de un turno: conteo de efectivo, resumen, observaciones y cierre con confirmación. */
export function SessionDetail({ onBack, session }: { onBack: () => void; session: CashRegisterSession }) {
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const isOpen = session.status === "abierta";

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("es-MX"));
  const [counts, setCounts] = useState<DenominationCount>(emptyCounts);
  const [manualTotal, setManualTotal] = useState<string>(() =>
    session.status === "cerrada" ? Number(session.closing_amount).toFixed(2) : "",
  );
  const [closeNotes, setCloseNotes] = useState(() => session.close_notes || "");
  const [closed, setClosed] = useState(!isOpen);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [acceptPending, setAcceptPending] = useState(false);

  useEffect(() => {
    if (closed) return;
    const interval = setInterval(() => setClock(new Date().toLocaleTimeString("es-MX")), 1000);
    return () => clearInterval(interval);
  }, [closed]);

  const countedTotal = manualTotal === "" ? 0 : parseFloat(manualTotal) || 0;

  const summaryQuery = useQuery({
    queryKey: qk.sessionSummary(session.id),
    queryFn: () => getSessionSummary(session.id),
  });

  // Ventas cobradas sin conexión en esta sesión que aún no llegan al servidor (OPS-07)
  const pendingOffline = usePosStore(
    (s) => s.offlineSalesQueue.filter((q) => q.sale.session_id === session.id).length,
  );

  const closeMutation = useMutation({
    mutationFn: () => closeCashRegister(session.id, countedTotal.toFixed(2), closeNotes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.cashSessions() });
      await queryClient.invalidateQueries({ queryKey: qk.sessionSummary(session.id) });
      if (usePosStore.getState().sessionId === session.id) {
        usePosStore.getState().clearSession();
      }
      setClosed(true);
      toast.success("Caja cerrada correctamente. Respaldo iniciado en segundo plano.");
    },
  });

  const closeError = closeMutation.error
    ? closeMutation.error instanceof AxiosError
      ? closeMutation.error.response?.data?.error ?? "No se pudo cerrar la caja."
      : "No se pudo cerrar la caja."
    : "";

  const summary = summaryQuery.data;
  const expectedCash = expectedCashOf(summary);
  const hasCount = manualTotal !== "";
  const difference = expectedCash !== null ? cashDifference(countedTotal, expectedCash) : null;
  const tone = differenceTone(difference, hasCount);
  const editable = isOpen && !closed;

  // Cobros en efectivo ajustados por devoluciones y otros movimientos: lo que falta para llegar al esperado del servidor
  const cashSales = Number(summary?.payment_methods?.efectivo || 0);
  const cashAdjustments =
    summary && expectedCash !== null ? cashDifference(expectedCash - Number(summary.opening_amount) - cashSales, 0) : 0;
  const otherMethods = Object.entries(summary?.payment_methods ?? {}).filter(([method]) => method !== "efectivo");

  function setDenomCount(value: number, count: number) {
    const next = { ...counts, [value]: Math.max(0, count) };
    setCounts(next);
    setManualTotal(calcDenominationTotal(next).toFixed(2));
  }

  function resetCount() {
    setCounts(emptyCounts());
    setManualTotal("");
  }

  function requestClose() {
    if (manualTotal === "" || countedTotal < 0) {
      toast.error("Por favor, ingresa el monto total contado en caja.");
      return;
    }
    setShowConfirmClose(true);
  }

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Corte de Caja - ${session.cash_register_name}</title>
          <style>
            body { font-family: monospace; font-size: 12px; padding: 16px; max-width: 340px; margin: 0 auto; line-height: 1.4; color: #111; }
            h2 { text-align: center; margin-bottom: 4px; font-size: 15px; font-weight: bold; }
            p { margin: 2px 0; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; }
            th, td { padding: 4px 0; text-align: left; border-bottom: 1px dashed #ddd; font-size: 11px; }
            td:last-child, th:last-child { text-align: right; }
            .total-row { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }
            .diff-negative { color: red; font-weight: bold; }
            .diff-positive { color: green; font-weight: bold; }
            hr { border: none; border-top: 1px dashed #666; margin: 10px 0; }
            .text-center { text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  const subtitle = `${session.cash_register_name} · Turno de ${session.username} · ${
    isOpen && !closed ? `abierto ${formatWhen(session.opened_at)}` : `cerrado ${formatWhen(session.closed_at)}`
  }`;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        actions={
          <>
            {closed ? (
              <Badge dot>Cerrado</Badge>
            ) : (
              <>
                <span className="text-sm tabular-nums text-ink-2">Hora actual: {clock}</span>
                <Badge dot tone="success">Turno abierto</Badge>
              </>
            )}
            <Button icon={<ArrowLeft aria-hidden="true" size={16} />} onClick={onBack} size="sm" variant="secondary">
              Volver a la lista
            </Button>
          </>
        }
        className="mb-0"
        subtitle={subtitle}
        title="Corte de caja"
      />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <CashCount
          counts={counts}
          onCountChange={setDenomCount}
          onReset={resetCount}
          onTotalChange={setManualTotal}
          readOnly={!editable}
          total={manualTotal}
          totalAmount={countedTotal}
        />

        <section className="blueprint flex min-w-0 flex-col xl:sticky xl:top-5">
          <Corners />
          <header className="border-b border-divider px-4 py-3.5 sm:px-5">
            <h2 className="text-xl">Resumen del turno</h2>
          </header>

          {summaryQuery.isLoading ? (
            <div className="grid gap-2 p-4 sm:p-5" role="status">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : summaryQuery.isError || !summary ? (
            <ErrorState message="No se pudo cargar el resumen del turno." onRetry={() => void summaryQuery.refetch()} />
          ) : (
            <div className="grid py-2">
              <SummaryRow label="Fondo inicial" value={formatCurrency(summary.opening_amount)} />
              <SummaryRow label="Ventas en efectivo" value={formatCurrency(cashSales)} />
              {Math.abs(cashAdjustments) >= 0.01 ? (
                <SummaryRow label="Devoluciones y ajustes en efectivo" value={formatSigned(cashAdjustments)} />
              ) : null}
              {otherMethods.map(([method, total], index) => (
                <SummaryRow key={method} label={methodLabel(method)} muted top={index === 0} value={formatCurrency(total)} />
              ))}
              <SummaryRow bold label="Total vendido en turno" top value={formatCurrency(summary.grand_total)} />
              <SummaryRow
                label="Transacciones"
                muted
                value={`${summary.sales_completed} (${summary.sales_cancelled} ${summary.sales_cancelled === 1 ? "cancelada" : "canceladas"})`}
              />
            </div>
          )}

          <div className="mx-4 mt-1 grid grid-cols-2 border border-divider sm:mx-5">
            <div className="min-w-0 px-3.5 py-3">
              <p className="text-sm text-ink-2">Efectivo esperado</p>
              <p className="truncate font-heading text-2xl font-semibold tabular-nums">{expectedCash !== null ? formatCurrency(expectedCash) : "—"}</p>
            </div>
            <div className="min-w-0 border-l border-divider px-3.5 py-3">
              <p className="text-sm text-ink-2">Contado</p>
              <p className="truncate font-heading text-2xl font-semibold tabular-nums">{formatCurrency(countedTotal)}</p>
            </div>
          </div>

          <div
            aria-live="polite"
            className={`mx-4 mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border px-4 py-3.5 sm:mx-5 ${TONE_CLASSES[tone].box}`}
            data-testid="difference-box"
          >
            <span className="font-heading text-base font-semibold uppercase tracking-wider">{TONE_CLASSES[tone].label}</span>
            <span className="font-heading text-4xl font-semibold leading-none tabular-nums">
              {tone === "empty" || difference === null ? "—" : formatSigned(difference)}
            </span>
          </div>

          <div className="grid gap-1.5 px-4 pt-4 sm:px-5">
            <label className="text-sm font-medium text-ink-2" htmlFor="close-notes">Observaciones</label>
            <textarea
              className="min-h-20 w-full border border-field-border bg-surface px-3 py-2 text-base text-text placeholder:text-ink-2 hover:border-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!editable}
              id="close-notes"
              onChange={(event) => setCloseNotes(event.target.value)}
              placeholder="Observaciones adicionales sobre faltantes, sobrantes o incidentes en el turno..."
              value={closeNotes}
            />
          </div>

          {closeError ? (
            <div className="mx-4 mt-3 border border-bad bg-bad-tint px-3 py-2.5 text-sm text-bad sm:mx-5" role="alert">
              {closeError}
            </div>
          ) : null}

          <div className="grid gap-2.5 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
            {editable ? (
              <Button disabled={closeMutation.isPending} frame icon={<Lock aria-hidden="true" size={17} />} onClick={requestClose} size="lg">
                {closeMutation.isPending ? "Procesando corte..." : "Cerrar turno e imprimir corte"}
              </Button>
            ) : (
              <Button icon={<Printer aria-hidden="true" size={17} />} onClick={handlePrint} size="lg">
                Imprimir comprobante de corte
              </Button>
            )}
            {isOpen && closed ? (
              <p className="flex items-center gap-1.5 text-sm text-ok" role="status">
                <CheckCircle2 aria-hidden="true" size={14} />
                Turno cerrado. Ya puedes imprimir el corte.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* Comprobante oculto: su HTML se copia a la ventana de impresión */}
      <div className="hidden">
        <div ref={printRef}>
          <PrintableCashCut
            counts={counts}
            denominationTotal={closed ? countedTotal : Number(session.closing_amount ?? 0)}
            session={session}
            summary={summary ?? null}
          />
        </div>
      </div>

      <Modal
        footer={
          <>
            <Button onClick={() => setShowConfirmClose(false)} variant="secondary">
              Cancelar
            </Button>
            <Button
              disabled={closeMutation.isPending || (pendingOffline > 0 && !acceptPending)}
              onClick={() => {
                closeMutation.mutate(undefined, {
                  onSuccess: () => setShowConfirmClose(false),
                });
              }}
              variant="danger"
            >
              {closeMutation.isPending ? "Cerrando turno..." : "Sí, cerrar turno"}
            </Button>
          </>
        }
        onClose={() => setShowConfirmClose(false)}
        open={showConfirmClose}
        title="Cerrar turno y bloquear caja"
      >
        <p className="text-ink-2">
          ¿Confirmas el cierre del turno con{" "}
          <span className="font-semibold tabular-nums text-text">{formatCurrency(countedTotal)}</span>{" "}
          contados? Esta acción no se puede deshacer. Al cerrar se inicia un respaldo en segundo plano.
        </p>
        {difference !== null && tone !== "ok" ? (
          <p className={`mt-3 text-sm font-medium ${tone === "short" ? "text-bad" : "text-warn"}`}>
            {tone === "short" ? "Faltante" : "Sobrante"} de {formatCurrency(Math.abs(difference))} contra el efectivo esperado.
          </p>
        ) : null}
        {pendingOffline > 0 ? (
          <div className="mt-3 grid gap-2 border border-warn bg-warn-tint px-3 py-2.5 text-sm text-warn" role="alert">
            <p className="font-semibold">
              {pendingOffline === 1
                ? "Hay 1 venta de este turno cobrada sin conexión que todavía no llega al servidor."
                : `Hay ${pendingOffline} ventas de este turno cobradas sin conexión que todavía no llegan al servidor.`}
            </p>
            <p>
              Si cierras ahora, el servidor las rechazará: no contarán en el corte ni descontarán inventario.
              Espera a que se sincronicen (indicador del encabezado) antes de cerrar.
            </p>
            <label className="flex min-h-11 items-center gap-2 font-medium text-text">
              <input
                checked={acceptPending}
                className="h-5 w-5 accent-bad"
                onChange={(event) => setAcceptPending(event.target.checked)}
                type="checkbox"
              />
              Entiendo, cerrar de todos modos
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
