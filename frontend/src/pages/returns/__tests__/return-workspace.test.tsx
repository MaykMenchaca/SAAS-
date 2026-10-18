import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { formatCurrency } from "../../../lib/formatters";
import { ReturnWorkspace } from "../return-workspace";

const api = vi.hoisted(() => ({ getSale: vi.fn(), getActiveSession: vi.fn(), returnSale: vi.fn() }));

vi.mock("../../../api/sales", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/sales")>()),
  ...api,
}));

const item = {
  product_id: 1, discount_percent: "0", discount_amount: "0", tax_rate: "16.00", cost_at_sale: "1",
  returned_quantity: "0.000",
};
// Venta del reporte de RF-49/RF-51: cinta $18 + 2.5 m de cable a $16.50, pagada con efectivo y tarjeta
const sale = {
  id: 7, folio: "V-20261017-0009", session_id: 1, user_id: 2, username: "jperez", subtotal: "59.25", discount_total: "0.00",
  tax_total: "9.48", total: "68.73", status: "completada", cancel_reason: null, created_at: "2026-10-17T18:00:00Z",
  items: [
    { ...item, id: 21, product_name: "Cinta", product_sku: "CIN-1", quantity: "1.000", unit_price: "18.00", subtotal: "18.00", allows_fractions: false, available_quantity: "1.000" },
    { ...item, id: 22, product_name: "Cable", product_sku: "CAB-1", quantity: "2.500", unit_price: "16.50", subtotal: "41.25", allows_fractions: true, available_quantity: "2.500" },
  ],
  payments: [
    { id: 1, method: "efectivo", amount: "50.00", reference: null, change_amount: "0.00" },
    { id: 2, method: "tarjeta", amount: "18.73", reference: "1234", change_amount: "0.00" },
  ],
};

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReturnWorkspace onBack={() => {}} onDone={() => {}} saleId={7} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.getActiveSession.mockResolvedValue({ session: { id: 9, cash_register_name: "Caja 1" } });
  api.getSale.mockResolvedValue(sale);
});

describe("ReturnWorkspace", () => {
  // RF-51: decía "Efectivo" para una venta pagada con efectivo y tarjeta
  it("muestra todos los métodos de pago originales", async () => {
    wrap();
    expect(await screen.findByText("Método de pago original: Efectivo + Tarjeta.")).toBeTruthy();
    expect(screen.getByText(/Pagada en Efectivo \+ Tarjeta/)).toBeTruthy();
  });

  // RF-49: la pantalla mostró $44.81 y el servidor reembolsó $44.80 (HALF_EVEN)
  it("el estimado coincide con el reembolso del servidor", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Incluir Cinta/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Incluir Cable/ }));
    fireEvent.change(screen.getByLabelText(/Cantidad a devolver de Cable/), { target: { value: "1.25" } });
    expect(screen.getByText(formatCurrency(44.8))).toBeTruthy();
    expect(screen.queryByText(formatCurrency(44.81))).toBeNull();
  });
});
