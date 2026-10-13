import { AxiosError } from "axios";

/** Mensaje legible de un error de guardado (detalles de validación o mensaje del servidor). */
export function getErrorMessage(error: Error | null) {
  if (!error) {
    return "";
  }

  if (error instanceof AxiosError) {
    const details = error.response?.data?.details;
    if (details && typeof details === "object") {
      return Object.values(details).flat().join(" ");
    }
    return error.response?.data?.error ?? "No se pudo guardar.";
  }

  return "No se pudo guardar.";
}
