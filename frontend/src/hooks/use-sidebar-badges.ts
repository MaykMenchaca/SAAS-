import { useQuery } from "@tanstack/react-query";

import { fetchDashboardSummary } from "../api/reports";
import { listOrders } from "../api/purchases";
import { useCan } from "../components/auth/require-permission";

export type SidebarBadges = {
  lowStock: number;
  pendingPurchases: number;
};

/** Lee contadores reactivos para los badges del sidebar.
   Solo consulta si el usuario cuenta con los permisos correspondientes. */
export function useSidebarBadges(): SidebarBadges {
  const can = useCan();
  const canReports = can("reportes:ver");
  const canPurchases = can("compras:ver");

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
    enabled: canReports,
    refetchInterval: canReports ? 60_000 : false,
    staleTime: 30_000,
  });

  const purchases = useQuery({
    queryKey: ["sidebar-pending-purchases"],
    queryFn: () => listOrders({ status: "borrador", perPage: 1 }),
    enabled: canPurchases,
    refetchInterval: canPurchases ? 60_000 : false,
    staleTime: 30_000,
  });

  return {
    lowStock: dashboard.data?.low_stock_count ?? 0,
    pendingPurchases: purchases.data?.total ?? 0,
  };
}
