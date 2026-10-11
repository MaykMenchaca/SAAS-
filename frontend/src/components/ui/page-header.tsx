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
 * Standard accessible PageHeader following MASTER design hierarchy.
 * Scales h1 to 24px (text-2xl) on mobile / 30px (text-3xl) on large screens.
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
        <h1 className="text-2xl font-bold tracking-tight text-neutral-text-primary lg:text-3xl truncate">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-xs text-neutral-text-secondary lg:text-sm">
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
