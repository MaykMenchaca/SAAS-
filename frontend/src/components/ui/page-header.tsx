import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Encabezado de página Industry: título en Barlow Condensed de 38 px en escritorio (30 px en móvil)
 * con interlineado 1, y subtítulo en texto secundario. Es el único h1 de cada pantalla.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-3xl text-text lg:text-page">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 text-sm text-ink-2 lg:text-base">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
