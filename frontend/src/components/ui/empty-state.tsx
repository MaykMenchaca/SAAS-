import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "./button";

type EmptyStateProps = {
  actionHref?: string;
  actionLabel?: string;
  icon?: ReactNode;
  message: string;
  onAction?: () => void;
};

/** Reusable empty state for tables/lists with optional CTA. */
export function EmptyState({
  actionHref,
  actionLabel,
  icon,
  message,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" role="status">
      {icon ? (
        <span className="text-ink-2">{icon}</span>
      ) : null}
      <p className="text-sm text-ink-2">{message}</p>
      {actionLabel && actionHref ? (
        <Link to={actionHref}>
          <Button variant="secondary">{actionLabel}</Button>
        </Link>
      ) : actionLabel && onAction ? (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
