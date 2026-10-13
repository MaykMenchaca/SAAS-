import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { createRef } from "react";

import type { Product } from "../../../api/products";
import { useAuthStore } from "../../../stores/auth-store";
import { useConnectionStore } from "../../../stores/connection-store";
import { usePosStore } from "../../../stores/pos-store";
import { CatalogPanel } from "../catalog-panel";
import { OfflineBanner } from "../offline-banner";
import { SessionSelector } from "../session-selector";

const listSessions = vi.fn();
const listCashRegisters = vi.fn();
const openCashRegister = vi.fn();
vi.mock("../../../api/sales", () => ({
  listSessions: (p: unknown) => listSessions(p),
  listCashRegisters: () => listCashRegisters(),
  openCashRegister: (id: number, amount: string) => openCashRegister(id, amount),
}));

const product = (id: number, over: Partial<Product> = {}): Product =>
  ({
    id, sku: `SKU-${id}`, barcode: null, name: `Producto ${id}`, sale_price: "100.00", tax_rate: "16.00", min_stock: "5.000",
    stock_qty: "20.000", unit: { id: 1, name: "Pieza", abbreviation: "pz", allows_fractions: false }, category: null, ...over,
  }) as unknown as Product;

function panel(over: Partial<React.ComponentProps<typeof CatalogPanel>> = {}) {
  const props = {
    catalog: null, categories: [{ id: 3, name: "Pintura", description: null, is_active: true }], categoryId: undefined, cartQty: {},
    feedback: { tone: "info" as const, message: "Escanea con el lector o escribe y presiona Enter para agregar." },
    inputRef: createRef<HTMLInputElement>(), isLoading: false, onCategory: vi.fn(), onSearchChange: vi.fn(), onSearchKeyDown: vi.fn(),
    onSelect: vi.fn(), products: [product(1), product(2)], search: "", serverDown: false, ...over,
  };
  render(<CatalogPanel {...props} />);
  return props;
}

describe("CatalogPanel", () => {
  it("lista los productos con SKU, nombre, precio y existencias", () => {
    panel();
    expect(screen.getByText("SKU-1")).toBeTruthy();
    expect(screen.getByText("Producto 1")).toBeTruthy();
    expect(screen.getAllByText("$100.00")).toHaveLength(2);
    expect(screen.getAllByText("20 pz")).toHaveLength(2);
  });

  it("tocar un producto lo agrega", () => {
    const p = panel();
    fireEvent.click(screen.getByRole("button", { name: /Producto 2/ }));
    expect(p.onSelect).toHaveBeenCalledWith(p.products[1]);
  });

  it("un producto agotado está deshabilitado; uno bajo el mínimo muestra sus existencias", () => {
    panel({ products: [product(1, { stock_qty: "0.000" }), product(2, { stock_qty: "4.000" })] });
    expect(screen.getByText("Agotado")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Producto 1/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Producto 2/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("4 pz")).toBeTruthy();
  });

  it("sin dato de existencias (catálogo local) no se marca como agotado ni se muestra etiqueta", () => {
    panel({ products: [product(1, { stock_qty: undefined })] });
    expect(screen.queryByText("Agotado")).toBeNull();
    expect(screen.queryByText(/^[\d.,]+ pz$/)).toBeNull();
    expect((screen.getByRole("button", { name: /Producto 1/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("muestra 'En ticket' con la cantidad y respeta las unidades fraccionarias", () => {
    panel({
      cartQty: { 1: 2, 2: 1.5 },
      products: [product(1), product(2, { unit: { id: 4, name: "Metro", abbreviation: "m", allows_fractions: true } as never })],
    });
    expect(screen.getByText("En ticket: 2 pz")).toBeTruthy();
    expect(screen.getByText("En ticket: 1.5 m")).toBeTruthy();
  });

  it("el aviso de la zona de búsqueda es un status accesible con el tono indicado", () => {
    panel({ feedback: { tone: "bad", message: "Producto no registrado: 123" } });
    const status = screen.getByText("Producto no registrado: 123").closest("[role=status]") as HTMLElement;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.className).toContain("text-bad");
  });

  it("escribir, Enter y limpiar delegan en el terminal", () => {
    const p = panel({ search: "mart" });
    const input = screen.getByLabelText(/Buscar producto/);
    fireEvent.change(input, { target: { value: "marti" } });
    expect(p.onSearchChange).toHaveBeenCalledWith("marti");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onSearchKeyDown).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(p.onSearchChange).toHaveBeenLastCalledWith("");
  });

  it("sin texto no hay botón de limpiar", () => {
    panel({ search: "" });
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).toBeNull();
  });

  it("las categorías son filtros: 'Todos' está activo y elegir otra avisa", () => {
    const p = panel();
    expect(screen.getByRole("button", { name: "Todos" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Pintura" }));
    expect(p.onCategory).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect(p.onCategory).toHaveBeenLastCalledWith(undefined);
  });

  it("sin resultados explica qué buscó; cargando y sin productos son estados distintos", () => {
    const { unmount } = render(<div />);
    unmount();
    panel({ products: [], search: "tornillo" });
    expect(screen.getByText(/Sin productos para “tornillo”/)).toBeTruthy();
  });

  it("cargando muestra un estado de carga", () => {
    panel({ isLoading: true, products: [] });
    expect(screen.getByText("Cargando catálogo…")).toBeTruthy();
  });

  it("sin servidor y con copia local: avisa la fecha de la copia y que los precios requieren confirmación", () => {
    panel({ serverDown: true, catalog: { generatedAt: new Date("2026-10-12T10:00:00Z"), stale: false } });
    expect(screen.getByText(/mostrando el catálogo guardado/)).toBeTruthy();
    expect(screen.getByText(/Precios sujetos a confirmación/)).toBeTruthy();
  });

  it("una copia local de más de 24 horas advierte que los precios pudieron cambiar", () => {
    panel({ serverDown: true, catalog: { generatedAt: new Date("2026-10-01T10:00:00Z"), stale: true } });
    expect(screen.getByText(/más de 24 horas/)).toBeTruthy();
  });

  it("sin servidor y sin copia local lo dice", () => {
    panel({ serverDown: true, catalog: null });
    expect(screen.getByText(/sin catálogo guardado en este equipo/)).toBeTruthy();
  });
});

describe("OfflineBanner", () => {
  const queued = (userId: number, uuid: string) => ({ userId, sale: { client_uuid: uuid } as never, total: "100.00" });

  beforeEach(() => {
    useAuthStore.setState({ user: { id: 1, username: "u", full_name: "U", role: "cajero", permissions: [] } as never });
    useConnectionStore.setState({ serverReachable: true, syncing: false });
    usePosStore.setState({ offlineSalesQueue: [] });
  });

  it("con servidor y sin pendientes no muestra nada", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.textContent).toBe("");
  });

  it("sin servidor: aviso de alerta que invita a seguir vendiendo y cuenta las pendientes del usuario", () => {
    useConnectionStore.setState({ serverReachable: false });
    usePosStore.setState({ offlineSalesQueue: [queued(1, "a"), queued(1, "b"), queued(2, "c")] });
    render(<OfflineBanner />);
    expect(screen.getByRole("alert").textContent).toContain("Sin conexión al servidor.");
    expect(screen.getByText(/Puedes seguir vendiendo/)).toBeTruthy();
    expect(screen.getByText("2 ventas pendientes de enviar")).toBeTruthy(); // la del usuario 2 no cuenta
  });

  it("singular y cero pendientes", () => {
    useConnectionStore.setState({ serverReachable: false });
    usePosStore.setState({ offlineSalesQueue: [queued(1, "a")] });
    const { unmount } = render(<OfflineBanner />);
    expect(screen.getByText("1 venta pendiente de enviar")).toBeTruthy();
    unmount();
    usePosStore.setState({ offlineSalesQueue: [] });
    render(<OfflineBanner />);
    expect(screen.getByText("0 ventas pendientes")).toBeTruthy();
  });

  it("al volver la red y sincronizar muestra el progreso", () => {
    useConnectionStore.setState({ serverReachable: true, syncing: true });
    usePosStore.setState({ offlineSalesQueue: [queued(1, "a"), queued(1, "b")] });
    render(<OfflineBanner />);
    expect(screen.getByRole("status").textContent).toContain("Sincronizando 2 ventas guardadas en esta caja");
  });

  it("al terminar de sincronizar avisa cuántas se enviaron", () => {
    useConnectionStore.setState({ serverReachable: true, syncing: true });
    usePosStore.setState({ offlineSalesQueue: [queued(1, "a"), queued(1, "b")] });
    render(<OfflineBanner />);
    act(() => {
      usePosStore.setState({ offlineSalesQueue: [] });
      useConnectionStore.setState({ syncing: false });
    });
    expect(screen.getByRole("status").textContent).toContain("2 ventas sincronizadas con el servidor.");
  });
});

describe("SessionSelector", () => {
  const sesion = (id: number, userId: number, name: string, username: string) => ({
    id, cash_register_id: id, cash_register_name: name, user_id: userId, username, opening_amount: "1500.00", status: "abierta", opened_at: "2026-10-12T14:02:00Z",
  });

  function renderSelector() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SessionSelector />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    usePosStore.setState({ sessionId: null, sessionName: null, cart: [] });
    useAuthStore.setState({ user: { id: 1, username: "jperez", full_name: "Jorge Pérez", role: "cajero", permissions: [] } as never });
    listSessions.mockResolvedValue({ items: [sesion(1, 1, "Caja 1", "jperez"), sesion(2, 9, "Caja 2", "otro")] });
    listCashRegisters.mockResolvedValue([{ id: 1, name: "Caja 1" }, { id: 2, name: "Caja 2" }]);
    openCashRegister.mockResolvedValue({ id: 5, cash_register_name: "Caja 2" });
  });

  it("título del diseño y un solo h1", async () => {
    renderSelector();
    expect(screen.getByRole("heading", { level: 1, name: "Abre una caja para vender" })).toBeTruthy();
    expect(screen.getByText("Punto de venta")).toBeTruthy();
  });

  it("el cajero solo ve su propia sesión abierta (no la de otro cajero)", async () => {
    renderSelector();
    expect(await screen.findByText("Caja 1", { selector: "div" })).toBeTruthy();
    expect(screen.queryByText(/otro ·/)).toBeNull();
    expect(screen.getByText(/jperez · Apertura \$1,500\.00/)).toBeTruthy();
  });

  it("un supervisor (admin) ve todas las sesiones abiertas", async () => {
    useAuthStore.setState({ user: { id: 3, username: "admin", full_name: "Admin", role: "admin", permissions: [] } as never });
    renderSelector();
    expect(await screen.findByText(/otro · Apertura/)).toBeTruthy();
    expect(screen.getByText(/jperez · Apertura/)).toBeTruthy();
  });

  it("unirse a una sesión guarda su id y nombre en el POS", async () => {
    renderSelector();
    fireEvent.click(await screen.findByRole("button", { name: /Caja 1/ }));
    expect(usePosStore.getState().sessionId).toBe(1);
    expect(usePosStore.getState().sessionName).toBe("Caja 1");
  });

  it("abrir caja envía la caja elegida y el fondo, y entra a la sesión nueva", async () => {
    renderSelector();
    await screen.findByRole("option", { name: "Caja 2" });
    fireEvent.change(screen.getByLabelText("Caja registradora"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Fondo de apertura"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    await waitFor(() => expect(openCashRegister).toHaveBeenCalledWith(2, "800"));
    await waitFor(() => expect(usePosStore.getState().sessionId).toBe(5));
  });

  it("si el servidor rechaza la apertura, muestra su mensaje", async () => {
    openCashRegister.mockRejectedValue(new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined, { status: 400, data: { error: "Esta caja ya tiene una sesión abierta" } } as never));
    renderSelector();
    await screen.findByRole("option", { name: "Caja 1" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Esta caja ya tiene una sesión abierta");
    expect(usePosStore.getState().sessionId).toBeNull();
  });

  it("sin cajas registradas no se puede abrir", async () => {
    listCashRegisters.mockResolvedValue([]);
    renderSelector();
    await screen.findByRole("option", { name: "No hay cajas disponibles" });
    expect((screen.getByRole("button", { name: "Abrir caja" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
