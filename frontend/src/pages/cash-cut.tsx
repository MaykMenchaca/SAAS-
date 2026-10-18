import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Calendar } from "lucide-react";

import { qk } from "../api/query-keys";
import type { CashRegisterSession } from "../api/sales";
import { listSessions } from "../api/sales";
import { Badge, Button, Corners, EmptyState, ErrorState, PageHeader, SkeletonTable } from "../components/ui";
import { formatCurrency } from "../lib/formatters";
import { HistoryTable } from "./cash-cut/history-table";
import { SessionDetail } from "./cash-cut/session-detail";

type Tab = "corte" | "historial";

const TABS: { id: Tab; label: string }[] = [
  { id: "corte", label: "Corte actual" },
  { id: "historial", label: "Historial" },
];

function Header({ subtitle }: { subtitle: string }) {
  return <PageHeader className="mb-0" subtitle={subtitle} title="Corte de caja" />;
}

export function CashCutPage() {
  const [selectedSession, setSelectedSession] = useState<CashRegisterSession | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("corte");
  const [page, setPage] = useState(1);

  const sessionsQuery = useQuery({
    queryKey: qk.cashSessions(),
    // Las 100 sesiones más recientes (las abiertas siempre están entre ellas)
    queryFn: () => listSessions({ perPage: 100 }),
  });

  const openSessions = (sessionsQuery.data?.items ?? []).filter((s) => s.status === "abierta");
  const closedSessions = (sessionsQuery.data?.items ?? []).filter((s) => s.status === "cerrada");

  if (sessionsQuery.isLoading) {
    return (
      <div className="grid gap-6">
        <Header subtitle="Conteo de efectivo, cierre de turno e historial de arqueos" />
        <SkeletonTable cols={5} rows={4} />
      </div>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <div className="grid gap-6">
        <Header subtitle="Conteo de efectivo, cierre de turno e historial de arqueos" />
        <ErrorState onRetry={() => void sessionsQuery.refetch()} />
      </div>
    );
  }

  if (selectedSession) {
    return <SessionDetail onBack={() => setSelectedSession(null)} session={selectedSession} />;
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <Header subtitle="Conteo de efectivo, cierre de turno e historial de arqueos" />

      <div aria-label="Secciones del corte de caja" className="flex gap-7 overflow-x-auto border-b border-divider" role="tablist">
        {TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`-mb-px min-h-11 shrink-0 border-b-2 font-heading text-lg font-semibold transition-colors ${
              activeTab === tab.id ? "border-accent text-text" : "border-transparent text-ink-2 hover:text-text"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "corte" ? (
        openSessions.length > 0 ? (
          <section aria-label="Sesiones abiertas" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {openSessions.map((session) => (
              <div className="blueprint grid content-between gap-4 p-5" key={session.id}>
                <Corners />
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl">{session.cash_register_name}</h2>
                    <Badge dot tone="success">Abierta</Badge>
                  </div>
                  <div className="grid gap-1.5 text-sm text-ink-2">
                    <p>
                      Cajero: <span className="font-medium text-text">{session.username}</span>
                    </p>
                    <p>
                      Fondo de apertura:{" "}
                      <span className="font-medium tabular-nums text-text">{formatCurrency(session.opening_amount)}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Calendar aria-hidden="true" size={14} />
                      {new Date(session.opened_at).toLocaleString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <Button icon={<Calculator aria-hidden="true" size={16} />} onClick={() => setSelectedSession(session)}>
                  Realizar arqueo
                </Button>
              </div>
            ))}
          </section>
        ) : (
          <section className="blueprint">
            <Corners />
            <EmptyState
              actionHref="/pos"
              actionLabel="Abrir caja en el Punto de Venta"
              icon={<Calculator aria-hidden="true" size={32} />}
              message="No hay sesiones de caja abiertas en este momento. Abre una caja en el Punto de Venta para comenzar a registrar operaciones."
            />
          </section>
        )
      ) : (
        <HistoryTable onOpen={setSelectedSession} onPageChange={setPage} page={page} sessions={closedSessions} />
      )}
    </div>
  );
}
