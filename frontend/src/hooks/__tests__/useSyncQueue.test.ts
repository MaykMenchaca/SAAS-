import { describe, expect, it, vi, beforeEach } from "vitest";
import { syncOfflineQueue } from "../useSyncQueue";
import { usePosStore } from "../../stores/pos-store";
import { useAuthStore } from "../../stores/auth-store";
import * as salesApi from "../../api/sales";

vi.mock("../../api/sales", () => ({
  createSale: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../api/invalidate", () => ({
  invalidateAfterSale: vi.fn().mockResolvedValue(undefined),
}));

describe("useSyncQueue / syncOfflineQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePosStore.setState({
      offlineSalesQueue: [],
      rejectedSales: [],
    });
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        full_name: "Admin User",
        permissions: [],
      },
    });
  });

  it("does nothing if queue is empty", async () => {
    await syncOfflineQueue();
    expect(salesApi.createSale).not.toHaveBeenCalled();
  });

  it("synchronizes pending sales and removes them from queue on success", async () => {
    const mockSale: salesApi.CreateSalePayload = {
      client_uuid: "uuid-1234",
      session_id: 1,
      items: [
        {
          product_id: 1,
          quantity: "1.000",
          unit_price: "100.00",
          tax_rate: "16.00",
        },
      ],
      payments: [{ method: "efectivo", amount: "100.00" }],
      open_drawer: false,
    };

    usePosStore.setState({
      offlineSalesQueue: [
        {
          userId: 1,
          queuedAt: new Date().toISOString(),
          sale: mockSale,
        },
      ],
    });

    vi.mocked(salesApi.createSale).mockResolvedValueOnce({
      id: 10,
      folio: "V-20261011-0001",
      ...mockSale,
    } as any);

    await syncOfflineQueue();

    expect(salesApi.createSale).toHaveBeenCalledWith({
      ...mockSale,
      open_drawer: false,
    });
    expect(usePosStore.getState().offlineSalesQueue.length).toBe(0);
  });

  it("moves rejected sales to rejectedSales on 400 rejection", async () => {
    const mockSale: salesApi.CreateSalePayload = {
      client_uuid: "uuid-fail",
      session_id: 1,
      items: [
        {
          product_id: 1,
          quantity: "999.000",
          unit_price: "100.00",
          tax_rate: "16.00",
        },
      ],
      payments: [{ method: "efectivo", amount: "100.00" }],
      open_drawer: false,
    };

    usePosStore.setState({
      offlineSalesQueue: [
        {
          userId: 1,
          queuedAt: new Date().toISOString(),
          sale: mockSale,
        },
      ],
    });

    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: "Stock insuficiente" },
      },
    };
    vi.mocked(salesApi.createSale).mockRejectedValueOnce(axiosError);

    await syncOfflineQueue();

    expect(usePosStore.getState().offlineSalesQueue.length).toBe(0);
    const rejected = usePosStore.getState().rejectedSales;
    expect(rejected.length).toBe(1);
    expect(rejected[0].error).toBe("Stock insuficiente");
  });

  // FE-105: un problema de sesión no es culpa de la venta; se conserva en la cola para reintentar
  it.each([
    ["contraseña temporal", 403, { error: "Debes cambiar tu contraseña", code: "password_change_required" }],
    ["usuario desactivado", 403, { error: "Usuario inactivo", code: "user_inactive" }],
    ["token inválido", 422, { msg: "Signature verification failed" }],
    ["sesión expirada", 401, { msg: "Token has expired" }],
  ])("no rechaza la venta por %s", async (_name, status, data) => {
    const mockSale = {
      client_uuid: "uuid-auth", session_id: 1,
      items: [{ product_id: 1, quantity: "1.000", unit_price: "100.00", tax_rate: "16.00" }],
      payments: [{ method: "efectivo", amount: "116.00" }], open_drawer: false,
    } as salesApi.CreateSalePayload;
    usePosStore.setState({ offlineSalesQueue: [{ userId: 1, queuedAt: new Date().toISOString(), sale: mockSale }] });
    vi.mocked(salesApi.createSale).mockRejectedValueOnce({ isAxiosError: true, response: { status, data } });

    await syncOfflineQueue();

    expect(usePosStore.getState().offlineSalesQueue.length).toBe(1);
    expect(usePosStore.getState().rejectedSales.length).toBe(0);
  });

  it("sí rechaza un 422 de validación de la venta", async () => {
    const mockSale = {
      client_uuid: "uuid-422", session_id: 1,
      items: [{ product_id: 1, quantity: "1.000", unit_price: "100.00", tax_rate: "16.00" }],
      payments: [{ method: "efectivo", amount: "116.00" }], open_drawer: false,
    } as salesApi.CreateSalePayload;
    usePosStore.setState({ offlineSalesQueue: [{ userId: 1, queuedAt: new Date().toISOString(), sale: mockSale }] });
    vi.mocked(salesApi.createSale).mockRejectedValueOnce({
      isAxiosError: true, response: { status: 422, data: { error: "Datos inválidos", details: {} } },
    });

    await syncOfflineQueue();

    expect(usePosStore.getState().rejectedSales.length).toBe(1);
  });
});
