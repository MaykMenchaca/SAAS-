/**
 * Fábrica única de query keys de React Query (H-29).
 * Cada clave empieza con un prefijo estable: invalidar `qk.stock()` invalida también
 * `qk.stock(page, search)`, porque React Query compara por prefijo.
 */
type KeyPart = string | number | boolean | null | undefined;

const key =
  <P extends string>(prefix: P) =>
  (...parts: KeyPart[]) =>
    [prefix, ...parts] as const;

export const qk = {
  activePosSession: key("active-pos-session"),
  auditLogs: key("audit-logs"),
  backups: key("backups"),
  branding: key("branding"),
  cashRegisters: key("cash-registers"),
  cashSessions: key("cash-sessions"),
  categories: key("categories"),
  commandPaletteProducts: key("command-palette-products"),
  dashboard: key("dashboard"),
  dashboardSales: key("dashboard-sales"),
  dashboardWeeklySales: key("dashboard-weekly-sales"),
  inventoryCount: key("inventory-count"),
  inventoryCounts: key("inventory-counts"),
  labelPreview: key("label-preview"),
  lowStock: key("low-stock"),
  movements: key("movements"),
  orderProducts: key("order-products"),
  posCatalog: key("pos-catalog"),
  posCategories: key("pos-categories"),
  posProducts: key("pos-products"),
  products: key("products"),
  purchaseOrderDetail: key("purchase-order-detail"),
  purchaseOrders: key("purchase-orders"),
  reportGrossMargin: key("report-gross-margin"),
  reportInventoryValuation: key("report-inventory-valuation"),
  reportSales: key("report-sales"),
  reportTopProducts: key("report-top-products"),
  roles: key("roles"),
  saleDetail: key("sale-detail"),
  salesHistory: key("sales-history"),
  saleTicket: key("sale-ticket"),
  sessionSummary: key("session-summary"),
  sidebarPendingPurchases: key("sidebar-pending-purchases"),
  stock: key("stock"),
  suppliers: key("suppliers"),
  systemConfig: key("system-config"),
  units: key("units"),
  users: key("users"),
};
