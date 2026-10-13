import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { CircleCheck, Lock, X } from "lucide-react";

import type { AdjustReason, StockAdjustPayload, StockItem, StockMovement } from "../../api/inventory";
import { ADJUST_REASONS, adjustStock, listMovements } from "../../api/inventory";
import { qk } from "../../api/query-keys";
import { Button, Card, Input, Select } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatStock } from "../../lib/formatters";
import { formatDelta, quantityDelta } from "./stock-level";

const TYPE_LABELS: Record<string, string> = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };
const REF_LABELS: Record<string, string> = {
  venta: "Venta",
  compra: "Compra",
  ajuste_manual: "Ajuste manual",
  cancelacion: "Cancelación",
  devolucion: "Devolución",
  conteo: "Conteo físico",
};

type StockPanelProps = {
  canAdjust: boolean;
  item: StockItem;
  onAdjusted: () => void | Promise<void>;
  onClose: () => void;
};

/** Panel lateral: ajustar el stock de un producto (con motivo) y ver sus movimientos recientes. */
export function StockPanel({ canAdjust, item, onAdjusted, onClose }: StockPanelProps) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [reason, setReason] = useState<AdjustReason | "">("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  const movementsQuery = useQuery({
    queryKey: qk.movements(item.product_id),
    queryFn: () => listMovements(item.product_id, 8),
  });

  const mutation = useMutation({
    mutationFn: (payload: StockAdjustPayload) => adjustStock(payload),
    onSuccess: async () => {
      await onAdjusted();
      setDone(true);
      setNotes("");
      setReason("");
    },
  });

  const delta = quantityDelta(quantity, item.quantity);
  const canSubmit = Boolean(quantity) && Boolean(reason) && !mutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !reason) return;
    setDone(false);
    mutation.mutate({
      product_id: item.product_id,
      quantity,
      reason,
      notes: notes.trim() || undefined,
    });
  }

  const errorMessage = mutation.error
    ? mutation.error instanceof AxiosError
      ? mutation.error.response?.data?.error ?? "No se pudo ajustar."
      : "No se pudo ajustar."
    : "";

  const movements = movementsQuery.data ?? [];

  return (
    <Card aria-label="Panel de inventario" className="flex flex-col" frame>
      <header className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3.5">
        <div className="min-w-0">
          <div className="font-heading text-sm font-semibold uppercase tracking-widest text-acc-text">{item.sku}</div>
          <h2 className="mt-0.5 break-words text-2xl leading-tight">{item.product_name}</h2>
        </div>
        <Button aria-label="Cerrar panel" onClick={onClose} variant="icon">
          <X aria-hidden="true" size={16} />
        </Button>
      </header>

      {canAdjust ? (
        <form className="grid gap-3 border-b border-divider px-4 py-4" id="adjust-form" onSubmit={handleSubmit}>
          <h3 className="font-heading text-base font-semibold">Ajustar stock</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5 text-sm font-medium text-ink-2">
              <span>Actual</span>
              <div className="flex min-h-11 items-center border border-divider px-3 text-base tabular-nums text-text">
                {formatStock(item.quantity)} {item.unit_abbreviation}
              </div>
            </div>
            <Input
              className="tabular-nums"
              label="Nueva cantidad"
              min="0"
              name="quantity"
              onChange={(e) => {
                setQuantity(e.target.value);
                setDone(false);
              }}
              step="0.001"
              type="number"
              value={quantity}
            />
          </div>
          <Select
            label="Motivo"
            name="reason"
            onChange={(e) => setReason(e.target.value as AdjustReason | "")}
            options={ADJUST_REASONS.map((r) => ({ label: r.label, value: r.value }))}
            placeholder="Selecciona un motivo"
            value={reason}
          />
          <label className="grid gap-1.5 text-sm font-medium text-ink-2">
            <span>Notas (opcional)</span>
            <textarea
              className="min-h-16 w-full border border-field-border bg-surface px-3 py-2 text-base text-text placeholder:text-ink-2 hover:border-text focus-visible:border-accent focus-visible:outline-offset-0"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalle del ajuste..."
              value={notes}
            />
          </label>
          {errorMessage ? (
            <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
              {errorMessage}
            </div>
          ) : null}
          <Button disabled={!canSubmit} frame type="submit">
            {mutation.isPending ? "Guardando" : `Aplicar ajuste${delta != null && delta !== 0 ? ` (${formatDelta(delta)})` : ""}`}
          </Button>
          {done ? (
            <p className="flex items-center gap-1.5 text-sm text-ok" role="status">
              <CircleCheck aria-hidden="true" size={14} />
              Ajuste registrado en movimientos.
            </p>
          ) : null}
        </form>
      ) : (
        <p className="flex items-center gap-1.5 border-b border-divider px-4 py-3.5 text-sm text-ink-2">
          <Lock aria-hidden="true" size={14} />
          Existencias: {formatStock(item.quantity)} {item.unit_abbreviation}. Tu rol no puede ajustar existencias.
        </p>
      )}

      <section className="py-3">
        <h3 className="px-4 pb-1.5 font-heading text-base font-semibold">Movimientos recientes</h3>
        {movementsQuery.isLoading ? (
          <p className="px-4 py-4 text-sm text-ink-2">Cargando...</p>
        ) : movementsQuery.isError ? (
          <p className="px-4 py-4 text-sm text-bad" role="alert">
            No se pudieron cargar los movimientos.
          </p>
        ) : movements.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-2">Sin movimientos registrados.</p>
        ) : (
          <ul>
            {movements.map((m: StockMovement) => {
              const change = Math.round((Number(m.new_stock) - Number(m.previous_stock)) * 1000) / 1000;
              return (
                <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-line-soft px-4 py-2" key={m.id}>
                  <span className="font-medium">{TYPE_LABELS[m.movement_type] ?? m.movement_type}</span>
                  <span className={cn("text-right font-medium tabular-nums", change < 0 ? "text-bad" : change > 0 ? "text-ok" : "text-ink-2")}>
                    {formatDelta(change)}
                  </span>
                  <span className="min-w-0 break-words text-xs text-ink-2">
                    {REF_LABELS[m.reference_type] ?? m.reference_type} ·{" "}
                    {new Date(m.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {m.username ? ` · ${m.username}` : ""}
                  </span>
                  <span className="text-right text-xs tabular-nums text-ink-2">
                    {formatStock(m.previous_stock)} → {formatStock(m.new_stock)}
                  </span>
                  {m.notes ? <span className="col-span-2 break-words text-xs text-ink-2">{m.notes}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
