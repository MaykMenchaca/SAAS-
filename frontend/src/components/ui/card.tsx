import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { Corners } from "./corners";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Marcas de registro "+" en las esquinas (paneles destacados: totales, diálogos, formularios principales). */
  frame?: boolean;
};

/** Panel Industry: transparente, borde fino, sin sombra ni esquinas redondeadas. */
export function Card({ children, className, frame, ...props }: CardProps) {
  return (
    <section className={cn("border border-divider text-text", frame && "blueprint", className)} {...props}>
      {frame ? <Corners /> : null}
      {children}
    </section>
  );
}
