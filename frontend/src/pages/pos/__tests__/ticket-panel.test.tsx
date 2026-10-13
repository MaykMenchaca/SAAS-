import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { Sale } from "../../../api/sales";
import type { CartItem } from "../../../stores/pos-store";
import { usePosStore } from "../../../stores/pos-store";
import { saleChange, TicketPanel } from "../ticket-panel";

const pieza = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 1, product_name: "Martillo uña curva", product_sku: "MAR-016", quantity: 2, unit_price: "100.00",
  tax_rate: "16.00", discount_percent: "0.00", unit_abbreviation: "pz", allows_fractions: false, ...over,
});
const cable = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 2, product_name: "Cable THW cal. 12", product_sku: "CAB-12", quantity: 1, unit_price: "16.50",
  tax_rate: "16.00", discount_percent: "0.00", unit_abbreviation: "m", allows_fractions: true, ...over,
});

const handlers = () => ({ onClear: vi.fn(), onMethod: vi.fn(), onPay: vi.fn(), onPrintLast: vi.fn() });

function renderPanel(cart: CartItem[], extra: Partial<React.ComponentProps<typeof TicketPanel>> = {}) {
  usePosStore.setState({ cart });
  const h = handlers();
  render(<TicketPanel canDiscount={false} cart={cart} cashierName="Jorge Pérez" lastSale={null} method="efectivo" sessionName="Caja 1" {...h} {...extra} />);
  return h;
}

const sale = (over: Partial<Sale> = {}): Sale =>
  ({ id: 9, folio: "V-20261012-0009", total: "682.66", payments: [{ id: 1, method: "efectivo", amount: "1000.00", reference: null, change_amount: "317.34" }], ...over }) as Sale;

beforeEach(() => usePosStore.setState({ cart: [] }));

describe("TicketPanel: ticket vacío y encabezado", () => {
  it("vacío: invita a escanear y deshabilita Cobrar y Vaciar", () => {
    renderPanel([]);
    expect(screen.getByText("El ticket está vacío")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Cobrar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Vaciar ticket" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("muestra la caja y el cajero", () => {
    renderPanel([]);
    expect(screen.getByText("Caja 1 · Jorge Pérez")).toBeTruthy();
  });
});

describe("TicketPanel: totales", () => {
  it("subtotal, IVA y total coinciden con el cálculo del carrito (2 × $100 al 16 %)", () => {
    renderPanel([pieza()]);
    expect(screen.getByText("Subtotal · 1 artículo")).toBeTruthy();
    expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0);
    expect(screen.getByText("$32.00")).toBeTruthy(); // IVA
    expect(screen.getAllByText("$232.00").length).toBeGreaterThanOrEqual(2); // total + botón Cobrar
  });

  it("sin descuento no aparece la fila 'Descuentos'", () => {
    renderPanel([pieza()]);
    expect(screen.queryByText("Descuentos")).toBeNull();
  });

  it("con descuento: subtotal bruto, 'Descuentos' y total neto + IVA (10 % de $200)", () => {
    renderPanel([pieza({ discount_percent: "10.00" })]);
    expect(screen.getByText("Descuentos")).toBeTruthy();
    expect(screen.getByText("−$20.00")).toBeTruthy();
    // neto 180 + IVA 28.80 = 208.80
    expect(screen.getAllByText("$208.80").length).toBeGreaterThanOrEqual(2);
  });

  it("pluraliza los artículos", () => {
    renderPanel([pieza(), cable()]);
    expect(screen.getByText("Subtotal · 2 artículos")).toBeTruthy();
  });

  it("Cobrar y vaciar llaman a sus manejadores", () => {
    const h = renderPanel([pieza()]);
    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vaciar ticket" }));
    expect(h.onPay).toHaveBeenCalledTimes(1);
    expect(h.onClear).toHaveBeenCalledTimes(1);
  });

  it("el método de pago rápido es un grupo con tres opciones y avisa el cambio", () => {
    const h = renderPanel([pieza()]);
    expect(screen.getByRole("radiogroup", { name: "Método de pago" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Tarjeta/ }));
    expect(h.onMethod).toHaveBeenCalledWith("tarjeta");
    expect(screen.queryByRole("radio", { name: /Crédito/ })).toBeNull(); // Crédito está fuera del MVP
  });
});

describe("TicketPanel: cantidades", () => {
  it("+ y − cambian de uno en uno las piezas y de medio en medio los fraccionables", () => {
    renderPanel([pieza(), cable()]);
    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 pz" }));
    expect(usePosStore.getState().cart[0].quantity).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Agregar 0.5 m" }));
    expect(usePosStore.getState().cart[1].quantity).toBe(1.5);
  });

  it("restar hasta cero quita la línea", () => {
    renderPanel([pieza({ quantity: 1 })]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar 1 pz" }));
    expect(usePosStore.getState().cart).toHaveLength(0);
  });

  it("escribir una cantidad se confirma al salir del campo", () => {
    renderPanel([pieza()]);
    const input = screen.getByLabelText("Cantidad de Martillo uña curva");
    fireEvent.change(input, { target: { value: "7" } });
    expect(usePosStore.getState().cart[0].quantity).toBe(2); // todavía no se confirma
    fireEvent.blur(input);
    expect(usePosStore.getState().cart[0].quantity).toBe(7);
  });

  it("una cantidad inválida (0) se descarta y se conserva la anterior", () => {
    renderPanel([pieza()]);
    const input = screen.getByLabelText("Cantidad de Martillo uña curva");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(usePosStore.getState().cart[0].quantity).toBe(2);
  });

  it("las piezas no aceptan decimales al escribir; los fraccionables sí (con coma)", () => {
    renderPanel([pieza(), cable()]);
    const pz = screen.getByLabelText("Cantidad de Martillo uña curva") as HTMLInputElement;
    fireEvent.change(pz, { target: { value: "1.5" } });
    expect(pz.value).toBe("15");
    const m = screen.getByLabelText("Cantidad de Cable THW cal. 12") as HTMLInputElement;
    fireEvent.change(m, { target: { value: "2,5" } });
    expect(m.value).toBe("2.5");
    fireEvent.blur(m);
    expect(usePosStore.getState().cart[1].quantity).toBe(2.5);
  });

  it("los fraccionables muestran atajos de cantidad; las piezas no", () => {
    renderPanel([pieza(), cable()]);
    expect(screen.getByRole("button", { name: "0.25 m" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "10 m" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "5 m" }));
    expect(usePosStore.getState().cart[1].quantity).toBe(5);
    expect(screen.queryByRole("button", { name: /0.25 pz/ })).toBeNull();
    expect(screen.getByText(/m · admite decimales/)).toBeTruthy();
  });

  it("Quitar saca la línea del ticket", () => {
    renderPanel([pieza(), cable()]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Cable THW cal. 12 del ticket" }));
    expect(usePosStore.getState().cart.map((c) => c.product_id)).toEqual([1]);
  });
});

describe("TicketPanel: descuento por línea (solo con permiso)", () => {
  it("sin permiso no hay botón de descuento", () => {
    renderPanel([pieza()], { canDiscount: false });
    expect(screen.queryByRole("button", { name: /Descuento de/ })).toBeNull();
  });

  it("con permiso abre el editor y aplica un descuento predefinido con 2 decimales", () => {
    renderPanel([pieza()], { canDiscount: true });
    fireEvent.click(screen.getByRole("button", { name: "Descuento de Martillo uña curva" }));
    const group = screen.getByRole("radiogroup", { name: "Descuento de la línea" });
    fireEvent.click(within(group).getByRole("radio", { name: "10%" }));
    expect(usePosStore.getState().cart[0].discount_percent).toBe("10.00");
  });

  it("el campo 'Otro' acota entre 0 y 100", () => {
    renderPanel([pieza()], { canDiscount: true });
    fireEvent.click(screen.getByRole("button", { name: "Descuento de Martillo uña curva" }));
    const other = screen.getByLabelText(/Otro descuento en porcentaje/);
    fireEvent.change(other, { target: { value: "250" } });
    expect(usePosStore.getState().cart[0].discount_percent).toBe("100.00");
    fireEvent.change(other, { target: { value: "7,5" } });
    expect(usePosStore.getState().cart[0].discount_percent).toBe("7.50");
  });

  it("la línea con descuento muestra la etiqueta y el importe bruto tachado", () => {
    renderPanel([pieza({ discount_percent: "10.00" })]);
    expect(screen.getByText("−10%")).toBeTruthy();
    expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0); // bruto
    expect(screen.getAllByText("$180.00").length).toBeGreaterThan(0); // neto
  });
});

describe("TicketPanel: venta completada", () => {
  it("muestra folio, total, cambio y el botón de imprimir (F8)", () => {
    const h = renderPanel([], { lastSale: sale() });
    expect(screen.getByText("Venta completada")).toBeTruthy();
    expect(screen.getByText(/V-20261012-0009 · Total \$682\.66/)).toBeTruthy();
    expect(screen.getByText("Cambio $317.34")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Imprimir ticket/ }));
    expect(h.onPrintLast).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("El ticket está vacío")).toBeNull();
  });

  it("una venta guardada sin conexión (id negativo) no ofrece imprimir y explica por qué", () => {
    renderPanel([], { lastSale: sale({ id: -123, folio: "PENDIENTE DE SINCRONIZAR" }) });
    expect(screen.queryByRole("button", { name: /Imprimir ticket/ })).toBeNull();
    expect(screen.getByText(/se enviará al servidor al volver la conexión/)).toBeTruthy();
  });

  it("con artículos en el ticket no se muestra el aviso de venta anterior", () => {
    renderPanel([pieza()], { lastSale: sale() });
    expect(screen.queryByText("Venta completada")).toBeNull();
  });

  it("saleChange suma el cambio de todos los pagos", () => {
    const s = sale({ payments: [
      { id: 1, method: "efectivo", amount: "50", reference: null, change_amount: "10.50" },
      { id: 2, method: "tarjeta", amount: "20", reference: null, change_amount: "0.00" },
    ] as Sale["payments"] });
    expect(saleChange(s)).toBe(10.5);
  });
});
