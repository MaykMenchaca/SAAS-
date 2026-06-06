import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { AlertTriangle } from "lucide-react";

import { Button, Card } from "../ui";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-neutral-bg p-6">
          <Card className="grid max-w-md gap-4 p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-danger">
              <AlertTriangle aria-hidden="true" size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-neutral-text-primary">Error de pantalla</h1>
              <p className="mt-1 text-sm text-neutral-text-secondary">
                Recarga la vista para continuar trabajando.
              </p>
            </div>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </Card>
        </main>
      );
    }

    return this.props.children;
  }
}
