import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { ProductsPage } from "../../products";

const mocks = vi.hoisted(() => ({
  listProducts: vi.fn(),
  listCategories: vi.fn(),
  listUnits: vi.fn(),
  updateProduct: vi.fn(),
  getLowStock: vi.fn(),
}));

vi.mock("../../../api/products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/products")>()),
  listProducts: mocks.listProducts,
  listCategories: mocks.listCategories,
  listUnits: mocks.listUnits,
  updateProduct: mocks.updateProduct,
}));
vi.mock("../../../api/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/inventory")>()),
  getLowStock: mocks.getLowStock,
}));

const userEvent = { click: async (el: Element) => { fireEvent.click(el); } };

const unit = { id: 1, name: "Pieza", abbreviation: "pz", allows_fractions: false };
const martillo = {
  id: 1, sku: "MART-01", barcode: "750100", name: "Martillo", description: null, category_id: 1, unit_id: 1,
  purchase_price: "50.00", avg_cost: "50.0000", sale_price: "100.00", tax_rate: "16.00", min_stock: "1",
  max_stock: "10", is_active: true, category: { id: 1, name: "Herramientas", description: null, is_active: true }, unit, stock_qty: "5",
};
const sinStock = { ...martillo, id: 2, sku: "TUB-02", name: "Tubo", sale_price: "10.00", avg_cost: "9.0000", stock_qty: "0" };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const admin = { id: 1, username: "admin", full_name: "Admin", role: "admin", permissions: [] };
const cajero = { id: 2, username: "caja1", full_name: "Cajero", role: "cajero", permissions: ["productos:ver"] };

describe("Productos con el diseño Industry", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.listProducts.mockResolvedValue({ items: [martillo, sinStock], total: 2, page: 1, pages: 1, per_page: 20 });
    mocks.listCategories.mockResolvedValue([{ id: 1, name: "Herramientas", description: null, is_active: true }]);
    mocks.listUnits.mockResolvedValue([unit]);
    mocks.getLowStock.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1, per_page: 100 });
    useAuthStore.setState({ isAuthenticated: true, user: admin });
  });

  it("muestra costo, precio, margen, stock y estado en la tabla", async () => {
    renderPage();
    const fila = (await screen.findByRole("button", { name: "Martillo" })).closest("tr")!;
    expect(within(fila).getByText("$50.00")).toBeTruthy();
    expect(within(fila).getByText("$100.00")).toBeTruthy();
    expect(within(fila).getByText("50.0 %")).toBeTruthy();
    expect(within(fila).getByText("5 pz")).toBeTruthy();
    expect(within(fila).getByText("Activo")).toBeTruthy();
    expect(screen.getByText("2 productos · 1 categoría · 1 unidad de medida")).toBeTruthy();
  });

  it("al elegir un producto muestra el panel con precio con IVA, utilidad y margen", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Martillo" }));
    const metricas = within(await screen.findByTestId("product-metrics"));
    expect(metricas.getByText("$116.00")).toBeTruthy();
    expect(metricas.getByText("$50.00")).toBeTruthy();
    expect(metricas.getByText("50.0 %")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
  });

  it("recalcula las métricas al cambiar el precio", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Martillo" }));
    fireEvent.change(await screen.findByLabelText("Precio de venta"), { target: { value: "200" } });
    const metricas = within(screen.getByTestId("product-metrics"));
    expect(metricas.getByText("$232.00")).toBeTruthy();
    expect(metricas.getByText("75.0 %")).toBeTruthy();
  });

  it("guarda los cambios con el mismo payload y avisa", async () => {
    mocks.updateProduct.mockResolvedValue({ ...martillo, sale_price: "120.00" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Martillo" }));
    fireEvent.change(await screen.findByLabelText("Precio de venta"), { target: { value: "120.00" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct.mock.calls[0][0]).toBe(1);
    expect(mocks.updateProduct.mock.calls[0][1]).toMatchObject({ sku: "MART-01", sale_price: "120.00", unit_id: 1, category_id: 1 });
    expect(await screen.findByText("Cambios guardados.")).toBeTruthy();
  });

  it("el rol de solo consulta ve el panel en solo lectura", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: cajero });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Martillo" }));
    expect(await screen.findByText("Tu rol solo puede consultar el catálogo.")).toBeTruthy();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desactivar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Etiqueta" })).toBeTruthy();
  });

  it("Nuevo producto abre el panel de alta", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Nuevo producto$/ }));
    expect(await screen.findByRole("button", { name: "Crear producto" })).toBeTruthy();
  });

  it("estado vacío", async () => {
    mocks.listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1, per_page: 20 });
    renderPage();
    expect(await screen.findByText("Sin productos registrados.")).toBeTruthy();
  });

  it("estado de error con reintento", async () => {
    mocks.listProducts.mockRejectedValue(new Error("falló"));
    renderPage();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });

  it("cambia a las pestañas de categorías y unidades", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Unidades" }));
    expect(await screen.findByText("Permite fracciones")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Categorías" }));
    expect(await screen.findByRole("columnheader", { name: "Categoría" })).toBeTruthy();
  });
});
