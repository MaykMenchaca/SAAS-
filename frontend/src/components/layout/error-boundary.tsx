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
        <main className="grid min-h-screen place-items-center bg-neutral-bg p-8">
          <Card className="grid max-w-lg gap-6 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle aria-hidden="true" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-text-primary">Algo salió mal</h1>
              <p className="mt-2 text-sm leading-relaxed text-neutral-text-secondary">
                Ocurrió un error inesperado al mostrar esta sección.
                Recarga la página para continuar trabajando.
                Si el problema persiste, contacta al administrador.
              </p>
            </div>
            <Button className="mx-auto" onClick={() => window.location.reload()}>
              Recargar página
            </Button>
          </Card>
        </main>
      );
    }

    return this.props.children;
  }
}
