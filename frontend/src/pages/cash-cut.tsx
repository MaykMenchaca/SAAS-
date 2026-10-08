import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  ArrowLeft,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  CreditCard,
  DollarSign,
  Lock,
  Printer,
  ReceiptText,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import type { CashRegisterSession, SessionSummary } from "../api/sales";
import { closeCashRegister, getSessionSummary, listSessions } from "../api/sales";
import { usePosStore } from "../stores/pos-store";
import { Badge, Button, Card, ErrorState, Pagination, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";

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
  const [activeTab, setActiveTab] = useState<"corte" | "historial">("corte");
  const [page, setPage] = useState(1);

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: listSessions,
  });

  const openSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "abierta");
  const closedSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "cerrada");

  const itemsPerPage = 10;
  const totalPages = Math.ceil(closedSessions.length / itemsPerPage);
  const paginatedClosedSessions = closedSessions.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  if (sessionsQuery.isLoading) {
    return (
      <div className="grid gap-5">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Corte de Caja</h1>
          <p className="text-sm text-neutral-text-secondary">
            Conteo de denominaciones, cierre de sesión y resumen
          </p>
        </div>
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <div className="grid gap-5">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Corte de Caja</h1>
          <p className="text-sm text-neutral-text-secondary">
            Conteo de denominaciones, cierre de sesión y resumen
          </p>
        </div>
        <ErrorState onRetry={() => void sessionsQuery.refetch()} />
      </div>
    );
  }

  // Render detail view if a session is selected
  if (selectedSession) {
    return (
      <CashSessionDetailsView
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        closedSessions={closedSessions}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-text-primary">Corte de Caja</h1>
        <p className="text-sm text-neutral-text-secondary">
          Conteo de denominaciones, cierre de sesión e historial de arqueos
        </p>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "corte"
              ? "bg-neutral-surface text-primary shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("corte")}
          type="button"
        >
          <Calculator aria-hidden="true" size={16} />
          Arqueo de Turno
        </button>
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "historial"
              ? "bg-neutral-surface text-primary shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("historial")}
          type="button"
        >
          <ReceiptText aria-hidden="true" size={16} />
          Historial de Cortes
        </button>
      </nav>

      {activeTab === "corte" ? (
        openSessions.length > 0 ? (
          <section className="grid gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-text-secondary">
              Sesiones abiertas
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {openSessions.map((session) => (
                <Card className="p-5 flex flex-col justify-between border-neutral-border bg-neutral-surface shadow-sm" key={session.id}>
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-bold text-sm text-neutral-text-primary">
                        {session.cash_register_name}
                      </span>
                      <Badge tone="success" dot>Abierta</Badge>
                    </div>
                    <div className="mb-4 grid gap-1.5 text-xs text-neutral-text-secondary">
                      <div>
                        Cajero: <span className="font-semibold text-neutral-text-primary">{session.username}</span>
                      </div>
                      <div>
                        Fondo apertura:{" "}
                        <span className="font-mono font-bold text-neutral-text-primary">
                          ${Number(session.opening_amount).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-neutral-text-muted">
                        <Calendar size={12} />
                        <span>
                          {new Date(session.opened_at).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full mt-2"
                    icon={<Calculator aria-hidden="true" size={15} />}
                    onClick={() => setSelectedSession(session)}
                  >
                    Realizar arqueo
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        ) : (
          <Card className="p-8 text-center border-dashed border-neutral-border">
            <CheckCircle2 aria-hidden="true" className="mx-auto mb-2 text-neutral-text-muted" size={32} />
            <p className="text-sm text-neutral-text-secondary">No hay sesiones de caja abiertas en este momento.</p>
          </Card>
        )
      ) : (
        <section className="grid gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-text-secondary">
            Histórico de Cortes y Sesiones
          </h2>
          {closedSessions.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-neutral-border">
              <ReceiptText aria-hidden="true" className="mx-auto mb-2 text-neutral-text-muted" size={32} />
              <p className="text-sm text-neutral-text-secondary">No hay cortes de caja cerrados registrados.</p>
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden border-neutral-border bg-neutral-surface shadow-sm">
                <Table>
                  <caption className="sr-only">Tabla de sesiones de caja cerradas</caption>
                  <thead>
                    <tr>
                      <th className={tableHeadClass}>Caja</th>
                      <th className={tableHeadClass}>Cajero</th>
                      <th className={`${tableHeadClass} text-right`}>Fondo Apertura</th>
                      <th className={`${tableHeadClass} text-right`}>Efectivo Cerrado</th>
                      <th className={`${tableHeadClass} text-right`}>Diferencia</th>
                      <th className={tableHeadClass}>Fecha y Hora Cierre</th>
                      <th className={tableHeadClass}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedClosedSessions.map((session) => {
                      const diff = Number(session.difference ?? 0);
                      return (
                        <tr className={tableRowClass} key={session.id}>
                          <td className={tableCellClass}>
                            <span className="font-semibold text-neutral-text-primary">{session.cash_register_name}</span>
                          </td>
                          <td className={tableCellClass}>{session.username}</td>
                          <td className={`${tableCellClass} text-right font-mono font-medium text-neutral-text-secondary`}>
                            ${Number(session.opening_amount).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`${tableCellClass} text-right font-mono font-bold text-neutral-text-primary`}>
                            ${Number(session.closing_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`${tableCellClass} text-right font-mono font-semibold ${diff < 0 ? "text-danger" : diff > 0 ? "text-warning" : "text-success"}`}>
                            {diff > 0 ? "+" : ""}${diff.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`${tableCellClass} text-xs text-neutral-text-secondary`}>
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
                            <Tooltip content="Ver resumen de arqueo">
                              <Button
                                aria-label="Ver resumen de arqueo"
                                className="h-8 w-8 px-0 flex items-center justify-center"
                                onClick={() => setSelectedSession(session)}
                                variant="secondary"
                              >
                                <ReceiptText aria-hidden="true" size={15} />
                              </Button>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary mt-1">
                <span>Página {page} de {totalPages}</span>
                <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ── Cash Session Details View ────────────────────────────────────

function CashSessionDetailsView({
  session,
  onClose,
  closedSessions,
}: {
  session: CashRegisterSession;
  onClose: () => void;
  closedSessions: CashRegisterSession[];
}) {
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const isOpen = session.status === "abierta";

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("es-MX"));
  const [counts, setCounts] = useState<DenominationCount>(() => {
    const initial: DenominationCount = {};
    for (const d of DENOMINATIONS) initial[d.value] = 0;
    return initial;
  });

  const [manualTotal, setManualTotal] = useState<string>(() => {
    return session.status === "cerrada" ? Number(session.closing_amount).toFixed(2) : "";
  });
  const [closeNotes, setCloseNotes] = useState(() => session.close_notes || "");
  const [closed, setClosed] = useState(!isOpen);
  const [showDenominations, setShowDenominations] = useState(false);

  useEffect(() => {
    if (!closed) {
      const interval = setInterval(() => {
        setClock(new Date().toLocaleTimeString("es-MX"));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [closed]);

  const denominationSum = calcDenominationTotal(counts);
  const countedTotal = manualTotal === "" ? 0 : parseFloat(manualTotal) || 0;

  const summaryQuery = useQuery({
    queryKey: ["session-summary", session.id],
    queryFn: () => getSessionSummary(session.id),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeCashRegister(session.id, countedTotal.toFixed(2), closeNotes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["session-summary", session.id] });
      if (usePosStore.getState().sessionId === session.id) {
        usePosStore.getState().clearSession();
      }
      setClosed(true);
      toast.success("Caja cerrada correctamente. Turno finalizado.");
    },
  });

  const closeError = closeMutation.error
    ? closeMutation.error instanceof AxiosError
      ? closeMutation.error.response?.data?.error ?? "No se pudo cerrar la caja."
      : "No se pudo cerrar la caja."
    : "";

  const summary = summaryQuery.data;
  const expectedCash = summary
    ? summary.expected_cash !== null
      ? Number(summary.expected_cash)
      : Number(summary.opening_amount) + Number(summary.payment_methods?.efectivo || 0)
    : null;
  const difference = expectedCash !== null ? countedTotal - expectedCash : null;

  const setDenomCount = (value: number, count: number) => {
    const newCounts = { ...counts, [value]: Math.max(0, count) };
    setCounts(newCounts);
    setManualTotal(calcDenominationTotal(newCounts).toFixed(2));
  };

  const handleClose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (manualTotal === "" || countedTotal < 0) {
      toast.error("Por favor, ingresa el monto total contado en caja.");
      return;
    }
    closeMutation.mutate();
  };

  const handlePrint = () => {
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
  };

  // Determine dynamic warning banner values
  let bannerBg = "bg-neutral-bg/60 dark:bg-neutral-bg/20 border border-neutral-border";
  let labelText = "Ingresa el monto contado para ver la diferencia";
  let valColor = "text-neutral-text-muted";
  let labelColor = "text-neutral-text-secondary";
  let diffDisplay = "—";

  if (manualTotal !== "") {
    if (difference !== null) {
      if (Math.abs(difference) < 0.01) {
        bannerBg = "bg-success/10 dark:bg-success/20 border border-success/20";
        labelText = "La caja cuadra perfectamente";
        labelColor = "text-success";
        valColor = "text-success font-bold";
        diffDisplay = "$0.00";
      } else if (difference < 0) {
        bannerBg = "bg-danger/10 dark:bg-danger/20 border border-danger/20";
        labelText = "Faltante en caja (Arqueo menor al esperado)";
        labelColor = "text-danger";
        valColor = "text-danger font-bold";
        diffDisplay = `-$${Math.abs(difference).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        bannerBg = "bg-warning/10 dark:bg-warning/20 border border-warning/20";
        labelText = "Sobrante en caja (Arqueo mayor al esperado)";
        labelColor = "text-warning";
        valColor = "text-warning font-bold";
        diffDisplay = `+$${difference.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  }

  return (
    <div className="grid gap-6">
      {/* Dynamic Navigation Breadcrumb & Back Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-neutral-text-muted">
            <span>Corte de caja</span>
            <ChevronRight size={12} />
            <span className="font-semibold text-neutral-text-primary">Sesión {session.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="secondary" className="h-8 px-2.5 flex items-center gap-1.5 text-xs">
              <ArrowLeft size={14} /> Volver a la lista
            </Button>
            <h1 className="text-xl font-bold text-neutral-text-primary tracking-tight">
              {isOpen && !closed ? "Arqueo de Turno Activo" : `Arqueo Finalizado · ID: ${session.id}`}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!closed ? (
            <>
              <span className="font-mono text-xs text-neutral-text-secondary bg-neutral-surface border border-neutral-border px-3 py-1.5 rounded shadow-sm">
                Hora actual: {clock}
              </span>
              <Badge tone="success" dot>Turno abierto</Badge>
            </>
          ) : (
            <Badge tone="neutral" dot>Cerrado</Badge>
          )}
        </div>
      </div>

      {/* Summary KPI Block */}
      {summaryQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-neutral-surface border border-neutral-border rounded-lg p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Ventas del Turno"
            value={`$${Number(summary.grand_total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
            meta={`${summary.sales_completed} transacciones (${summary.sales_cancelled} canceladas)`}
          />
          <StatCard
            label="Fondo Inicial (Apertura)"
            value={`$${Number(summary.opening_amount).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
            meta="Registrado al abrir caja"
          />
          <StatCard
            label="Efectivo Esperado"
            value={`$${expectedCash !== null ? expectedCash.toLocaleString("es-MX", { minimumFractionDigits: 2 }) : "0.00"}`}
            meta="Monto inicial + ventas en efectivo"
          />
        </div>
      ) : null}

      {/* Double Column Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left Column: Count Calculator / Closed View */}
        <Card className="border-neutral-border bg-neutral-surface shadow-sm overflow-hidden">
          <div className="border-b border-neutral-border px-5 py-4">
            <h2 className="text-sm font-semibold text-neutral-text-primary">Arqueo de Efectivo</h2>
            <p className="text-xs text-neutral-text-secondary mt-0.5">
              {isOpen && !closed
                ? "Cuenta el dinero en el cajón de monedas y billetes, luego digita el total."
                : "Resumen del arqueo final registrado."}
            </p>
          </div>

          <form onSubmit={handleClose} className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-neutral-text-secondary uppercase tracking-wider mb-2">
                Total contado en caja
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-neutral-text-muted font-mono">
                  $
                </span>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  disabled={!isOpen || closed}
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  className="w-full bg-neutral-bg border border-neutral-border focus:bg-neutral-surface focus:border-primary rounded-lg py-3.5 pl-10 pr-5 text-3xl font-bold font-mono text-neutral-text-primary outline-none transition-colors duration-150 ease-[var(--ease-out-strong)] disabled:opacity-85 disabled:cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-neutral-text-muted mt-2">
                Ingresa el efectivo sumado del cajón de cambio. No incluyas vales ni otros comprobantes.
              </p>
            </div>

            {/* Warn Banner */}
            <div className={`flex items-center justify-between p-4 rounded-lg transition-colors ${bannerBg}`}>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}>
                  {labelText}
                </p>
                {expectedCash !== null && (
                  <p className="text-[11px] text-neutral-text-muted mt-0.5 font-mono">
                    Esperado: ${expectedCash.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <span className={`text-xl font-bold font-mono ${valColor}`}>
                {diffDisplay}
              </span>
            </div>

            {/* Denomination Expand Trigger (Only show if open/editing) */}
            {isOpen && !closed && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowDenominations(!showDenominations)}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover select-none outline-none"
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${showDenominations ? "rotate-180" : ""}`}
                  />
                  <span>Desglose manual por billetes/monedas</span>
                </button>

                {showDenominations && (
                  <div className="border-t border-neutral-border mt-4 pt-4 space-y-4">
                    <p className="text-xs font-semibold text-neutral-text-secondary uppercase tracking-wider">
                      Desglose de efectivo
                    </p>
                    <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
                      {DENOMINATIONS.map((d) => {
                        const count = counts[d.value] ?? 0;
                        const sub = d.value * count;
                        return (
                          <div key={d.value} className="grid grid-cols-[80px_1fr_100px] items-center gap-3 bg-neutral-bg/40 px-3 py-1 rounded border border-neutral-border/50">
                            <span className="font-mono text-xs font-semibold text-neutral-text-primary">
                              {d.label}
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={count || ""}
                              onChange={(e) => setDenomCount(d.value, Math.max(0, Number(e.target.value) || 0))}
                              className="text-center font-mono text-xs py-1 border border-neutral-border rounded bg-neutral-surface focus:border-primary outline-none transition-colors"
                            />
                            <span className="font-mono text-xs text-neutral-text-secondary text-right">
                              ${sub.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-neutral-border">
                      <span className="text-xs font-bold text-neutral-text-primary">Total desglosado</span>
                      <span className="font-mono text-sm font-bold text-neutral-text-primary">
                        ${denominationSum.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Note Textarea */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-neutral-text-secondary uppercase tracking-wider">
                Notas y observaciones
              </label>
              <textarea
                rows={2}
                disabled={!isOpen || closed}
                placeholder="Observaciones adicionales sobre faltantes, sobrantes o incidentes en el turno..."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="w-full border border-neutral-border rounded-md px-3 py-2 text-xs bg-neutral-bg focus:bg-neutral-surface focus:border-primary outline-none transition-colors duration-150 ease-[var(--ease-out-strong)] disabled:opacity-85 disabled:cursor-not-allowed"
              />
            </div>

            {closeError && (
              <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded font-medium">
                {closeError}
              </div>
            )}

            {/* Form Actions */}
            <div className="pt-2">
              {isOpen && !closed ? (
                <Button
                  className="w-full h-11 flex items-center justify-center gap-2"
                  variant="danger"
                  type="submit"
                  disabled={closeMutation.isPending}
                >
                  <Lock size={15} />
                  <span>{closeMutation.isPending ? "Procesando corte..." : "Cerrar Turno y Bloquear Caja"}</span>
                </Button>
              ) : (
                <Button
                  className="w-full h-11 flex items-center justify-center gap-2"
                  variant="primary"
                  type="button"
                  onClick={handlePrint}
                >
                  <Printer size={15} />
                  <span>Imprimir Comprobante de Corte</span>
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* Right Column Stack: Payment Breakdown & Session History context */}
        <div className="space-y-6">
          {/* Card: Payment method breakdown */}
          <Card className="border-neutral-border bg-neutral-surface shadow-sm overflow-hidden">
            <div className="border-b border-neutral-border px-5 py-4">
              <h2 className="text-sm font-semibold text-neutral-text-primary">Ventas por Método</h2>
              <p className="text-xs text-neutral-text-secondary mt-0.5">Distribución de cobros del turno.</p>
            </div>
            <div>
              {summaryQuery.isLoading ? (
                <p className="p-5 text-center text-xs text-neutral-text-secondary">Cargando desglose...</p>
              ) : summary?.payment_methods && Object.keys(summary.payment_methods).length > 0 ? (
                <div className="divide-y divide-neutral-border">
                  {Object.entries(summary.payment_methods).map(([method, total]) => (
                    <div
                      className="flex items-center justify-between px-5 py-3.5 text-xs"
                      key={method}
                    >
                      <div className="flex items-center gap-2">
                        {getMethodIcon(method)}
                        <span className="capitalize font-semibold text-neutral-text-secondary">{method}</span>
                      </div>
                      <span className="font-mono font-bold text-neutral-text-primary">
                        ${Number(total).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-5 py-4 bg-neutral-bg/40 text-xs">
                    <span className="font-bold text-neutral-text-primary">Total Recaudado</span>
                    <span className="font-mono font-bold text-success text-sm">
                      ${Number(summary.grand_total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-5 text-center text-xs text-neutral-text-muted">No se registran transacciones de venta en este turno.</div>
              )}
            </div>
          </Card>

          {/* Card: Recent closed sessions as sidebar history references */}
          {closedSessions.length > 0 && (
            <Card className="border-neutral-border bg-neutral-surface shadow-sm overflow-hidden">
              <div className="border-b border-neutral-border px-5 py-4">
                <h2 className="text-sm font-semibold text-neutral-text-primary">Cortes Anteriores</h2>
                <p className="text-xs text-neutral-text-secondary mt-0.5">Historial de turnos recientes.</p>
              </div>
              <div className="divide-y divide-neutral-border max-h-[260px] overflow-y-auto">
                {closedSessions.slice(0, 4).map((s) => {
                  const diff = Number(s.difference ?? 0);
                  const isOk = Math.abs(diff) < 0.01;
                  return (
                    <div key={s.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-neutral-text-primary">{s.cash_register_name}</p>
                        <p className="text-[10px] text-neutral-text-muted mt-0.5">{s.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-neutral-text-primary">
                          ${Number(s.closing_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </p>
                        <span className={`inline-block text-[10px] font-bold mt-1 px-1.5 py-0.25 rounded-full ${isOk ? "bg-success/10 text-success" : diff < 0 ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                          {isOk ? "OK" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Hidden printable receipt wrapper */}
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
  const expectedCash = summary
    ? summary.expected_cash !== null
      ? Number(summary.expected_cash)
      : Number(summary.opening_amount) + Number(summary.payment_methods?.efectivo || 0)
    : null;
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
              <tr className="total-row"><td>Total vendido</td><td>\${Number(summary.grand_total).toFixed(2)}</td></tr>
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
                      <td>\${Number(total).toFixed(2)}</td>
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
              <td>\${(d.value * (counts[d.value] ?? 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />

      <table>
        <tbody>
          <tr><td>Fondo inicial</td><td>\${Number(session.opening_amount).toFixed(2)}</td></tr>
          <tr><td>Total contado</td><td>\${denominationTotal.toFixed(2)}</td></tr>
          {expectedCash !== null ? (
            <tr><td>Efectivo esperado</td><td>\${expectedCash.toFixed(2)}</td></tr>
          ) : null}
          {difference !== null ? (
            <tr className={`total-row \${difference < 0 ? "diff-negative" : difference > 0 ? "diff-positive" : ""}`}>
              <td>Diferencia</td>
              <td>{difference > 0 ? "+" : ""}\${difference.toFixed(2)}</td>
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

// ── Helper Sub-Components ────────────────────────────────────────

function StatCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="bg-neutral-surface border border-neutral-border rounded-lg p-5 shadow-sm">
      <div className="text-[10px] font-bold text-neutral-text-secondary uppercase tracking-widest mb-2">
        {label}
      </div>
      <div className="font-mono text-2xl font-bold text-neutral-text-primary tracking-tight leading-none mb-1.5">
        {value}
      </div>
      <div className="text-xs text-neutral-text-muted">{meta}</div>
    </div>
  );
}

function getMethodIcon(method: string) {
  const m = method.toLowerCase();
  if (m.includes("efectivo")) return <Coins size={14} className="text-neutral-text-muted" />;
  if (m.includes("tarjeta")) return <CreditCard size={14} className="text-neutral-text-muted" />;
  if (m.includes("transfer")) return <Send size={14} className="text-neutral-text-muted" />;
  return <DollarSign size={14} className="text-neutral-text-muted" />;
}
