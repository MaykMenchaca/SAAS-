import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { InventoryPage } from "../../inventory";

const mocks = vi.hoisted(() => ({
  listStock: vi.fn(),
  getLowStock: vi.fn(),
  getInventorySummary: vi.fn(),
  listMovements: vi.fn(),
  adjustStock: vi.fn(),
  fetchInventoryValuation: vi.fn(),
}));

vi.mock("../../../api/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/inventory")>()),
  listStock: mocks.listStock,
  getLowStock: mocks.getLowStock,
  getInventorySummary: mocks.getInventorySummary,
  listMovements: mocks.listMovements,
  adjustStock: mocks.adjustStock,
}));
vi.mock("../../../api/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/reports")>()),
  fetchInventoryValuation: mocks.fetchInventoryValuation,
}));

const item = (id: number, name: string, quantity: string, min: string, max: string) => ({
  id, product_id: id, product_name: name, sku: `SKU-${id}`, quantity, last_updated: "2026-10-12T10:00:00",
  unit_abbreviation: "pz", min_stock: min, max_stock: max,
});
const martillo = item(1, "Martillo", "24.000", "6.000", "40.000");
const tubo = item(2, "Tubo", "0.000", "8.000", "40.000");
const cinta = item(3, "Cinta", "50.000", "5.000", "100.000");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const base = { id: 1, username: "u", full_name: "U" };
const gerente = { ...base, role: "gerente", permissions: ["inventario:ver", "inventario:ajustar", "reportes:ver"] };
const consulta = { ...base, role: "cajero", permissions: ["inventario:ver"] };

describe("Inventario con el diseño Industry", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.listStock.mockImplementation(async ({ perPage }: { perPage?: number }) =>
      perPage === 1
        ? { items: [martillo], total: 3, page: 1, pages: 3, per_page: 1 }
        : { items: [martillo, tubo, cinta], total: 3, page: 1, pages: 1, per_page: 20 },
    );
    mocks.getLowStock.mockResolvedValue({ items: [tubo], total: 1, page: 1, pages: 1, per_page: 100 });
    mocks.getInventorySummary.mockResolvedValue({ total_products: 3, out_of_stock: 1, below_min: 1 });
    mocks.listMovements.mockResolvedValue([
      { id: 9, product_id: 1, movement_type: "salida", quantity: "2.000", previous_stock: "26.000", new_stock: "24.000", reference_type: "venta", reference_id: 4, notes: null, user_id: 1, username: "caja1", created_at: "2026-10-11T12:14:00" },
    ]);
    mocks.fetchInventoryValuation.mockResolvedValue({ total_valuation: "1234.50", total_units: "74", product_count: 3, items: [] });
    mocks.adjustStock.mockResolvedValue({ product_id: 1, new_stock: "20.000", movement_type: "ajuste", reason: "merma_dano" });
    useAuthStore.setState({ isAuthenticated: true, user: gerente });
  });

  it("muestra los indicadores, el nivel y el estado de cada producto", async () => {
    renderPage();
    const fila = (await screen.findByRole("button", { name: "Martillo" })).closest("tr")!;
    expect(within(fila).getByText("Normal")).toBeTruthy();
    expect(within(fila).getByText("mín 6")).toBeTruthy();
    expect(within(fila).getByText("máx 40")).toBeTruthy();
    const tuboFila = screen.getByRole("button", { name: "Tubo" }).closest("tr")!;
    expect(within(tuboFila).getByText("Agotado")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("$1,234.50")).toBeTruthy());
    const kpis = screen.getByText("Valor a costo").closest("dl")!;
    expect(within(kpis).getByText("3")).toBeTruthy();
    expect(within(kpis).getAllByText("1")).toHaveLength(2);
  });

  it("los KPI salen del resumen del servidor, no de las primeras 100 filas de low-stock (RF-23)", async () => {
    // low-stock solo trae 1 fila, pero el servidor cuenta 17 agotados y 4 bajo mínimo de 250 productos
    mocks.getInventorySummary.mockResolvedValue({ total_products: 250, out_of_stock: 17, below_min: 4 });
    renderPage();
    const kpis = (await screen.findByText("Agotados")).closest("dl")!;
    await waitFor(() => expect(within(kpis).getByText("17")).toBeTruthy());
    const valor = (label: string) => within(kpis).getByText(label).closest("div")!.querySelector("dd")!.textContent;
    expect(valor("Productos")).toBe("250");
    expect(valor("Bajo mínimo")).toBe("4");
    expect(valor("Agotados")).toBe("17");
  });

  it("sin permiso de reportes el valor a costo queda en guion y no consulta la valuación", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: consulta });
    renderPage();
    await screen.findByRole("button", { name: "Martillo" });
    expect(mocks.fetchInventoryValuation).not.toHaveBeenCalled();
    const kpi = screen.getByText("Valor a costo").closest("div")!;
    expect(within(kpi).getByText("—")).toBeTruthy();
  });

  it("filtra por bajo mínimo", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Martillo" });
    fireEvent.click(screen.getByRole("button", { name: "Bajo mínimo" }));
    expect(screen.queryByRole("button", { name: "Martillo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tubo" })).toBeTruthy();
  });

  it("ajusta el stock enviando el motivo y exige elegirlo", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar stock de Martillo" }));
    const boton = await screen.findByRole("button", { name: /Aplicar ajuste/ });
    fireEvent.change(screen.getByLabelText("Nueva cantidad"), { target: { value: "20" } });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Aplicar ajuste (-4)" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "merma_dano" } });
    fireEvent.click(screen.getByRole("button", { name: /Aplicar ajuste/ }));
    await waitFor(() => expect(mocks.adjustStock).toHaveBeenCalledTimes(1));
    expect(mocks.adjustStock.mock.calls[0][0]).toEqual({ product_id: 1, quantity: "20", reason: "merma_dano", notes: undefined });
    expect(await screen.findByText("Ajuste registrado en movimientos.")).toBeTruthy();
  });

  it("muestra los movimientos recientes del producto elegido", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Martillo" }));
    expect(await screen.findByText("Movimientos recientes")).toBeTruthy();
    expect(await screen.findByText("Salida")).toBeTruthy();
    expect(screen.getByText("-2")).toBeTruthy();
  });

  it("el rol sin permiso de ajuste no ve Ajustar ni el botón de conteo", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: consulta });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Martillo" }));
    expect(await screen.findByText(/Tu rol no puede ajustar existencias/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Aplicar ajuste/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Conteo físico/ })).toBeNull();
  });

  it("estado vacío y estado de error", async () => {
    mocks.listStock.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1, per_page: 20 });
    const vacio = renderPage();
    expect(await screen.findByText("Sin productos en inventario.")).toBeTruthy();
    vacio.unmount();

    mocks.listStock.mockRejectedValue(new Error("falló"));
    renderPage();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });
});
