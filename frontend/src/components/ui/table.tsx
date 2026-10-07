import type { TableHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-auto rounded-lg border border-neutral-border bg-neutral-surface">
      <table className={cn("w-full border-collapse text-left text-sm text-neutral-text-primary", className)} {...props} />
    </div>
  );
}

export const tableHeadClass = "sticky top-0 bg-neutral-bg px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-text-secondary border-b border-neutral-border-strong";
export const tableCellClass = "border-b border-neutral-border px-3 py-2 align-middle";
export const tableRowClass = "odd:bg-neutral-surface even:bg-neutral-bg/60 hover:bg-neutral-surface-raised/50 transition-colors duration-150";
