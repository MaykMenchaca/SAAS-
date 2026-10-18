import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/** Cajita de atajo de teclado (F2, F5, Ctrl K, Esc). Decorativa para lectores de pantalla si se pasa `aria-hidden`. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex min-h-5 min-w-6 items-center justify-center border border-divider px-1.5 font-sans text-xs text-ink-2",
        className,
      )}
      {...props}
    />
  );
}
