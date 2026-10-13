import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { InventoryCountPage } from "../../inventory-count";

const mocks = vi.hoisted(() => ({
  listInventoryCounts: vi.fn(),
  getInventoryCount: vi.fn(),
  captureCountItem: vi.fn(),
  closeInventoryCount: vi.fn(),
  cancelInventoryCount: vi.fn(),
  createInventoryCount: vi.fn(),
}));

vi.mock("../../../api/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/inventory")>()),
  ...mocks,
}));

const lista = {
  items: [
    { id: 8, username: "laura", status: "en_proceso", notes: "Conteo mensual octubre", created_at: "2026-10-10T19:30:00", closed_at: null, total_items: 2, counted_items: 1 },
    { id: 7, username: "jorge", status: "cerrado", notes: "Pasillo eléctrico", created_at: "2026-09-14T10:00:00", closed_at: "2026-09-14T12:00:00", total_items: 5, counted_items: 5 },
    { id: 6, username: "laura", status: "cancelado", notes: null, created_at: "2026-08-31T10:00:00", closed_at: null, total_items: 5, counted_items: 0 },
  ],
  total: 3, page: 1, pages: 1, per_page: 20,
};

const detalle = {
  id: 8, user_id: 1, username: "laura", status: "en_proceso", notes: "Conteo mensual octubre", created_at: "2026-10-10T19:30:00",
  closed_at: null, closed_by: null, closed_by_username: null, total_items: 2, counted_items: 1,
  items: [
    { id: 1, product_id: 11, product_name: "Martillo", product_sku: "MAR-1", expected_quantity: "24.000", counted_quantity: "22.000", difference: "-2.000", notes: "caja rota" },
    { id: 2, product_id: 12, product_name: "Cinta", product_sku: "CIN-1", expected_quantity: "86.000", counted_quantity: null, difference: null, notes: null },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InventoryCountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Conteo físico con el diseño Industry", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.listInventoryCounts.mockResolvedValue(lista);
    mocks.getInventoryCount.mockResolvedValue(detalle);
    mocks.captureCountItem.mockResolvedValue({});
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 1, username: "g", full_name: "G", role: "gerente", permissions: ["inventario:ver", "inventario:ajustar"] },
    });
  });

  it("lista los conteos con folio CF- y estado", async () => {
    renderPage();
    expect(await screen.findByText("CF-0008")).toBeTruthy();
    expect(screen.getByText("CF-0007")).toBeTruthy();
    expect(screen.getByText("Cerrado")).toBeTruthy();
    expect(screen.getByText("Cancelado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Ver arqueo" })).toHaveLength(2);
  });

  it("estado vacío y de error de la lista", async () => {
    mocks.listInventoryCounts.mockResolvedValueOnce({ items: [], total: 0, page: 1, pages: 1, per_page: 20 });
    const vacio = renderPage();
    expect(await screen.findByText("No hay conteos registrados.")).toBeTruthy();
    vacio.unmount();
    mocks.listInventoryCounts.mockRejectedValue(new Error("x"));
    renderPage();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });

  it("al abrir un conteo muestra el avance, los contados y las diferencias", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/CF-0008 · Conteo mensual octubre/)).toBeTruthy();
    const kpis = screen.getByText("Con diferencia").closest("dl")!;
    expect(within(kpis).getByText("50%")).toBeTruthy();
    const fila = screen.getByText("Martillo").closest("tr")!;
    expect(within(fila).getByText("-2")).toBeTruthy();
    expect(within(fila).getByText("Diferencia")).toBeTruthy();
    expect(within(screen.getByText("Cinta").closest("tr")!).getByText("Pendiente")).toBeTruthy();
  });

  it("captura el conteo inline al salir del campo y conserva las notas", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    const campo = await screen.findByLabelText("Contado de Cinta");
    fireEvent.change(campo, { target: { value: "80" } });
    fireEvent.blur(campo);
    await waitFor(() => expect(mocks.captureCountItem).toHaveBeenCalledTimes(1));
    expect(mocks.captureCountItem).toHaveBeenCalledWith(8, 12, "80", undefined);
    // Sin cambios no se vuelve a guardar
    const otro = screen.getByLabelText("Contado de Martillo");
    fireEvent.blur(otro);
    expect(mocks.captureCountItem).toHaveBeenCalledTimes(1);
  });

  it("cierra el conteo solo tras confirmar", async () => {
    mocks.closeInventoryCount.mockResolvedValue(detalle);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar y aplicar diferencias" }));
    expect(mocks.closeInventoryCount).not.toHaveBeenCalled();
    expect(screen.getByText(/1 producto\(s\) sin contar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar y ajustar" }));
    await waitFor(() => expect(mocks.closeInventoryCount).toHaveBeenCalledWith(8));
  });

  it("cancela el conteo solo tras confirmar", async () => {
    mocks.cancelInventoryCount.mockResolvedValue(detalle);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar conteo" }));
    expect(mocks.cancelInventoryCount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar conteo" }));
    await waitFor(() => expect(mocks.cancelInventoryCount).toHaveBeenCalledWith(8));
  });

  it("un conteo cerrado es de solo lectura", async () => {
    mocks.getInventoryCount.mockResolvedValue({ ...detalle, status: "cerrado", closed_at: "2026-10-11T10:00:00", closed_by_username: "laura" });
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Ver arqueo" }))[0]);
    expect(await screen.findByText("Martillo")).toBeTruthy();
    expect(screen.queryByLabelText("Contado de Martillo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar y aplicar diferencias" })).toBeNull();
  });
});
