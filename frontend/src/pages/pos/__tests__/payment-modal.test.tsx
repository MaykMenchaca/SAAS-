import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";

import type { CartItem } from "../../../stores/pos-store";
import { usePosStore } from "../../../stores/pos-store";
import { useAuthStore } from "../../../stores/auth-store";
import { PaymentModal } from "../payment-modal";

const createSale = vi.fn();
const quoteSale = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock("../../../api/sales", () => ({ createSale: (p: unknown) => createSale(p), quoteSale: (p: unknown) => quoteSale(p) }));
vi.mock("../../../api/invalidate", () => ({ invalidateAfterSale: vi.fn(async () => undefined) }));
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), warning: (m: string) => toastWarning(m), success: vi.fn() } }));

const item = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 1, product_name: "Martillo", product_sku: "MAR-016", quantity: 2, unit_price: "100.00",
  tax_rate: "16.00", discount_percent: "0.00", unit_abbreviation: "pz", allows_fractions: false, ...over,
});

const serverSale = { id: 11, folio: "V-20261012-0011", total: "232.00", payments: [], items: [] };

function open(total = 232, onSuccess = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymentModal defaultMethod="efectivo" onClose={onClose} onSuccess={onSuccess} sessionId={7} total={total} />
    </QueryClientProvider>,
  );
  return { onSuccess, onClose };
}

const dialog = () => screen.getByRole("dialog", { name: "Cobrar venta" });
const amount = () => (dialog().querySelector("#pay-amount") as HTMLInputElement).value;
const key = (k: string) => fireEvent.click(within(dialog()).getByRole("button", { name: k }));
const confirm = () => within(dialog()).getByRole("button", { name: /Completar cobro|Procesando/ }) as HTMLButtonElement;
const status = () => within(dialog()).getByRole("status").textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  usePosStore.setState({ cart: [item()], offlineSalesQueue: [], rejectedSales: [] });
  useAuthStore.setState({ user: { id: 1, username: "admin", full_name: "Administrador", role: "admin", permissions: [] } as never });
  quoteSale.mockResolvedValue({ total: "232.00" });
  createSale.mockResolvedValue(serverSale);
});

describe("PaymentModal: total y cotización oficial", () => {
  it("abre con el total del ticket y el monto prellenado (cobro exacto)", async () => {
    open();
    expect(screen.getAllByText("$232.00").length).toBeGreaterThan(0);
    expect(amount()).toBe("232.00");
    expect(status()).toBe("Cobro completo$0.00");
    expect(confirm().disabled).toBe(false);
  });

  it("pide la cotización al servidor con cantidades de 3 decimales y SIN precio ni IVA (el servidor manda)", async () => {
    open();
    await waitFor(() => expect(quoteSale).toHaveBeenCalled());
    expect(quoteSale).toHaveBeenCalledWith({
      session_id: 7,
      items: [{ product_id: 1, quantity: "2.000", discount_percent: "0.00" }],
    });
  });

  it("si el total oficial difiere del local, gana el del servidor y se actualiza el monto prellenado", async () => {
    quoteSale.mockResolvedValue({ total: "233.01" });
    open();
    await waitFor(() => expect(amount()).toBe("233.01"));
    expect(screen.getAllByText("$233.01").length).toBeGreaterThan(0);
  });

  it("si la cotización falla (sin servidor), se usa el total local", async () => {
    quoteSale.mockRejectedValue(new Error("red"));
    open();
    await waitFor(() => expect(quoteSale).toHaveBeenCalled());
    expect(amount()).toBe("232.00");
  });
});

describe("PaymentModal: monto, teclado y cambio", () => {
  it("el teclado teclea el monto y calcula el cambio como vista previa", () => {
    open();
    key("Limpiar");
    for (const d of ["5", "0", "0"]) key(d);
    expect(amount()).toBe("500");
    expect(status()).toBe("Cambio a entregar$268.00");
  });

  it("monto insuficiente: 'Falta por cobrar' y no deja completar", () => {
    open();
    key("Limpiar");
    key("1");
    key("0");
    key("0");
    expect(status()).toBe("Falta por cobrar$132.00");
    expect(confirm().disabled).toBe(true);
  });

  it("el retroceso borra el último dígito y el punto decimal no se repite", () => {
    open();
    key("Limpiar");
    key("2");
    key("Punto decimal");
    key("Punto decimal");
    key("5");
    expect(amount()).toBe("2.5");
    key("Borrar el último dígito");
    expect(amount()).toBe("2.");
  });

  it("los billetes rápidos solo ofrecen los que alcanzan y 'Exacto' vuelve al total", () => {
    open();
    const quick = within(dialog()).getAllByRole("button").map((b) => b.textContent);
    expect(quick).toContain("$500.00");
    expect(quick).toContain("$1,000.00");
    expect(quick).not.toContain("$200.00"); // 200 < 232
    fireEvent.click(within(dialog()).getByRole("button", { name: "$500.00" }));
    expect(amount()).toBe("500.00");
    fireEvent.click(within(dialog()).getAllByRole("button", { name: "Exacto" })[0]);
    expect(amount()).toBe("232.00");
  });

  it("el campo de monto solo acepta dígitos y punto", () => {
    open();
    fireEvent.change(dialog().querySelector("#pay-amount") as HTMLInputElement, { target: { value: "12a3,4.5" } });
    expect(amount()).toBe("1234.5"); // letras y comas se descartan
  });

  it("con tarjeta se pide la referencia y no se muestra el cambio en efectivo", () => {
    open();
    fireEvent.click(within(dialog()).getByRole("radio", { name: /Tarjeta/ }));
    expect(within(dialog()).getByLabelText("Referencia de pago")).toBeTruthy();
    expect(within(dialog()).getByText("Monto cobrado")).toBeTruthy();
  });
});

describe("PaymentModal: pagos divididos", () => {
  it("agrega otro pago con lo que falta, lo lista y permite quitarlo", () => {
    open();
    key("Limpiar");
    key("2");
    key("0");
    key("0");
    fireEvent.click(within(dialog()).getByRole("button", { name: /Dividir en otro método/ }));
    const list = within(dialog()).getByRole("list", { name: "Pagos registrados" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(amount()).toBe("32.00"); // lo que faltaba
    expect(screen.getByText(/Suma de pagos/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Quitar el pago 2" }));
    expect(within(dialog()).queryByRole("list", { name: "Pagos registrados" })).toBeNull();
  });

  it("dos pagos que suman el total permiten completar (FE-104: en centavos enteros)", () => {
    open(11.13);
    key("Limpiar");
    key("1");
    key("0");
    fireEvent.click(within(dialog()).getByRole("button", { name: /Dividir en otro método/ }));
    // el segundo pago nace con lo que faltaba (1.13)
    expect(amount()).toBe("1.13");
    expect(confirm().disabled).toBe(false);
    expect(status()).toBe("Cobro completo$0.00");
  });
});

describe("PaymentModal: completar el cobro", () => {
  it("envía la venta UNA sola vez aunque se haga doble clic (guard síncrono) y con client_uuid", async () => {
    const { onSuccess } = open();
    const button = confirm();
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(createSale).toHaveBeenCalledTimes(1);
    const payload = createSale.mock.calls[0][0];
    expect(payload.client_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.session_id).toBe(7);
    expect(payload.items[0]).toMatchObject({ product_id: 1, quantity: "2.000" });
    expect(payload.payments[0]).toMatchObject({ method: "efectivo", amount: "232.00", change_amount: "0.00" });
    expect(onSuccess).toHaveBeenCalledWith(serverSale);
    expect(usePosStore.getState().cart).toHaveLength(0);
  });

  it("el cambio viaja solo como referencia; el servidor lo recalcula", async () => {
    const { onSuccess } = open();
    key("Limpiar");
    for (const d of ["5", "0", "0"]) key(d);
    await act(async () => fireEvent.click(confirm()));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(createSale.mock.calls[0][0].payments[0]).toMatchObject({ amount: "500", change_amount: "268.00" });
  });

  it("H-03: un 4xx/5xx del servidor NO pasa a offline: error visible, carrito intacto, nada encolado", async () => {
    createSale.mockRejectedValue(new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, { status: 400, data: { error: "Stock insuficiente: 1.000 disponible, 2 solicitado" } } as never));
    const { onSuccess } = open();
    await act(async () => fireEvent.click(confirm()));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Stock insuficiente: 1.000 disponible, 2 solicitado"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(usePosStore.getState().cart).toHaveLength(1);
    expect(usePosStore.getState().offlineSalesQueue).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Cobrar venta" })).toBeTruthy(); // el modal sigue abierto
    expect(screen.getByRole("alert").textContent).toContain("Stock insuficiente");
  });

  it("un error de red real (sin respuesta) guarda la venta offline con su client_uuid y el usuario real", async () => {
    createSale.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    const { onSuccess } = open();
    await act(async () => fireEvent.click(confirm()));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const queued = usePosStore.getState().offlineSalesQueue;
    expect(queued).toHaveLength(1);
    expect(queued[0].userId).toBe(1);
    expect(queued[0].sale.client_uuid).toBeTruthy();
    expect(queued[0].sale.open_drawer).toBe(false);
    const provisional = onSuccess.mock.calls[0][0];
    expect(provisional.id).toBeLessThan(0);
    expect(provisional.folio).toBe("PENDIENTE DE SINCRONIZAR");
    expect(provisional.username).toBe("Administrador");
    expect(provisional.total).toBe("232.00");
    expect(usePosStore.getState().cart).toHaveLength(0);
    expect(toastWarning).toHaveBeenCalled();
  });
});

describe("PaymentModal: cierre", () => {
  it("Cancelar cierra sin vender", () => {
    const { onClose } = open();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(createSale).not.toHaveBeenCalled();
  });

  it("la referencia solo se envía con métodos distintos de efectivo", async () => {
    const { onSuccess } = open();
    fireEvent.click(within(dialog()).getByRole("radio", { name: /Tarjeta/ }));
    fireEvent.change(within(dialog()).getByLabelText("Referencia de pago"), { target: { value: "4321" } });
    await act(async () => fireEvent.click(confirm()));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(createSale.mock.calls[0][0].payments[0]).toMatchObject({ method: "tarjeta", reference: "4321", change_amount: "0.00" });
  });
});
