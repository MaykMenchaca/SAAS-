import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";

import { isChunkLoadError, lazyWithRetry } from "../../../lib/lazy-with-retry";
import { ErrorBoundary } from "../error-boundary";

function Rota(): never {
  throw new Error("fallo al pintar Compras");
}

describe("ErrorBoundary por página (RF-52)", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("muestra el recuadro con el detalle técnico y, al cambiar de ruta, se reinicia", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/compras" variant="page"><Rota /></ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Algo salió mal");
    expect(screen.getByText(/fallo al pintar Compras/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volver al inicio" })).toBeTruthy();

    // El usuario se va a otra pestaña: la nueva página se muestra normal (antes el recuadro quedaba pegado)
    rerender(<ErrorBoundary resetKey="/ventas" variant="page"><h1>Historial de ventas</h1></ErrorBoundary>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: "Historial de ventas" })).toBeTruthy();
  });

  it("sin cambio de ruta el recuadro se mantiene", () => {
    const { rerender } = render(<ErrorBoundary resetKey="/compras" variant="page"><Rota /></ErrorBoundary>);
    rerender(<ErrorBoundary resetKey="/compras" variant="page"><h1>Compras</h1></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("si falló la descarga de la página, explica que el sistema se actualizó", () => {
    function Vieja(): never {
      throw new TypeError("Failed to fetch dynamically imported module: http://localhost:3000/src/pages/purchases.tsx");
    }
    render(<ErrorBoundary resetKey="/compras" variant="page"><Vieja /></ErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("se actualizó o se reinició");
  });
});

describe("lazyWithRetry (RF-52)", () => {
  const reload = vi.fn();
  beforeEach(() => {
    window.sessionStorage.clear();
    reload.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("reconoce los errores de descarga de módulos", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: x"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("ante un archivo viejo recarga UNA vez; si vuelve a fallar, lo muestra en el recuadro", async () => {
    const chunk = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module: x"));
    const Pagina = lazyWithRetry(chunk);
    const { unmount } = render(<Suspense fallback="cargando"><Pagina /></Suspense>);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    unmount();

    // Tras la recarga (la marca sigue en sessionStorage) vuelve a fallar: no se recarga en bucle
    const Otra = lazyWithRetry(chunk);
    render(<ErrorBoundary variant="page"><Suspense fallback="cargando"><Otra /></Suspense></ErrorBoundary>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("una carga correcta limpia la marca", async () => {
    window.sessionStorage.setItem("pos-chunk-reload", "1");
    const Pagina = lazyWithRetry(() => Promise.resolve({ default: () => <p>Compras lista</p> }));
    render(<Suspense fallback="cargando"><Pagina /></Suspense>);
    expect(await screen.findByText("Compras lista")).toBeTruthy();
    expect(window.sessionStorage.getItem("pos-chunk-reload")).toBeNull();
  });
});
