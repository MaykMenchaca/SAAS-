import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";
import { ProductsPage } from "../products";

const { producto, getLowStock } = vi.hoisted(() => ({
  getLowStock: vi.fn().mockResolvedValue([]),
  producto: {
  id: 1, sku: "MART-01", barcode: null, name: "Martillo", description: null, category_id: null, unit_id: 1,
  purchase_price: "50.00", avg_cost: "50.0000", sale_price: "100.00", tax_rate: "16.00", min_stock: "1",
  max_stock: "10", is_active: true, category: null, unit: { id: 1, name: "Pieza", abbreviation: "pz", allows_fractions: false },
  stock_qty: "5",
  },
}));

vi.mock("../../api/products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/products")>()),
  listProducts: vi.fn().mockResolvedValue({ items: [producto], total: 1, page: 1, pages: 1, per_page: 20 }),
  listCategories: vi.fn().mockResolvedValue([]),
  listUnits: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../api/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/inventory")>()),
  getLowStock: () => getLowStock(),
}));

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

const base = { id: 2, username: "caja1", full_name: "Cajero", role: "cajero" };

describe("acciones de Productos según permisos (FE-107)", () => {
  beforeEach(() => getLowStock.mockClear());

  it("con solo productos:ver no muestra Nuevo, Editar ni Desactivar, ni consulta stock bajo", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { ...base, permissions: ["productos:ver"] } });
    renderPage();
    expect(await screen.findByText("Martillo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar Martillo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desactivar Martillo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nuevo/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Etiqueta Martillo" })).toBeTruthy();
    expect(getLowStock).not.toHaveBeenCalled();
  });

  it("con permisos de edición sí muestra las acciones", async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { ...base, permissions: ["productos:ver", "productos:crear", "productos:editar", "productos:desactivar", "inventario:ver"] },
    });
    renderPage();
    expect(await screen.findByRole("button", { name: "Editar Martillo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desactivar Martillo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Nuevo/ })).toBeTruthy();
  });
});
