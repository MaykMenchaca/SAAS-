import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";

import type { ImportPreview } from "../../../api/inventory";
import { ExcelImportModal } from "../excel-import-modal";

const previewInventoryImport = vi.fn();
const applyInventoryImport = vi.fn();
vi.mock("../../../api/inventory", () => ({
  previewInventoryImport: (f: File) => previewInventoryImport(f),
  applyInventoryImport: (f: File, h: string) => applyInventoryImport(f, h),
}));
vi.mock("../../../api/invalidate", () => ({ invalidateInventory: vi.fn(async () => undefined) }));
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), warning: (m: string) => toastWarning(m), error: vi.fn() } }));

const base: ImportPreview = {
  resumen: { filas: 3, nuevos: 1, cambios: 1, sin_cambios: 1, errores: 0 },
  categorias_nuevas: ["Desarmadores"],
  plan_hash: "abc123",
  filas: [
    { fila: 2, sku: "MAR-1", nombre: "Martillo", estado: "cambio", errores: [],
      cambios: [{ campo: "Precio de venta", antes: "100.00", despues: "110.00" }, { campo: "Existencias", antes: "20", despues: "30" }] },
    { fila: 3, sku: "DES-1", nombre: "Desarmador", estado: "nuevo", errores: [],
      cambios: [{ campo: "Precio de venta", antes: "—", despues: "55.50" }] },
    { fila: 4, sku: "CLV-KG", nombre: "Clavo", estado: "igual", errores: [], cambios: [] },
  ],
};

function abrir(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ExcelImportModal onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

const archivo = new File(["x"], "inventario.xlsx");
const subir = () => fireEvent.change(screen.getByLabelText("Archivo de Excel"), { target: { files: [archivo] } });
const aplicar = () => screen.getByRole("button", { name: /^Aplicar/ }) as HTMLButtonElement;

beforeEach(() => vi.clearAllMocks());

describe("Importar inventario desde Excel", () => {
  it("muestra el resumen y los cambios antes → después; aplicar envía el plan revisado", async () => {
    previewInventoryImport.mockResolvedValue(base);
    applyInventoryImport.mockResolvedValue({ resumen: base.resumen, categorias_nuevas: ["Desarmadores"] });
    const onClose = abrir();
    subir();
    const resumen = await screen.findByLabelText("Resumen de la importación");
    expect(within(resumen).getByText("Nuevos").nextSibling?.textContent).toBe("1");
    expect(screen.getByText(/Se crearán las categorías: Desarmadores/)).toBeTruthy();
    // Abre en el grupo de cambios: antes tachado → después
    expect(screen.getByText("100.00").className).toContain("line-through");
    expect(screen.getByText("110.00")).toBeTruthy();
    expect(aplicar().textContent).toBe("Aplicar 2 cambios");
    fireEvent.click(aplicar());
    await waitFor(() => expect(applyInventoryImport).toHaveBeenCalledWith(archivo, "abc123"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("con errores no deja aplicar y los muestra", async () => {
    previewInventoryImport.mockResolvedValue({
      ...base,
      resumen: { ...base.resumen, errores: 1 },
      filas: [...base.filas, { fila: 5, sku: "X-1", nombre: "Raro", estado: "error", cambios: [],
        errores: ["Unidad «litro» no existe. Usa la abreviatura de una unidad registrada."] }],
    });
    abrir();
    subir();
    expect(await screen.findByText(/Unidad «litro» no existe/)).toBeTruthy();
    expect(screen.getByText(/no se aplicará nada mientras haya errores/)).toBeTruthy();
    expect(aplicar().disabled).toBe(true);
  });

  it("si el Excel coincide con el inventario, lo dice y no hay nada que aplicar", async () => {
    previewInventoryImport.mockResolvedValue({ ...base, resumen: { filas: 1, nuevos: 0, cambios: 0, sin_cambios: 1, errores: 0 }, filas: [base.filas[2]] });
    abrir();
    subir();
    expect(await screen.findByText(/no hay nada que cambiar/)).toBeTruthy();
    expect(aplicar().disabled).toBe(true);
  });

  it("si el archivo no es válido muestra el motivo del servidor", async () => {
    previewInventoryImport.mockRejectedValue(new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined,
      { status: 400, data: { error: "No se pudo leer el archivo: debe ser un Excel (.xlsx) válido." } } as never));
    abrir();
    subir();
    expect((await screen.findByRole("alert")).textContent).toContain("debe ser un Excel");
  });

  it("si el inventario cambió desde la vista previa (409), vuelve a revisar el archivo", async () => {
    previewInventoryImport.mockResolvedValue(base);
    applyInventoryImport.mockRejectedValue(new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined,
      { status: 409, data: { error: "El inventario cambió desde la vista previa." } } as never));
    abrir();
    subir();
    await screen.findByLabelText("Resumen de la importación");
    fireEvent.click(aplicar());
    await waitFor(() => expect(previewInventoryImport).toHaveBeenCalledTimes(2));
    expect(toastWarning).toHaveBeenCalledWith("El inventario cambió desde la vista previa.");
  });
});
