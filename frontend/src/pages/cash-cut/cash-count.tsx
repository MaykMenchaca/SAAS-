import { Minus, Plus } from "lucide-react";

import { Button, Corners, Input } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import type { Denomination, DenominationCount } from "./denominations";
import { DENOMINATIONS } from "./denominations";

type CashCountProps = {
  counts: DenominationCount;
  /** Total contado como texto del campo (vacío = sin captura). */
  total: string;
  totalAmount: number;
  /** Sesión cerrada: solo se muestra el total registrado. */
  readOnly: boolean;
  onCountChange: (value: number, count: number) => void;
  onReset: () => void;
  onTotalChange: (value: string) => void;
};

function DenominationRow({
  count,
  denomination,
  onChange,
}: {
  count: number;
  denomination: Denomination;
  onChange: (value: number, count: number) => void;
}) {
  const noun = denomination.type === "bill" ? "billetes" : "monedas";
  const sub = denomination.value * count;
  return (
    <div className="grid grid-cols-[4rem_auto_minmax(0,1fr)] items-center gap-2 border-b border-line-soft px-3 py-2 sm:gap-2.5 sm:px-4">
      <span className="font-heading text-xl font-semibold tabular-nums">{denomination.label}</span>
      <div className="flex">
        <Button
          aria-label={`Quitar uno de ${noun} de ${denomination.label}`}
          disabled={count === 0}
          onClick={() => onChange(denomination.value, count - 1)}
          size="sm"
          variant="icon"
        >
          <Minus aria-hidden="true" size={14} />
        </Button>
        <input
          aria-label={`Cantidad de ${noun} de ${denomination.label}`}
          className="min-h-11 w-12 border-y border-field-border bg-surface text-center text-base tabular-nums text-text focus-visible:border-accent focus-visible:outline-offset-0 lg:min-h-9"
          inputMode="numeric"
          min={0}
          onChange={(event) => onChange(denomination.value, Math.max(0, Math.floor(Number(event.target.value) || 0)))}
          placeholder="0"
          type="number"
          value={count || ""}
        />
        <Button
          aria-label={`Agregar uno de ${noun} de ${denomination.label}`}
          onClick={() => onChange(denomination.value, count + 1)}
          size="sm"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      <span className={`truncate text-right tabular-nums ${count ? "text-text" : "text-ink-2"}`}>{formatCurrency(sub)}</span>
    </div>
  );
}

/** Conteo de efectivo por denominaciones (billetes y monedas MXN) con el total contado. */
export function CashCount({ counts, onCountChange, onReset, onTotalChange, readOnly, total, totalAmount }: CashCountProps) {
  const groups: { title: string; items: Denomination[] }[] = [
    { title: "Billetes", items: DENOMINATIONS.filter((d) => d.type === "bill") },
    { title: "Monedas", items: DENOMINATIONS.filter((d) => d.type === "coin") },
  ];

  return (
    <section className="blueprint flex min-w-0 flex-col">
      <Corners />
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider px-4 py-3.5 sm:px-5">
        <h2 className="text-xl">{readOnly ? "Efectivo contado" : "Conteo de efectivo"}</h2>
        {readOnly ? null : (
          <Button onClick={onReset} size="sm" variant="ghost">Reiniciar conteo</Button>
        )}
      </header>

      {readOnly ? null : (
        <div className="@container">
          <div className="grid @xl:grid-cols-2">
          {groups.map((group, index) => (
            <div className={`flex flex-col ${index > 0 ? "@xl:border-l @xl:border-divider" : ""}`} key={group.title}>
              <h3 className="border-b border-line-soft px-4 py-2.5 font-heading text-sm font-semibold uppercase tracking-widest text-ink-2 sm:px-5">
                {group.title}
              </h3>
              {group.items.map((denomination) => (
                <DenominationRow
                  count={counts[denomination.value] ?? 0}
                  denomination={denomination}
                  key={denomination.value}
                  onChange={onCountChange}
                />
              ))}
            </div>
          ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
        <div className="w-full max-w-60">
          <Input
            disabled={readOnly}
            inputMode="decimal"
            label="Total contado en caja"
            min="0"
            name="counted_total"
            onChange={(event) => onTotalChange(event.target.value)}
            placeholder="0.00"
            step="0.01"
            type="number"
            value={total}
          />
        </div>
        <p className="text-right">
          <span className="block font-heading text-base font-semibold uppercase tracking-wider text-ink-2">Total contado</span>
          <span className="font-heading text-3xl font-semibold tabular-nums" data-testid="counted-total">{formatCurrency(totalAmount)}</span>
        </p>
      </div>
      {readOnly ? null : (
        <p className="px-4 pb-4 text-sm text-ink-2 sm:px-5">
          Cuenta billetes y monedas arriba, o captura el total directamente. No incluyas vales ni otros comprobantes.
        </p>
      )}
    </section>
  );
}
