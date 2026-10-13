export type Tab = "ordenes" | "proveedores";

export function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "recibida") return "success";
  if (status === "enviada" || status === "parcial") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    borrador: "Borrador",
    enviada: "Enviada",
    parcial: "Parcial",
    recibida: "Recibida",
    cancelada: "Cancelada",
  };
  return labels[status] ?? status;
}
