import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowRight } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { qk } from "../../api/query-keys";
import { listCashRegisters, listSessions, openCashRegister } from "../../api/sales";
import { Badge, Button, Corners, Input, Select } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { useAuthStore } from "../../stores/auth-store";
import { usePosStore } from "../../stores/pos-store";

function openedAt(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Abre una caja para vender": unirse a una sesión abierta o abrir una nueva (diseño Industry, subfase 4.1). */
export function SessionSelector() {
  const user = useAuthStore((s) => s.user);
  const setSession = usePosStore((s) => s.setSession);
  const [openingAmount, setOpeningAmount] = useState("0.00");
  const [selectedRegisterId, setSelectedRegisterId] = useState<number | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState("");

  const sessionsQuery = useQuery({
    queryKey: qk.cashSessions("abierta"),
    // Solo las abiertas: la paginación no debe esconder la sesión del cajero
    queryFn: () => listSessions({ status: "abierta" }),
  });

  const registersQuery = useQuery({
    queryKey: qk.cashRegisters(),
    queryFn: listCashRegisters,
  });

  const canSupervise = user?.role === "admin" || user?.permissions?.includes("caja:supervisar");
  const openSessions = (sessionsQuery.data?.items ?? []).filter((s) => {
    if (s.status !== "abierta") return false;
    if (canSupervise) return true;
    return s.user_id === user?.id;
  });
  const registers = registersQuery.data ?? [];

  // Selecciona la primera caja en cuanto cargan
  useEffect(() => {
    if (registers.length > 0 && selectedRegisterId === null) {
      setSelectedRegisterId(registers[0].id);
    }
  }, [registers, selectedRegisterId]);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRegisterId) return;
    setError("");
    setIsOpening(true);
    try {
      const session = await openCashRegister(selectedRegisterId, openingAmount);
      setSession(session.id, session.cash_register_name);
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.error ?? "No se pudo abrir la caja.");
      } else {
        setError("No se pudo abrir la caja.");
      }
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-4rem)] place-items-center p-6 sm:p-10">
      <div className="flex w-full max-w-[460px] flex-col gap-5">
        <div>
          <div className="font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-acc-text">Punto de venta</div>
          <h1 className="mt-1.5 text-[2.5rem] leading-none">Abre una caja para vender</h1>
        </div>

        {openSessions.length > 0 ? (
          <section aria-label="Sesiones abiertas" className="blueprint flex flex-col">
            <Corners />
            <h2 className="border-b border-divider px-4 py-3 text-[1.0625rem]">Sesiones abiertas</h2>
            {openSessions.map((session) => (
              <button
                className="flex min-h-14 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-line-soft"
                key={session.id}
                onClick={() => setSession(session.id, session.cash_register_name)}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{session.cash_register_name}</div>
                  <div className="text-[0.8125rem] text-ink-2">
                    {session.username} · Apertura {formatCurrency(session.opening_amount)} · {openedAt(session.opened_at)}
                  </div>
                </div>
                <Badge tone="success">Abierta</Badge>
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ))}
          </section>
        ) : null}

        <section aria-label="Abrir nueva sesión" className="blueprint flex flex-col gap-3.5 p-4">
          <Corners />
          <h2 className="text-[1.0625rem]">Abrir nueva sesión</h2>
          <form className="grid gap-3.5" onSubmit={handleOpen}>
            <Select
              disabled={registersQuery.isLoading}
              label="Caja registradora"
              name="register-select"
              onChange={(e) => setSelectedRegisterId(Number(e.target.value))}
              options={registers.map((r) => ({ label: r.name, value: r.id }))}
              placeholder={registersQuery.isLoading ? "Cargando cajas…" : registers.length === 0 ? "No hay cajas disponibles" : undefined}
              value={selectedRegisterId ?? ""}
            />
            <Input
              className="text-lg tabular-nums"
              inputMode="decimal"
              label="Fondo de apertura"
              min="0"
              name="opening_amount"
              onChange={(e) => setOpeningAmount(e.target.value)}
              step="0.01"
              type="number"
              value={openingAmount}
            />
            <Button className="h-11 text-base" disabled={isOpening || !selectedRegisterId} frame type="submit">
              {isOpening ? "Abriendo…" : "Abrir caja"}
            </Button>
            {error ? (
              <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
                {error}
              </div>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
