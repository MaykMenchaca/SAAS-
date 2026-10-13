import { cn } from "../../lib/cn";

const STEPS = ["Buscar venta", "Seleccionar artículos", "Confirmación"];

/** Barra de tres pasos del flujo de devolución (Buscar → Seleccionar → Confirmar). */
export function StepBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Pasos de la devolución" className="grid grid-cols-1 border border-divider sm:grid-cols-3">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const current = step === n;
        const done = step > n;
        return (
          <li
            aria-current={current ? "step" : undefined}
            className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-divider sm:border-l sm:border-t-0", current && "bg-acc-tint")}
            key={label}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center border font-heading text-base font-semibold",
                done ? "border-accent bg-accent text-on-acc" : current ? "border-accent text-acc-text" : "border-divider text-ink-2",
              )}
            >
              {done ? "✓" : n}
            </span>
            <span className={cn("font-heading text-lg font-semibold", current || done ? "text-text" : "text-ink-2")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
