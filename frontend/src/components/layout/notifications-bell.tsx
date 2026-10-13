import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, CloudOff, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import { getLowStock } from "../../api/inventory";
import { qk } from "../../api/query-keys";
import type { SidebarBadges } from "../../hooks/use-sidebar-badges";
import { useAuthStore } from "../../stores/auth-store";
import { usePosStore } from "../../stores/pos-store";
import { useCan } from "../auth/require-permission";

/** Campana con stock bajo, órdenes de compra pendientes y ventas sin sincronizar (H-44). */
export function NotificationsBell({ badges }: { badges: SidebarBadges }) {
  const can = useCan();
  const userId = useAuthStore((s) => s.user?.id);
  const pendingSales = usePosStore((s) => s.offlineSalesQueue.filter((q) => !q.userId || q.userId === userId).length);
  const rejectedSales = usePosStore((s) => s.rejectedSales.filter((q) => !q.userId || q.userId === userId).length);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const canInventory = can("inventario:ver");
  const lowStockQuery = useQuery({
    queryKey: qk.lowStock("top5"),
    queryFn: () => getLowStock({ perPage: 5 }),
    enabled: open && canInventory,
    staleTime: 30_000,
  });

  const total = badges.lowStock + badges.pendingPurchases + pendingSales + rejectedSales;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const lowStockItems = (lowStockQuery.data?.items ?? []).slice(0, 5);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={total > 0 ? `${total} alertas pendientes` : "Sin alertas"}
        className="relative flex min-h-11 w-11 items-center justify-center border border-divider text-ink-2 transition-colors duration-150 hover:bg-line-soft hover:text-text lg:min-h-9 lg:w-9"
        onClick={() => setOpen((v) => !v)}
        ref={buttonRef}
        type="button"
      >
        <Bell size={16} />
        {total > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 inline-grid h-[18px] min-w-[18px] place-items-center bg-bad px-1 text-xs font-medium leading-none text-on-bad"
          >
            {total > 9 ? "9+" : total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          aria-label="Notificaciones"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] border border-divider bg-bg p-3 shadow-lg"
          id={panelId}
          role="dialog"
        >
          <h2 className="mb-2 text-lg">Notificaciones</h2>
          {total === 0 ? (
            <p className="py-4 text-center text-sm text-ink-2">Todo en orden. No hay alertas.</p>
          ) : (
            <ul className="grid gap-2">
              {badges.lowStock > 0 ? (
                <li className="border border-warn bg-warn-tint p-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text">
                    <AlertTriangle aria-hidden="true" className="text-warn" size={15} />
                    {badges.lowStock === 1 ? "1 producto con stock bajo" : `${badges.lowStock} productos con stock bajo`}
                  </div>
                  {lowStockItems.length > 0 ? (
                    <ul className="mt-1 grid gap-0.5 pl-6 text-xs text-ink-2">
                      {lowStockItems.map((item) => (
                        <li key={item.product_id}>
                          {item.product_name} · {Number(item.quantity)} / mín. {Number(item.min_stock)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canInventory ? (
                    <Link className="mt-1 inline-flex min-h-8 items-center pl-6 text-xs font-semibold text-acc-text" onClick={() => setOpen(false)} to="/inventario">
                      Ver inventario
                    </Link>
                  ) : null}
                </li>
              ) : null}
              {badges.pendingPurchases > 0 ? (
                <li className="border border-divider p-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text">
                    <Truck aria-hidden="true" className="text-accent" size={15} />
                    {badges.pendingPurchases === 1
                      ? "1 orden de compra pendiente"
                      : `${badges.pendingPurchases} órdenes de compra pendientes`}
                  </div>
                  <Link className="mt-1 inline-flex min-h-8 items-center pl-6 text-xs font-semibold text-acc-text" onClick={() => setOpen(false)} to="/compras">
                    Ver compras
                  </Link>
                </li>
              ) : null}
              {pendingSales + rejectedSales > 0 ? (
                <li className="border border-bad bg-bad-tint p-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-text">
                    <CloudOff aria-hidden="true" className="text-bad" size={15} />
                    Ventas sin sincronizar
                  </div>
                  <p className="pl-6 text-xs text-ink-2">
                    {pendingSales} pendientes · {rejectedSales} rechazadas. Revísalas en el indicador del encabezado.
                  </p>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
