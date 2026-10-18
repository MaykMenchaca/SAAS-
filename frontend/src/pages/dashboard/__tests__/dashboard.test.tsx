import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { DashboardPage } from "../../dashboard";
import { formatDelta } from "../delta";
import { buildWeek, shortAmount } from "../weekly-chart";

const fetchDashboardSummary = vi.fn();
const getLowStock = vi.fn();
const listSales = vi.fn();
const apiGet = vi.fn();

vi.mock("../../../api/reports", () => ({ fetchDashboardSummary: () => fetchDashboardSummary() }));
vi.mock("../../../api/inventory", () => ({ getLowStock: () => getLowStock() }));
vi.mock("../../../api/sales", () => ({
  listSales: () => listSales(),
  saleStatusMeta: (s: string) => (s === "cancelada" ? { label: "Cancelada", tone: "danger" } : { label: "Completada", tone: "success" }),
}));
vi.mock("../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/client")>();
  return { ...actual, apiClient: { get: (...args: unknown[]) => apiGet(...args) } };
});

const summary = {
  sales_today: 4,
  revenue_today: "1500.00",
  sales_week: 10,
  revenue_week: "5000.00",
  sales_month: 40,
  revenue_month: "20000.00",
  top_products: [
    { name: "Cemento gris 50 kg", quantity: "10.000", revenue: "2500.00" },
    { name: "Cable THW", quantity: "1.000", revenue: "1250.00" },
  ],
  low_stock_count: 2,
  sales_prev_day: 2,
  revenue_prev_day: "1000.00",
  sales_prev_month: 30,
  revenue_prev_month: "25000.00",
  open_sessions: [
    { id: 1, register: "Caja 1", user_id: 9, user: "Ana Ruiz", opened_at: "2026-10-12T14:02:00Z", revenue: "800.00", count: 3 },
    { id: 2, register: "Caja 2", user_id: 5, user: "Luis", opened_at: null, revenue: "0.00", count: 0 },
  ],
};

function setUser(role = "admin", id = 9) {
  useAuthStore.setState({ isAuthenticated: true, user: { id, username: "ana", full_name: "Ana Ruiz", role, permissions: [], must_change_password: false } as never });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setUser();
  fetchDashboardSummary.mockResolvedValue(summary);
  getLowStock.mockResolvedValue({ items: [{ id: 1, product_name: "Tubo PVC", sku: "PVC-12", quantity: "0", min_stock: "8", unit_abbreviation: "pz" }] });
  listSales.mockResolvedValue({ items: [{ id: 1, folio: "V-1", total: "389.00", status: "completada", created_at: "2026-10-12T20:00:00Z", username: "Ana Ruiz" }] });
  apiGet.mockResolvedValue({ data: { daily: [] } });
});

describe("Dashboard", () => {
  it("muestra KPIs con deltas reales, turno propio, stock crítico, ventas y más vendidos", async () => {
    renderPage();
    expect(await screen.findByText("Turno abierto · Caja 1")).toBeTruthy();
    expect(screen.getByText("+50.0% vs. ayer")).toBeTruthy();
    expect(screen.getByText("−20.0% vs. mes anterior")).toBeTruthy();
    expect(screen.getByText("+2 vs ayer")).toBeTruthy();
    expect(screen.getByText("2 alertas")).toBeTruthy();
    expect(screen.getByText("1 caja más abierta", { exact: false })).toBeTruthy();
    expect(screen.getByText("$800.00")).toBeTruthy();
    expect(await screen.findByText("Tubo PVC")).toBeTruthy();
    expect(await screen.findByText("V-1")).toBeTruthy();
    expect(screen.getByText("Cemento gris 50 kg")).toBeTruthy();
    expect(screen.getByText("10 uds")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("sin sesiones abiertas ofrece abrir caja", async () => {
    fetchDashboardSummary.mockResolvedValue({ ...summary, open_sessions: [] });
    renderPage();
    expect(await screen.findByText("Sin turno abierto")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir caja" })).toBeTruthy();
  });

  it("estados vacíos: sin stock crítico, sin ventas y sin más vendidos", async () => {
    fetchDashboardSummary.mockResolvedValue({ ...summary, top_products: [], low_stock_count: 0 });
    getLowStock.mockResolvedValue({ items: [] });
    listSales.mockResolvedValue({ items: [] });
    renderPage();
    expect(await screen.findByText("Inventario completo y saludable")).toBeTruthy();
    expect(await screen.findByText("Sin transacciones registradas")).toBeTruthy();
    expect(await screen.findByText("Sin ventas este mes")).toBeTruthy();
  });

  it("error del resumen muestra ErrorState", async () => {
    fetchDashboardSummary.mockRejectedValue(new Error("falla"));
    renderPage();
    expect(await screen.findByText("No se pudo cargar el dashboard.")).toBeTruthy();
  });

  it("sin permiso de inventario no consulta el stock crítico", async () => {
    setUser("cajero");
    renderPage();
    await waitFor(() => expect(screen.getByText("Sin acceso al inventario")).toBeTruthy());
    expect(getLowStock).not.toHaveBeenCalled();
  });

  it("un día o un turno con solo devoluciones muestra el neto negativo en rojo", async () => {
    fetchDashboardSummary.mockResolvedValue({
      ...summary,
      sales_today: 0,
      revenue_today: "-116.00",
      revenue_month: "-116.00",
      open_sessions: [{ ...summary.open_sessions[0], revenue: "-50.00", count: 0 }],
    });
    renderPage();
    expect(await screen.findByText("Turno abierto · Caja 1")).toBeTruthy();
    const hoy = screen.getAllByText("-$116.00");
    expect(hoy).toHaveLength(2); // Ventas hoy y Ventas del mes
    hoy.forEach((el) => expect(el.className).toContain("text-bad"));
    const turno = screen.getByText("-$50.00");
    expect(turno.className).toContain("text-bad");
    expect(screen.queryByText("$-116.00")).toBeNull();
  });

  it("muestra la gráfica semanal con el ingreso de cada día", async () => {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    apiGet.mockResolvedValue({ data: { daily: [{ date: iso, revenue: "1500.00" }] } });
    renderPage();
    expect(await screen.findByRole("img", { name: "Ventas de los últimos 7 días" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("$1.5k").length).toBeGreaterThan(0));
  });
});

describe("helpers del dashboard", () => {
  it("formatDelta no inventa variación sin base de comparación", () => {
    expect(formatDelta(10, 0, "percent")).toBeNull();
    expect(formatDelta(5, 8, "count")).toBe("−3 vs ayer");
  });

  it("buildWeek devuelve 7 días terminando hoy y rellena con cero", () => {
    const week = buildWeek(undefined, new Date(2026, 9, 12));
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ date: "2026-10-12", isToday: true, value: 0 });
    expect(week[0].date).toBe("2026-10-06");
  });

  it("shortAmount abrevia miles", () => {
    expect(shortAmount(14382.5)).toBe("$14.4k");
    expect(shortAmount(72.4)).toBe("$72");
  });

  it("shortAmount pone el signo delante en negativos", () => {
    expect(shortAmount(-116)).toBe("-$116");
    expect(shortAmount(-1500)).toBe("-$1.5k");
  });
});
