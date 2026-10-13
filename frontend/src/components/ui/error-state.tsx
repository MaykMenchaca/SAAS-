import { AlertTriangle } from "lucide-react";

import { Button } from "./button";

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
};

/** Reusable error state for failed queries. */
export function ErrorState({
  message = "No se pudieron cargar los datos.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" role="alert">
      <AlertTriangle aria-hidden="true" className="text-bad" size={36} />
      <p className="text-sm font-medium text-ink-2">{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} variant="secondary">
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
