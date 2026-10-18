import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";
import { ReturnsPage } from "../returns";
import { SalesHistoryPage } from "../sales-history";

const api = vi.hoisted(() => ({
  listSales: vi.fn(),
  listAllSales: vi.fn(),
  listSaleCashiers: vi.fn(),
  findSaleByFolio: vi.fn(),
  getSale: vi.fn(),
  getActiveSession: vi.fn(),
  returnSale: vi.fn(),
  cancelSale: vi.fn(),
}));

vi.mock("../../api/sales", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/sales")>()),
  ...api,
}));
vi.mock("../../api/printing", () => ({ printSaleTicket: vi.fn(), printResultMessage: vi.fn() }));

const listItem = {
  id: 7, folio: "V-20261012-0007", total: "232.00", status: "completada", created_at: "2026-10-12T18:00:00Z",
  username: "jperez", items_count: "2.000", payment_methods: ["efectivo"],
};
const sale = {
  id: 7, folio: "V-20261012-0007", session_id: 1, user_id: 2, username: "jperez", subtotal: "200.00", discount_total: "0.00",
  tax_total: "32.00", total: "232.00", status: "completada", cancel_reason: null, created_at: "2026-10-12T18:00:00Z",
  items: [
    { id: 11, product_id: 1, product_name: "Martillo", product_sku: "MAR-1", quantity: "2.000", unit_price: "100.00", discount_percent: "0", discount_amount: "0", tax_rate: "16.00", subtotal: "200.00", cost_at_sale: "60", allows_fractions: false, returned_quantity: "0.000", available_quantity: "2.000" },
  ],
  payments: [{ id: 1, method: "efectivo", amount: "232.00", reference: null, change_amount: "0.00" }],
};
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pages: 1, per_page: 20 });

function wrap(ui: React.ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.listSaleCashiers.mockResolvedValue([{ id: 2, username: "jperez" }]);
  api.getActiveSession.mockResolvedValue({ session: { id: 9, cash_register_name: "Caja 1" } });
  api.getSale.mockResolvedValue(sale);
  useAuthStore.setState({ isAuthenticated: true, user: { id: 1, username: "admin", full_name: "Admin", role: "admin", permissions: [] } as never });
});

describe("Devoluciones", () => {
  it("muestra el paso 1 con las ventas recientes", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    wrap(<ReturnsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Devoluciones" })).toBeTruthy();
    expect(await screen.findByText("V-20261012-0007")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Devolver V-20261012-0007" })).toBeTruthy();
  });

  it("estado vacío y de error", async () => {
    api.listSales.mockResolvedValueOnce(page([]));
    const { unmount } = wrap(<ReturnsPage />);
    expect(await screen.findByText("Sin ventas completadas recientes.")).toBeTruthy();
    unmount();
    api.listSales.mockRejectedValue(new Error("x"));
    wrap(<ReturnsPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("folio inexistente muestra el error", async () => {
    api.listSales.mockResolvedValue(page([]));
    api.findSaleByFolio.mockResolvedValue(null);
    wrap(<ReturnsPage />);
    fireEvent.change(screen.getByPlaceholderText(/V-20261011-0001/), { target: { value: "V-X" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar venta" }));
    expect(await screen.findByText("No se encontró ninguna venta con el folio V-X.")).toBeTruthy();
  });

  it("envía restock=false cuando se desmarca y muestra el comprobante con folio D-", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    api.returnSale.mockResolvedValue({
      id: 3, folio: "D-20261012-0003", sale_id: 7, status: "devolucion_parcial", reason: "Roto", refund_total: "116.00",
      created_at: "", returned_items: [], refund_method: "efectivo", restocked: false,
    });
    wrap(<ReturnsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Devolver V-20261012-0007" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Incluir Martillo/ }));
    fireEvent.change(screen.getByLabelText(/Cantidad a devolver de Martillo/), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Regresar artículos al inventario" }));
    fireEvent.change(screen.getByPlaceholderText(/Producto defectuoso/), { target: { value: "Roto" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar devolución/ }));
    await waitFor(() => expect(api.returnSale).toHaveBeenCalled());
    expect(api.returnSale).toHaveBeenCalledWith(7, "Roto", [{ sale_item_id: 11, quantity: "1" }], { sessionId: 9, refundMethod: "efectivo", restock: false });
    expect(await screen.findByText("D-20261012-0003")).toBeTruthy();
    expect(screen.getByText("Los artículos no se regresaron al inventario (merma).")).toBeTruthy();
  });

  it("sin caja abierta no deja reembolsar en efectivo", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    api.getActiveSession.mockResolvedValue({ session: null });
    wrap(<ReturnsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Devolver V-20261012-0007" }));
    expect(await screen.findByText(/No tienes una caja abierta/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Incluir Martillo/ }));
    fireEvent.change(screen.getByPlaceholderText(/Producto defectuoso/), { target: { value: "x" } });
    expect((screen.getByRole("button", { name: /Registrar devolución/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("una cantidad mayor a la disponible se marca y bloquea el envío", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    wrap(<ReturnsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Devolver V-20261012-0007" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Incluir Martillo/ }));
    fireEvent.change(screen.getByLabelText(/Cantidad a devolver de Martillo/), { target: { value: "5" } });
    expect(screen.getByText("Máximo 2.")).toBeTruthy();
  });

  it("abre directo la venta de ?venta=ID", async () => {
    api.listSales.mockResolvedValue(page([]));
    wrap(<ReturnsPage />, "/devoluciones?venta=7");
    expect(await screen.findByRole("heading", { name: "V-20261012-0007" })).toBeTruthy();
  });
});

describe("Historial de ventas", () => {
  it("lista con columnas de cajero, artículos, método y estado", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    wrap(<SalesHistoryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Historial de ventas" })).toBeTruthy();
    expect(await screen.findByText("V-20261012-0007")).toBeTruthy();
    expect(screen.getByText("Efectivo")).toBeTruthy();
    expect(screen.getByText("Completada")).toBeTruthy();
  });

  it("vacío y error", async () => {
    api.listSales.mockResolvedValueOnce(page([]));
    const { unmount } = wrap(<SalesHistoryPage />);
    expect(await screen.findByText("Sin ventas registradas.")).toBeTruthy();
    unmount();
    api.listSales.mockRejectedValue(new Error("x"));
    wrap(<SalesHistoryPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("filtra por cajero y por estado enviando los parámetros a la API", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    wrap(<SalesHistoryPage />);
    await screen.findByText("V-20261012-0007");
    await screen.findByRole("option", { name: "jperez" });
    fireEvent.change(screen.getByLabelText("Cajero"), { target: { value: "2" } });
    await waitFor(() => expect(api.listSales).toHaveBeenLastCalledWith(1, 20, expect.objectContaining({ userId: 2 })));
    fireEvent.click(screen.getByRole("radio", { name: "Canceladas" }));
    await waitFor(() => expect(api.listSales).toHaveBeenLastCalledWith(1, 20, expect.objectContaining({ userId: 2, status: "cancelada" })));
  });

  it("al elegir una venta muestra el ticket con subtotal, IVA y total", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    wrap(<SalesHistoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver venta V-20261012-0007" }));
    expect(await screen.findByText("Subtotal")).toBeTruthy();
    expect(screen.getByText("IVA")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Devolución" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar venta" })).toBeTruthy();
  });

  it("sin permiso de cancelar no ofrece Devolución ni Cancelar venta", async () => {
    useAuthStore.setState({ user: { id: 2, username: "c", full_name: "C", role: "cajero", permissions: ["ventas:ver"] } as never });
    api.listSales.mockResolvedValue(page([listItem]));
    wrap(<SalesHistoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver venta V-20261012-0007" }));
    await screen.findByText("Subtotal");
    expect(screen.queryByRole("button", { name: "Devolución" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar venta" })).toBeNull();
  });

  it("cancelar pide motivo y confirmación", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    api.cancelSale.mockResolvedValue({ ...sale, status: "cancelada" });
    wrap(<SalesHistoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver venta V-20261012-0007" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar venta" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar cancelación" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Ingresa el motivo..."), { target: { value: "Error" } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.cancelSale).toHaveBeenCalledWith(7, "Error"));
  });

  it("Exportar CSV trae todas las ventas filtradas", async () => {
    api.listSales.mockResolvedValue(page([listItem]));
    api.listAllSales.mockResolvedValue([listItem]);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    wrap(<SalesHistoryPage />);
    await screen.findByText("V-20261012-0007");
    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    await waitFor(() => expect(api.listAllSales).toHaveBeenCalled());
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
});
