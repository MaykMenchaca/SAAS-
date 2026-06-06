import type { TableHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-auto rounded-lg border border-neutral-border bg-neutral-surface">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export const tableHeadClass = "sticky top-0 bg-neutral-bg text-xs font-semibold uppercase text-neutral-text-secondary";
export const tableCellClass = "border-b border-neutral-border px-3 py-2";
