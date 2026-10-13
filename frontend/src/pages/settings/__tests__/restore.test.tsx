import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "../../../stores/auth-store";
import { RestoreDialog } from "../restore-dialog";

const restoreBackup = vi.fn();
const getRestoreStatus = vi.fn();

vi.mock("../../../api/backup", () => ({
  restoreBackup: (f: string) => restoreBackup(f),
  getRestoreStatus: () => getRestoreStatus(),
  restoreConfirmation: (f: string) => `RESTAURAR ${f}`,
}));

const BACKUP = {
  filename: "backup_pos_db_20261011_030000.dump",
  size: 18_400_000,
  size_bytes: 18_400_000,
  created_at: "2026-10-11T09:00:00Z",
};

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RestoreDialog backup={BACKUP} onClose={onClose} pollMs={20} />
    </QueryClientProvider>,
  );
  return onClose;
}

function irAlPasoDos() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RestoreDialog", () => {
  it("paso 1: resume el archivo y advierte que se cierran sesiones y cajas", () => {
    renderDialog();
    expect(screen.getByText(BACKUP.filename)).toBeTruthy();
    expect(screen.getByText(/17.5 MB/)).toBeTruthy();
    expect(screen.getByText(/Se cerrarán todas las sesiones y cajas/)).toBeTruthy();
    expect(screen.getByText(/paso 1 de 2/)).toBeTruthy();
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it("paso 2: no habilita el botón hasta escribir el nombre exacto", () => {
    renderDialog();
    irAlPasoDos();
    const boton = screen.getByRole("button", { name: "Restaurar ahora" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    const campo = screen.getByLabelText("Nombre del archivo");
    fireEvent.change(campo, { target: { value: "backup_pos_db_20261011_03000.dump" } });
    expect(boton.disabled).toBe(true);
    fireEvent.change(campo, { target: { value: BACKUP.filename } });
    expect(boton.disabled).toBe(false);
  });

  it("atrás vuelve al resumen y borra lo escrito", () => {
    renderDialog();
    irAlPasoDos();
    fireEvent.change(screen.getByLabelText("Nombre del archivo"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByText(/paso 1 de 2/)).toBeTruthy();
    irAlPasoDos();
    expect((screen.getByLabelText("Nombre del archivo") as HTMLInputElement).value).toBe("");
  });

  it("muestra el error del servidor si no se puede iniciar", async () => {
    restoreBackup.mockRejectedValue(Object.assign(new Error("x"), { isAxiosError: true }));
    renderDialog();
    irAlPasoDos();
    fireEvent.change(screen.getByLabelText("Nombre del archivo"), { target: { value: BACKUP.filename } });
    fireEvent.click(screen.getByRole("button", { name: "Restaurar ahora" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo iniciar la restauración.");
  });

  it("muestra el progreso, y al terminar bien cierra la sesión", async () => {
    const clearSession = vi.fn();
    useAuthStore.setState({ clearSession } as never);
    restoreBackup.mockResolvedValue({ state: "en_curso" });
    getRestoreStatus
      .mockResolvedValueOnce({ state: "en_curso", step: "Restaurando la base de datos...", message: "" })
      .mockResolvedValue({ state: "ok", step: "", message: "Respaldo restaurado. Vuelve a iniciar sesión." });

    renderDialog();
    irAlPasoDos();
    fireEvent.change(screen.getByLabelText("Nombre del archivo"), { target: { value: BACKUP.filename } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restaurar ahora" }));
    });
    expect(restoreBackup).toHaveBeenCalledWith(BACKUP.filename);
    expect(await screen.findByText("Restaurando la base de datos...")).toBeTruthy();

    expect(await screen.findByText(/Respaldo restaurado/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir al inicio de sesión" }));
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("si la restauración falla muestra el error y NO cierra la sesión", async () => {
    const clearSession = vi.fn();
    useAuthStore.setState({ clearSession } as never);
    restoreBackup.mockResolvedValue({ state: "en_curso" });
    getRestoreStatus.mockResolvedValue({ state: "error", step: "", message: "No se pudo restaurar el respaldo: boom. Se recuperó el estado anterior." });
    const onClose = renderDialog();
    irAlPasoDos();
    fireEvent.change(screen.getByLabelText("Nombre del archivo"), { target: { value: BACKUP.filename } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restaurar ahora" }));
    });
    expect(await screen.findByText(/Se recuperó el estado anterior/)).toBeTruthy();
    expect(clearSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" })[0]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
