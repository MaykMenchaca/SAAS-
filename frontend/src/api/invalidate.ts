import type { QueryClient } from "@tanstack/react-query";

import { qk } from "./query-keys";

async function invalidateAll(queryClient: QueryClient, keys: ReadonlyArray<readonly unknown[]>) {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Todo lo que depende de existencias o del costo (H-29). */
export function invalidateInventory(queryClient: QueryClient) {
  return invalidateAll(queryClient, [
    qk.stock(),
    qk.lowStock(),
    qk.movements(),
    qk.products(),
    qk.posProducts(),
    qk.commandPaletteProducts(),
    qk.orderProducts(),
    qk.inventoryCounts(),
    qk.inventoryCount(),
    qk.reportInventoryValuation(),
    qk.dashboard(),
  ]);
}

/** Después de vender, cancelar o devolver: ventas, caja, reportes e inventario (H-29). */
export function invalidateAfterSale(queryClient: QueryClient) {
  return Promise.all([
    invalidateInventory(queryClient),
    invalidateAll(queryClient, [
      qk.salesHistory(),
      qk.saleDetail(),
      qk.saleTicket(),
      qk.dashboardSales(),
      qk.dashboardWeeklySales(),
      qk.sessionSummary(),
      qk.cashSessions(),
      qk.activePosSession(),
      qk.reportSales(),
      qk.reportTopProducts(),
      qk.reportGrossMargin(),
    ]),
  ]);
}

/** Después de recibir o cambiar una orden de compra. */
export function invalidateAfterPurchase(queryClient: QueryClient) {
  return Promise.all([
    invalidateInventory(queryClient),
    invalidateAll(queryClient, [qk.purchaseOrders(), qk.purchaseOrderDetail(), qk.sidebarPendingPurchases()]),
  ]);
}
