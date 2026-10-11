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
});
