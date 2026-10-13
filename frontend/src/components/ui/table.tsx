import type { TableHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/**
 * Tabla Industry: marco de línea fina, sin relleno ni sombra. El degradado de fondo (`local`/`scroll`)
 * deja una sombra a los lados cuando la tabla se desplaza horizontalmente (móvil); las "tapas" usan
 * el color de fondo de la página.
 */
export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative overflow-x-auto border border-divider [background:linear-gradient(to_right,var(--color-bg),var(--color-bg)),linear-gradient(to_right,var(--color-bg),var(--color-bg)),linear-gradient(to_right,rgba(0,0,0,0.1),rgba(0,0,0,0)),linear-gradient(to_left,rgba(0,0,0,0.1),rgba(0,0,0,0))] [background-position:left_center,right_center,left_center,right_center] [background-repeat:no-repeat] [background-size:24px_100%,24px_100%,12px_100%,12px_100%] [background-attachment:local,local,scroll,scroll]">
      <table className={cn("w-full border-collapse text-left text-sm text-text", className)} {...props} />
    </div>
  );
}

/** Encabezado: mayúsculas pequeñas con interletraje y regla inferior. */
export const tableHeadClass = "sticky top-0 bg-bg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-2 border-b border-divider";
/** Celda: regla suave entre filas. */
export const tableCellClass = "border-b border-line-soft px-3 py-2.5 align-middle";
/** Fila: sin zebra, solo tinte al pasar el cursor. */
export const tableRowClass = "hover:bg-line-soft transition-colors duration-150";
/** Celdas numéricas (montos, cantidades): alineadas a la derecha con cifras tabulares. */
export const tableNumClass = "text-right tabular-nums";
