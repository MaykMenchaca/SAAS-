import type { ComponentType } from "react";
import { lazy } from "react";

const RELOAD_FLAG = "pos-chunk-reload";

/** Error al descargar el archivo de una página (el servidor se reinició o se actualizó y cambió los nombres). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i.test(
    message,
  );
}

function readFlag(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}

function writeFlag(value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(RELOAD_FLAG, "1");
    else window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // sin sessionStorage (modo privado estricto): solo se pierde la protección contra recargas en bucle
  }
}

/**
 * `React.lazy` que sobrevive a una actualización del sistema (RF-52). Si la página no se puede descargar porque
 * el navegador tiene la versión anterior en memoria, recarga UNA vez para traer la nueva; si vuelve a fallar,
 * deja pasar el error al ErrorBoundary de la página (con su botón de recargar) en lugar de recargar en bucle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- misma firma que React.lazy
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await factory();
      writeFlag(false);
      return module;
    } catch (error) {
      if (isChunkLoadError(error) && !readFlag()) {
        writeFlag(true);
        window.location.reload();
        // La página se recarga: la promesa no se resuelve para no pintar nada mientras tanto
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
