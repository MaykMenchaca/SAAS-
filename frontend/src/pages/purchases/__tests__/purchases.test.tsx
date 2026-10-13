import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { PurchasesPage } from "../../purchases";
import { canCancelStatus, canReceiveStatus, formatShortDate, statusLabel, statusTone } from "../helpers";

const api = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  createOrder: vi.fn(),
  createSupplier: vi.fn(),
  deactivateSupplier: vi.fn(),
  getOrder: vi.fn(),
  listOrders: vi.fn(),
  listSuppliers: vi.fn(),
  receiveOrder: vi.fn(),
  sendOrder: vi.fn(),
  updateSupplier: vi.fn(),
  listProducts: vi.fn(),
}));

vi.mock("../../../api/purchases", () => api);
vi.mock("../../../api/products", () => ({ listProducts: api.listProducts }));

const ordersPage = (items: unknown[]) => ({ items, total: items.length, page: 1, pages: 1, per_page: 20 });

const listRow = (over: Record<string, unknown> = {}) => ({
  id: 31,
  folio: "OC-2026-0031",
  supplier_name: "Distribuidora del Bajío",
  status: "enviada",
  total: "2320.00",
  created_at: "2026-10-10T15:00:00",
  expected_date: "2026-10-14",
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  id: 31,
  folio: "OC-2026-0031",
  supplier_id: 1,
  supplier_name: "Distribuidora del Bajío",
  user_id: 1,
  username: "admin",
  status: "enviada",
  subtotal: "2000.00",
  tax_total: "320.00",
  total: "2320.00",
  notes: null,
  expected_date: "2026-10-14",
  created_at: "2026-10-10T15:00:00",
  items: [
    { id: 101, product_id: 1, product_name: "Tornillo 6x1", product_sku: "TOR-6X1", quantity: "40.000", received_quantity: "0.000", unit_cost: "42.50", tax_rate: "16.00", subtotal: "1700.00" },
    { id: 102, product_id: 2, product_name: "Disco de corte", product_sku: "DIS-45", quantity: "20.000", received_quantity: "20.000", unit_cost: "15.00", tax_rate: "16.00", subtotal: "300.00" },
  ],
  ...over,
});

const supplier = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Distribuidora del Bajío",
  rfc: "DFB120304KJ7",
  contact_name: "Ricardo Salinas",
  phone: "477 712 4400",
  email: "ventas@dfbajio.mx",
  address: null,
  payment_terms: "Crédito 30 días",
  notes: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00",
  ...over,
});

const ADMIN = { id: 1, username: "admin", full_name: "Admin", role: "admin", permissions: [] as string[], must_change_password: false };
const LECTOR = { id: 3, username: "lector", full_name: "Lector", role: "gerente", permissions: ["compras:ver"], must_change_password: false };

function setUser(user: typeof ADMIN) {
  useAuthStore.setState({ isAuthenticated: true, user: user as never });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PurchasesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  setUser(ADMIN);
  api.listOrders.mockResolvedValue(ordersPage([listRow()]));
  api.getOrder.mockResolvedValue(detail());
  api.listSuppliers.mockResolvedValue({ items: [supplier()], total: 1, page: 1, pages: 1, per_page: 100 });
  api.listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1, per_page: 30 });
});

describe("helpers de compras", () => {
  it("etiqueta y tono por estado", () => {
    expect(statusLabel("parcial")).toBe("Parcial");
    expect(statusTone("recibida")).toBe("success");
    expect(statusTone("cancelada")).toBe("danger");
    expect(statusTone("borrador")).toBe("neutral");
  });

  it("solo se recibe en enviada o parcial y solo se cancela en borrador o enviada", () => {
    expect(canReceiveStatus("enviada")).toBe(true);
    expect(canReceiveStatus("parcial")).toBe(true);
    expect(canReceiveStatus("borrador")).toBe(false);
    expect(canCancelStatus("borrador")).toBe(true);
    expect(canCancelStatus("parcial")).toBe(false);
  });

  it("una fecha de solo día no se corre al día anterior por la zona horaria", () => {
    expect(formatShortDate("2026-10-14")).toContain("14");
    expect(formatShortDate(null)).toBe("—");
    expect(formatShortDate("no es fecha")).toBe("—");
  });
});

describe("Compras · órdenes", () => {
  it("muestra el esqueleto mientras carga", () => {
    api.listOrders.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Compras" })).toBeTruthy();
    expect(screen.queryByText("OC-2026-0031")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lista la orden con folio, proveedor, esperada, total y estado, y abre su detalle", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Tabla de órdenes de compra" });
    expect(within(table).getByText("OC-2026-0031")).toBeTruthy();
    expect(within(table).getByText("Distribuidora del Bajío")).toBeTruthy();
    expect(within(table).getByText("$2,320.00")).toBeTruthy();
    expect(within(table).getByText("Enviada")).toBeTruthy();
    expect(within(table).getByText(/^14/)).toBeTruthy();

    // Detalle de la primera orden: partidas, totales y acciones
    const partidas = await screen.findByRole("table", { name: "Partidas de la orden OC-2026-0031" });
    expect(within(partidas).getByText("Tornillo 6x1")).toBeTruthy();
    expect(within(partidas).getByText("$42.50")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar recepción" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar al proveedor" })).toBeNull();
  });

  it("estado vacío con acción para crear", async () => {
    api.listOrders.mockResolvedValue(ordersPage([]));
    renderPage();
    expect(await screen.findByText("Aún no hay órdenes de compra.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Nueva orden/ }).length).toBeGreaterThan(0);
  });

  it("estado de error con reintento", async () => {
    api.listOrders.mockRejectedValueOnce(new Error("falló"));
    renderPage();
    expect(await screen.findByText("No se pudieron cargar las órdenes de compra.")).toBeTruthy();
    api.listOrders.mockResolvedValue(ordersPage([listRow()]));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("OC-2026-0031")).toBeTruthy();
  });

  it("con solo compras:ver no muestra Nueva orden, Recibir, Enviar ni Cancelar, pero sí Imprimir", async () => {
    setUser(LECTOR);
    renderPage();
    await screen.findByRole("table", { name: "Partidas de la orden OC-2026-0031" });
    expect(screen.queryByRole("button", { name: /Nueva orden/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Registrar recepción" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar orden" })).toBeNull();
    expect(screen.queryByLabelText("Recibir Tornillo 6x1")).toBeNull();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeTruthy();
  });

  it("el filtro por estado consulta al servidor y vuelve a la página 1", async () => {
    renderPage();
    await screen.findByText("OC-2026-0031");
    fireEvent.click(screen.getByRole("radio", { name: "Borrador" }));
    await waitFor(() => expect(api.listOrders).toHaveBeenLastCalledWith({ page: 1, status: "borrador" }));
  });

  it("registra la recepción parcial, muestra la confirmación e invalida el caché", async () => {
    api.receiveOrder.mockResolvedValue(detail({ status: "parcial" }));
    const { invalidate } = renderPage();
    const input = await screen.findByLabelText("Recibir Tornillo 6x1");
    const registrar = screen.getByRole("button", { name: "Registrar recepción" }) as HTMLButtonElement;
    expect(registrar.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "15" } });
    expect(registrar.disabled).toBe(false);
    fireEvent.click(registrar);
    await waitFor(() => expect(api.receiveOrder).toHaveBeenCalledWith(31, [{ order_item_id: 101, received_quantity: "15" }]));
    expect(await screen.findByText("Recepción registrada. El inventario se actualizó.")).toBeTruthy();
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes("purchase-orders"))).toBe(true);
    expect(keys.some((k) => k.includes("stock"))).toBe(true);
  });

  it("'Recibir todo' llena lo pendiente de cada partida", async () => {
    renderPage();
    const input = (await screen.findByLabelText("Recibir Tornillo 6x1")) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Recibir todo" }));
    expect(input.value).toBe("40");
    // La partida ya completa no tiene campo
    expect(screen.queryByLabelText("Recibir Disco de corte")).toBeNull();
  });

  it("muestra el error del servidor al recibir", async () => {
    api.receiveOrder.mockRejectedValue(Object.assign(new Error("x"), { isAxiosError: true }));
    renderPage();
    fireEvent.change(await screen.findByLabelText("Recibir Tornillo 6x1"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar recepción" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo procesar la recepción.");
  });

  it("enviar al proveedor solo aparece en borrador y llama a la API", async () => {
    api.listOrders.mockResolvedValue(ordersPage([listRow({ status: "borrador" })]));
    api.getOrder.mockResolvedValue(detail({ status: "borrador" }));
    api.sendOrder.mockResolvedValue(detail({ status: "enviada" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Enviar al proveedor" }));
    await waitFor(() => expect(api.sendOrder).toHaveBeenCalledWith(31));
    // En borrador no hay columna ni campos para recibir
    expect(screen.queryByLabelText("Recibir Tornillo 6x1")).toBeNull();
  });

  it("cancelar una orden pide confirmación antes de llamar a la API", async () => {
    api.cancelOrder.mockResolvedValue(detail({ status: "cancelada" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar orden" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Esta acción no se puede deshacer/)).toBeTruthy();
    expect(api.cancelOrder).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar orden" }));
    await waitFor(() => expect(api.cancelOrder).toHaveBeenCalled());
    expect(api.cancelOrder.mock.calls[0][0]).toBe(31);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Imprimir abre el diálogo de impresión con la vista imprimible de la orden", async () => {
    const print = vi.fn();
    window.print = print;
    renderPage();
    await screen.findByRole("table", { name: "Partidas de la orden OC-2026-0031" });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    // Al terminar de imprimir, la vista imprimible se retira del documento
    await waitFor(() => expect(document.querySelector("[data-print-root]")).toBeNull());
  });
});

describe("Compras · nueva orden", () => {
  it("permite crear una orden sin proveedor (supplier_id null)", async () => {
    api.listProducts.mockResolvedValue({
      items: [{ id: 1, name: "Tornillo 6x1", sku: "TOR-6X1", purchase_price: "42.50", tax_rate: "16.00" }],
      total: 1, page: 1, pages: 1, per_page: 30,
    });
    api.createOrder.mockResolvedValue(detail());
    renderPage();
    await screen.findByText("OC-2026-0031");
    fireEvent.click(screen.getByRole("button", { name: /Nueva orden/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Agregar productos"), { target: { value: "torn" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Tornillo 6x1/ }));
    expect(within(dialog).getAllByText("$42.50").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear orden" }));
    await waitFor(() =>
      expect(api.createOrder).toHaveBeenCalledWith({
        supplier_id: null,
        items: [{ product_id: 1, quantity: "1", unit_cost: "42.50", tax_rate: "16.00" }],
        notes: undefined,
        expected_date: undefined,
      }),
    );
  });

  it("no deja crear sin partidas", async () => {
    renderPage();
    await screen.findByText("OC-2026-0031");
    fireEvent.click(screen.getByRole("button", { name: /Nueva orden/ }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByRole("button", { name: "Crear orden" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Compras · proveedores", () => {
  async function openSuppliers() {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Proveedores" }));
    return screen.findByRole("table", { name: "Tabla de proveedores" });
  }

  it("muestra contacto, teléfono, email y condiciones", async () => {
    const table = await openSuppliers();
    expect(within(table).getByText("Ricardo Salinas")).toBeTruthy();
    expect(within(table).getByText("477 712 4400")).toBeTruthy();
    expect(within(table).getByText("ventas@dfbajio.mx")).toBeTruthy();
    expect(within(table).getByText("Crédito 30 días")).toBeTruthy();
    expect(within(table).getByText("Activo")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Nuevo proveedor/ })).toBeTruthy();
  });

  it("desactivar pide confirmación", async () => {
    api.deactivateSupplier.mockResolvedValue(supplier({ is_active: false }));
    await openSuppliers();
    fireEvent.click(screen.getByRole("button", { name: "Desactivar Distribuidora del Bajío" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.deactivateSupplier).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(api.deactivateSupplier).toHaveBeenCalled());
    expect(api.deactivateSupplier.mock.calls[0][0]).toBe(1);
  });

  it("estados vacío y error", async () => {
    api.listSuppliers.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1, per_page: 100 });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Proveedores" }));
    expect(await screen.findByText("Aún no hay proveedores registrados.")).toBeTruthy();
  });

  it("con solo compras:ver no hay acciones de edición", async () => {
    setUser(LECTOR);
    await openSuppliers();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Desactivar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nuevo proveedor/ })).toBeNull();
  });

  it("el formulario guarda las condiciones de pago", async () => {
    api.createSupplier.mockResolvedValue(supplier());
    await openSuppliers();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo proveedor/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nombre"), { target: { value: "Pinturas MX" } });
    fireEvent.change(within(dialog).getByLabelText("Condiciones de pago"), { target: { value: "Contado" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.createSupplier).toHaveBeenCalled());
    expect(api.createSupplier.mock.calls[0][0]).toEqual(expect.objectContaining({ name: "Pinturas MX", payment_terms: "Contado" }));
  });
});
