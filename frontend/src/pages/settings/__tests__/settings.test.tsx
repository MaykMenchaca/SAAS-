import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SettingsPage } from "../../settings";
import { actionLabel, formatBytes, previewTaxCents } from "../format";

const getConfig = vi.fn();
const updateConfig = vi.fn();
const listBackups = vi.fn();
const createBackup = vi.fn();
const deleteBackup = vi.fn();
const verifyBackup = vi.fn();
const listAuditLogs = vi.fn();
const listCashRegisters = vi.fn();
const downloadBackup = vi.fn();

vi.mock("../../../api/config", () => ({
  getConfig: () => getConfig(),
  updateConfig: (d: unknown) => updateConfig(d),
  listBackups: () => listBackups(),
  createBackup: () => createBackup(),
  deleteBackup: (f: string) => deleteBackup(f),
  verifyBackup: (f: string) => verifyBackup(f),
}));
vi.mock("../../../api/backup", () => ({
  downloadBackup: (f: string) => downloadBackup(f),
}));
vi.mock("../../../api/audit", () => ({ listAuditLogs: (p: unknown) => listAuditLogs(p) }));
vi.mock("../../../api/sales", () => ({
  listCashRegisters: () => listCashRegisters(),
  updateCashRegister: vi.fn(),
  createAgentKey: vi.fn(),
}));

const CONFIG = {
  company_name: "Ferretería El Clavo",
  company_address: "Av. Juárez 418, León",
  company_phone: "477 713 2280",
  company_rfc: "FEC140512HG3",
  default_tax_rate: "16",
  ticket_footer: "Gracias por su compra",
};

const BACKUPS = [
  { filename: "backup_pos_db_20261011_030000.dump", size: 18_400_000, size_bytes: 18_400_000, created_at: "2026-10-11T09:00:00Z" },
  { filename: "backup_pos_db_20261010_030000.dump", size: 18_300_000, size_bytes: 18_300_000, created_at: "2026-10-10T09:00:00Z" },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockResolvedValue(CONFIG);
  listBackups.mockResolvedValue(BACKUPS);
  listAuditLogs.mockResolvedValue({ items: [], total: 0, page: 1, per_page: 30, pages: 1 });
  listCashRegisters.mockResolvedValue([]);
});

describe("formato", () => {
  it("el IVA de la vista previa se calcula en centavos enteros", () => {
    expect(previewTaxCents("16")).toBe(5296);
    expect(previewTaxCents("8.5")).toBe(2814);
    expect(previewTaxCents("")).toBe(0);
    expect(previewTaxCents("abc")).toBe(0);
    expect(previewTaxCents("-5")).toBe(0);
  });
  it("tamaños y acciones en español", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(actionLabel("restore")).toBe("Restaurar");
    expect(actionLabel("otra")).toBe("otra");
  });
});

describe("Configuración", () => {
  it("tiene un solo h1 y cuatro pestañas", async () => {
    renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["General", "Cajas", "Auditoría", "Respaldos"]);
    await screen.findByLabelText("Nombre de la empresa");
  });

  it("General: muestra el esqueleto mientras carga", () => {
    getConfig.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId("config-loading")).toBeTruthy();
  });

  it("General: error con opción de reintentar", async () => {
    getConfig.mockRejectedValue(new Error("fallo"));
    renderPage();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });

  it("General: la vista previa del ticket cambia al escribir", async () => {
    renderPage();
    const name = await screen.findByLabelText("Nombre de la empresa");
    await waitFor(() => expect(screen.getByTestId("preview-name").textContent).toBe("Ferretería El Clavo"));
    expect(screen.getByTestId("preview-total").textContent).toBe("$383.96");
    fireEvent.change(name, { target: { value: "Tlapalería Nueva" } });
    expect(screen.getByTestId("preview-name").textContent).toBe("Tlapalería Nueva");
    fireEvent.change(screen.getByLabelText("IVA por defecto (%)"), { target: { value: "8" } });
    expect(screen.getByTestId("preview-tax").textContent).toBe("$26.48");
    expect(screen.getByTestId("preview-total").textContent).toBe("$357.48");
  });

  it("General: guarda la configuración con los valores del formulario", async () => {
    updateConfig.mockResolvedValue(CONFIG);
    renderPage();
    const phone = await screen.findByLabelText("Teléfono");
    await waitFor(() => expect((phone as HTMLInputElement).value).toBe("477 713 2280"));
    fireEvent.change(phone, { target: { value: "55 1234 5678" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));
    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({ company_phone: "55 1234 5678" })));
  });

  it("Auditoría: vacío, filtros y error", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Auditoría/ }));
    expect(await screen.findByText("Sin registros de auditoría.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "cancel" } });
    fireEvent.change(screen.getByLabelText("Entidad"), { target: { value: "sale" } });
    await waitFor(() => expect(listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ action: "cancel", entityType: "sale" })));
  });

  it("Auditoría: con datos y con error", async () => {
    listAuditLogs.mockResolvedValue({
      items: [{ id: 1, user_id: 1, username: "admin", action: "cancel", entity_type: "sale", entity_id: 44, details: { motivo: "x" }, ip_address: null, created_at: "2026-10-11T20:06:00Z" }],
      total: 1, page: 1, per_page: 30, pages: 1,
    });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Auditoría/ }));
    expect(await screen.findByText("Cancelar", { selector: "span" })).toBeTruthy();
    expect(screen.getAllByText("Venta").length).toBeGreaterThan(1);
  });

  it("Auditoría: error de carga", async () => {
    listAuditLogs.mockRejectedValue(new Error("x"));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Auditoría/ }));
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });

  it("Cajas: sin cajas registradas", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Cajas/ }));
    expect(await screen.findByText("No hay cajas registradas.")).toBeTruthy();
  });

  it("Respaldos: resumen, lista y descarga", async () => {
    downloadBackup.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Respaldos/ }));
    expect(await screen.findByText("backup_pos_db_20261011_030000.dump")).toBeTruthy();
    expect(screen.getByText("Respaldos guardados")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descargar backup_pos_db_20261010_030000.dump" }));
    await waitFor(() => expect(downloadBackup).toHaveBeenCalledWith("backup_pos_db_20261010_030000.dump"));
  });

  it("Respaldos: crear respaldo ahora y vacío", async () => {
    listBackups.mockResolvedValue([]);
    createBackup.mockResolvedValue({ filename: "x", size: 1, created_at: "" });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Respaldos/ }));
    expect(await screen.findByText("Sin respaldos. Crea el primero.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Crear respaldo ahora" }));
    await waitFor(() => expect(createBackup).toHaveBeenCalled());
  });

  it("Respaldos: eliminar pide confirmación", async () => {
    deleteBackup.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Respaldos/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar backup_pos_db_20261011_030000.dump" }));
    expect(deleteBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deleteBackup).toHaveBeenCalledWith("backup_pos_db_20261011_030000.dump"));
  });

  it("Respaldos: error de carga", async () => {
    listBackups.mockRejectedValue(new Error("x"));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Respaldos/ }));
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });
});
