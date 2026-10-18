import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { ReportsPage } from "../../reports";

const api = vi.hoisted(() => ({
  fetchSalesReport: vi.fn(),
  fetchInventoryValuation: vi.fn(),
  fetchTopProducts: vi.fn(),
  fetchGrossMargin: vi.fn(),
}));
const csv = vi.hoisted(() => ({ downloadCsv: vi.fn() }));

vi.mock("../../../api/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/reports")>()),
  ...api,
}));
vi.mock("../csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../csv")>()),
  ...csv,
}));

const periodo = { from: "2026-09-12", to: "2026-10-12" };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Reportes (7.2)", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    csv.downloadCsv.mockReset();
    api.fetchSalesReport.mockResolvedValue({
      period: periodo,
      total_sales: 4,
      total_revenue: "1000.00",
      cancelled_sales: 1,
      daily: [{ date: "2026-10-11", count: 4, revenue: "1000.00" }],
      payment_methods: [{ method: "efectivo", count: 4, net_amount: "1000.00" }],
    });
    api.fetchInventoryValuation.mockResolvedValue({
      total_valuation: "5000.00", total_units: "10", product_count: 1,
      items: [{ product_id: 1, sku: "MAR-016", name: "Martillo", quantity: "10", avg_cost: "500.0000", valuation: "5000.00" }],
    });
    api.fetchTopProducts.mockResolvedValue({
      period: periodo, sort_by: "revenue",
      items: [
        { product_id: 1, product_name: "Cemento", product_sku: "CEM-50", total_quantity: "6", total_revenue: "750.00", sale_count: 3 },
        { product_id: 2, product_name: "Cable", product_sku: "CAB-12", total_quantity: "10", total_revenue: "250.00", sale_count: 2 },
      ],
    });
    api.fetchGrossMargin.mockResolvedValue({
      period: periodo,
      summary: { total_revenue: "1000.00", total_cost: "600.00", gross_margin: "400.00", margin_percent: "40.00" },
      items: [{ product_id: 1, product_name: "Cemento", product_sku: "CEM-50", total_quantity: "6", total_revenue: "1000.00", total_cost: "600.00", gross_margin: "400.00", margin_percent: "40.00" }],
    });
  });

  it("muestra ventas con ticket promedio calculado, un solo h1 y exporta su CSV", async () => {
    renderPage();
    expect(await screen.findByText("$250.00")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Ingreso diario")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(csv.downloadCsv).toHaveBeenCalledTimes(1);
    const [nombre, encabezados, filas] = csv.downloadCsv.mock.calls[0];
    expect(nombre).toMatch(/^ventas_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(encabezados).toEqual(["Fecha", "Ventas", "Ingreso"]);
    expect(filas).toEqual([["2026-10-11", 4, "1000.00"]]);
  });

  it("valida el rango y no consulta cuando Desde es posterior a Hasta", async () => {
    renderPage();
    await screen.findByText("Ticket promedio");
    api.fetchSalesReport.mockClear();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2099-01-01" } });
    expect(screen.getByRole("alert").textContent).toContain("La fecha inicial debe ser anterior o igual a la final.");
    expect(api.fetchSalesReport).not.toHaveBeenCalled();
  });

  it("un atajo cambia el rango y se marca como activo", async () => {
    renderPage();
    await screen.findByText("Ticket promedio");
    fireEvent.click(screen.getByRole("radio", { name: "7 días" }));
    expect(screen.getByRole("radio", { name: "7 días" }).getAttribute("aria-checked")).toBe("true");
    expect(api.fetchSalesReport).toHaveBeenCalledTimes(2);
  });

  it("muestra el estado vacío y el error del reporte de ventas", async () => {
    api.fetchSalesReport.mockResolvedValue({ period: periodo, total_sales: 0, total_revenue: "0.00", cancelled_sales: 0, daily: [], payment_methods: [] });
    const { unmount } = renderPage();
    expect((await screen.findAllByText("Sin datos en el periodo.")).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Exportar CSV" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    api.fetchSalesReport.mockRejectedValue(new Error("falla"));
    renderPage();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
  });

  it("muestra días y métodos con neto negativo por devoluciones (RF-25)", async () => {
    api.fetchSalesReport.mockResolvedValue({
      period: periodo,
      total_sales: 1,
      total_revenue: "166.00",
      cancelled_sales: 0,
      daily: [
        { date: "2026-10-09", count: 0, revenue: "-116.00" },
        { date: "2026-10-11", count: 1, revenue: "282.00" },
      ],
      payment_methods: [
        { method: "efectivo", count: 1, net_amount: "266.00" },
        { method: "tarjeta", count: 0, net_amount: "-100.00" },
      ],
    });
    renderPage();
    const negativoDia = await screen.findByText("-$116.00");
    expect(negativoDia.className).toContain("text-bad");
    const negativoMetodo = screen.getByText("-$100.00");
    expect(negativoMetodo.className).toContain("text-bad");
    // La dona reparte solo lo positivo y el centro muestra el neto, que cuadra con el total
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getAllByText("$166.00").length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN|\$-/)).toBeNull();
  });

  it("top productos muestra la participación y exporta con ella", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Top productos/ }));
    expect(await screen.findByText("75.0%")).toBeTruthy();
    expect(screen.getByText("25.0%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    const [, encabezados, filas] = csv.downloadCsv.mock.calls[0];
    expect(encabezados).toContain("Participación %");
    expect(filas[0][6]).toBe("75.0");
  });

  it("valuación oculta el rango y exporta; margen exporta sus columnas", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Valuación" }));
    expect(await screen.findByText("Martillo")).toBeTruthy();
    expect(screen.queryByLabelText("Desde")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(csv.downloadCsv.mock.calls[0][0]).toBe("valuacion_inventario.csv");

    fireEvent.click(screen.getByRole("tab", { name: "Margen" }));
    expect((await screen.findAllByText("Cemento")).length).toBeGreaterThan(0);
    await waitFor(() => expect((screen.getByRole("button", { name: "Exportar CSV" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(csv.downloadCsv.mock.calls[1][1]).toEqual(["SKU", "Producto", "Cantidad", "Ingreso", "Costo", "Margen", "Margen %"]);
  });
});
