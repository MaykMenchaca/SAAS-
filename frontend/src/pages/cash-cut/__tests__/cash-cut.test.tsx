import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { usePosStore } from "../../../stores/pos-store";
import { CashCutPage } from "../../cash-cut";
import { calcDenominationTotal, cashDifference, differenceTone, emptyCounts, formatSigned } from "../denominations";

const listSessions = vi.fn();
const getSessionSummary = vi.fn();
const closeCashRegister = vi.fn();

vi.mock("../../../api/sales", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/sales")>()),
  listSessions: () => listSessions(),
  getSessionSummary: (id: number) => getSessionSummary(id),
  closeCashRegister: (...args: unknown[]) => closeCashRegister(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const abierta = {
  id: 7, cash_register_id: 1, cash_register_name: "Caja 1", user_id: 2, username: "jperez", opening_amount: "1500.00",
  closing_amount: null, expected_cash: null, difference: null, status: "abierta", opened_at: "2026-10-12T14:02:00Z", closed_at: null, close_notes: null,
};
const cerrada = {
  ...abierta, id: 5, status: "cerrada", closing_amount: "10842.50", expected_cash: "10842.50", difference: "0.00", closed_at: "2026-10-10T21:04:00Z", close_notes: "Todo en orden",
};
const faltante = { ...cerrada, id: 4, cash_register_name: "Caja 2", closing_amount: "6180.00", expected_cash: "6210.00", difference: "-30.00" };
const summary = {
  session_id: 7, opening_amount: "1500.00", closing_amount: null, expected_cash: null, difference: null, status: "abierta",
  sales_completed: 48, sales_cancelled: 1, grand_total: "14382.50", payment_methods: { efectivo: "9860.00", tarjeta: "3420.50", transferencia: "1102.00" },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CashCutPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function abrirArqueo() {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /Realizar arqueo/ }));
  await screen.findByText("Total vendido en turno");
}

beforeEach(() => {
  vi.clearAllMocks();
  usePosStore.setState({ offlineSalesQueue: [] } as never);
  listSessions.mockResolvedValue({ items: [abierta, cerrada, faltante] });
  getSessionSummary.mockResolvedValue(summary);
  closeCashRegister.mockResolvedValue({ ...abierta, status: "cerrada" });
});

describe("denominaciones (funciones puras)", () => {
  it("suma en centavos sin error de coma flotante", () => {
    const counts = { ...emptyCounts(), 1000: 1, 0.5: 3, 20: 2 };
    expect(calcDenominationTotal(counts)).toBe(1041.5);
    expect(calcDenominationTotal({ ...emptyCounts(), 0.5: 7 })).toBe(3.5);
  });

  it("diferencia, tono y formato con signo", () => {
    expect(cashDifference(100.1, 100)).toBe(0.1);
    expect(differenceTone(0, true)).toBe("ok");
    expect(differenceTone(-5, true)).toBe("short");
    expect(differenceTone(5, true)).toBe("over");
    expect(differenceTone(5, false)).toBe("empty");
    expect(formatSigned(-30)).toBe("−$30.00");
    expect(formatSigned(12.5)).toBe("+$12.50");
    expect(formatSigned(0)).toBe("$0.00");
  });
});

describe("Corte de caja: lista e historial", () => {
  it("muestra la sesión abierta con su fondo y un solo h1", async () => {
    renderPage();
    expect(await screen.findByText("Caja 1")).toBeTruthy();
    expect(screen.getByText("$1,500.00")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("sin sesiones abiertas ofrece abrir caja", async () => {
    listSessions.mockResolvedValue({ items: [cerrada] });
    renderPage();
    expect(await screen.findByText(/No hay sesiones de caja abiertas/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir caja en el Punto de Venta/ })).toBeTruthy();
  });

  it("muestra error con reintento", async () => {
    listSessions.mockRejectedValue(new Error("falla"));
    renderPage();
    expect(await screen.findByRole("button", { name: /Reintentar/i })).toBeTruthy();
  });

  it("el historial lista cortes con diferencia coloreada y abre el arqueo", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    expect(await screen.findByText("−$30.00")).toBeTruthy();
    expect(screen.getAllByText("$10,842.50").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Ver arqueo de Caja 2/ }));
    expect(await screen.findByText("Resumen del turno")).toBeTruthy();
    expect(screen.getByText("Imprimir comprobante de corte", { exact: false })).toBeTruthy();
  });

  it("historial vacío", async () => {
    listSessions.mockResolvedValue({ items: [abierta] });
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Historial" }));
    expect(await screen.findByText("No hay cortes de caja cerrados registrados.")).toBeTruthy();
  });
});

describe("Corte de caja: arqueo y cierre", () => {
  it("el conteo por denominaciones calcula total, diferencia (faltante) y se reinicia", async () => {
    await abrirArqueo();
    // esperado = 1500 + 9860 = 11,360
    expect(screen.getAllByText("Efectivo esperado")[0].parentElement?.textContent).toContain("$11,360.00");
    fireEvent.click(screen.getByRole("button", { name: "Agregar uno de billetes de $1,000" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar uno de billetes de $1,000" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar uno de monedas de $0.50" }));
    expect(screen.getByTestId("counted-total").textContent).toBe("$2,000.50");
    const box = screen.getByTestId("difference-box");
    expect(box.textContent).toContain("Faltante");
    expect(box.textContent).toContain("−$9,359.50");

    fireEvent.click(screen.getByRole("button", { name: "Reiniciar conteo" }));
    expect(screen.getByTestId("counted-total").textContent).toBe("$0.00");
    expect(screen.getByTestId("difference-box").textContent).toContain("Ingresa el monto contado");
  });

  it("sobrante y cuadre se distinguen al capturar el total directo", async () => {
    await abrirArqueo();
    const total = screen.getByLabelText("Total contado en caja");
    fireEvent.change(total, { target: { value: "11360" } });
    expect(screen.getByTestId("difference-box").textContent).toContain("Cuadra");
    fireEvent.change(total, { target: { value: "11400" } });
    expect(screen.getByTestId("difference-box").textContent).toContain("Sobrante");
    expect(screen.getByTestId("difference-box").textContent).toContain("+$40.00");
  });

  it("cierre con confirmación: envía el total y las observaciones", async () => {
    await abrirArqueo();
    fireEvent.change(screen.getByLabelText("Total contado en caja"), { target: { value: "11360" } });
    fireEvent.change(screen.getByLabelText("Observaciones"), { target: { value: "Sin novedades" } });
    fireEvent.click(screen.getByRole("button", { name: /Cerrar turno e imprimir corte/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Esta acción no se puede deshacer/)).toBeTruthy();
    expect(closeCashRegister).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sí, cerrar turno" }));
    await waitFor(() => expect(closeCashRegister).toHaveBeenCalledWith(7, "11360.00", "Sin novedades"));
    expect(await screen.findByText(/Turno cerrado/)).toBeTruthy();
  });

  // RF-50: tras cerrar mostraba "cerrado —" sin hora y sin las observaciones que el servidor guardó
  it("tras cerrar muestra la hora de cierre y las observaciones guardadas", async () => {
    closeCashRegister.mockResolvedValue({
      ...abierta, status: "cerrada", closing_amount: "11355.00", expected_cash: "11360.00", difference: "-5.00",
      closed_at: "2026-10-12T22:15:00Z", close_notes: "Faltan 5 pesos",
    });
    await abrirArqueo();
    fireEvent.change(screen.getByLabelText("Total contado en caja"), { target: { value: "11355" } });
    fireEvent.change(screen.getByLabelText("Observaciones"), { target: { value: "Faltan 5 pesos" } });
    fireEvent.click(screen.getByRole("button", { name: /Cerrar turno e imprimir corte/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, cerrar turno" }));
    expect(await screen.findByText(/Turno cerrado/)).toBeTruthy();
    const cierre = new Date("2026-10-12T22:15:00Z").toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    expect(screen.getByText(`Caja 1 · Turno de jperez · cerrado ${cierre}`)).toBeTruthy();
    expect(screen.queryByText(/cerrado —/)).toBeNull();
    expect((screen.getByLabelText("Observaciones") as HTMLTextAreaElement).value).toBe("Faltan 5 pesos");
    // El comprobante imprimible lleva las observaciones guardadas
    expect(screen.getByText("Observaciones:").parentElement?.textContent).toContain("Faltan 5 pesos");
  });

  it("sin total capturado no abre la confirmación", async () => {
    await abrirArqueo();
    fireEvent.click(screen.getByRole("button", { name: /Cerrar turno e imprimir corte/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(closeCashRegister).not.toHaveBeenCalled();
  });

  it("ventas pendientes sin conexión bloquean el cierre hasta aceptar", async () => {
    usePosStore.setState({ offlineSalesQueue: [{ sale: { session_id: 7 } }, { sale: { session_id: 7 } }] } as never);
    await abrirArqueo();
    fireEvent.change(screen.getByLabelText("Total contado en caja"), { target: { value: "11360" } });
    fireEvent.click(screen.getByRole("button", { name: /Cerrar turno e imprimir corte/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Hay 2 ventas de este turno cobradas sin conexión/)).toBeTruthy();
    const cerrar = within(dialog).getByRole("button", { name: "Sí, cerrar turno" }) as HTMLButtonElement;
    expect(cerrar.disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText("Entiendo, cerrar de todos modos"));
    expect(cerrar.disabled).toBe(false);
  });

  it("error del servidor al cerrar se muestra en la pantalla", async () => {
    closeCashRegister.mockRejectedValue(new Error("x"));
    await abrirArqueo();
    fireEvent.change(screen.getByLabelText("Total contado en caja"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Cerrar turno e imprimir corte/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, cerrar turno" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo cerrar la caja.");
  });

  it("falla del resumen muestra error con reintento", async () => {
    getSessionSummary.mockRejectedValue(new Error("x"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Realizar arqueo/ }));
    expect(await screen.findByText("No se pudo cargar el resumen del turno.")).toBeTruthy();
  });
});
