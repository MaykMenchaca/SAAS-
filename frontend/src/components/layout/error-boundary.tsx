import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { AlertTriangle } from "lucide-react";

import { isChunkLoadError } from "../../lib/lazy-with-retry";
import { Button, Card } from "../ui";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Al cambiar (p. ej. la ruta), el error se olvida y se vuelve a intentar mostrar el contenido (RF-52). */
  resetKey?: string;
  /** "page": dentro del shell (el menú sigue disponible). "full": toda la pantalla, último recurso. */
  variant?: "page" | "full";
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Antes el error quedaba "pegado": todas las pestañas mostraban el recuadro hasta recargar
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    const message = chunk
      ? "El sistema se actualizó o se reinició mientras esta ventana estaba abierta. Recarga la página para continuar."
      : "Ocurrió un error inesperado al mostrar esta sección. Recarga la página para continuar trabajando. Si el problema persiste, contacta al administrador.";

    const content = (
      <Card className="grid max-w-lg gap-6 p-8 text-center" role="alert">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border border-bad bg-bad-tint text-bad">
          <AlertTriangle aria-hidden="true" size={32} />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-[0.04em] text-text">Algo salió mal</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{message}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Recargar página</Button>
          {this.props.variant === "page" ? (
            <Button onClick={() => window.location.assign("/")} variant="secondary">
              Volver al inicio
            </Button>
          ) : null}
        </div>
        <details className="text-left text-xs text-ink-2">
          <summary className="cursor-pointer select-none">Detalle técnico (para soporte)</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words border border-divider p-2 [font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]">
            {`${error.name}: ${error.message}`}
          </pre>
        </details>
      </Card>
    );

    if (this.props.variant === "page") {
      return <div className="grid place-items-center py-12">{content}</div>;
    }
    return <main className="grid min-h-screen place-items-center bg-bg p-8">{content}</main>;
  }
}
