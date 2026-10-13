import { apiClient } from "./client";

/**
 * Descarga un respaldo con la sesión del administrador (el endpoint exige el token, así que no
 * puede ser un enlace directo) y lo entrega al navegador como archivo.
 */
export async function downloadBackup(filename: string) {
  const response = await apiClient.get<Blob>(`/backup/${encodeURIComponent(filename)}/download`, {
    responseType: "blob",
    // Un respaldo grande tarda más que una consulta normal
    timeout: 120_000,
  });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
