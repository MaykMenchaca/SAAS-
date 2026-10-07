import { useQuery } from "@tanstack/react-query";

import { fetchDashboardSummary } from "../api/reports";
import { listOrders } from "../api/purchases";

export type SidebarBadges = {
  lowStock: number;
  pendingPurchases: number;
};

/** Lee contadores reactivos para los badges del sidebar.
   Reutiliza el cache de la query ["dashboard"] cuando el usuario está en el dashboard. */
export function useSidebarBadges(): SidebarBadges {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const purchases = useQuery({
    queryKey: ["sidebar-pending-purchases"],
    queryFn: () => listOrders({ status: "borrador", perPage: 1 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    lowStock: dashboard.data?.low_stock_count ?? 0,
    pendingPurchases: purchases.data?.total ?? 0,
  };
}
