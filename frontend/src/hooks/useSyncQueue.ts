import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createSale } from "../api/sales";
import { useAuthStore } from "../stores/auth-store";
import { usePosStore } from "../stores/pos-store";

/**
 * Hook to automatically synchronize offline sales queued in pos-storage
 * when browser online status returns to online.
 * Sales are isolated by user_id (H-18).
 */
export function useSyncQueue() {
  const offlineSalesQueue = usePosStore((s) => s.offlineSalesQueue);
  const removeOfflineSaleByUuid = usePosStore((s) => s.removeOfflineSaleByUuid);
  const removeOfflineSale = usePosStore((s) => s.removeOfflineSale);
  const user = useAuthStore((s) => s.user);
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!online || offlineSalesQueue.length === 0 || !user?.id) return;

    // Filter sales that belong to the active user (or legacy sales without userId)
    const currentUserId = user.id;
    const userSales = offlineSalesQueue.filter((item) => {
      const itemUserId = item.userId ?? (item as any).sale?.user_id ?? 0;
      return !itemUserId || itemUserId === currentUserId;
    });

    if (userSales.length === 0) return;

    let isSyncing = false;

    async function syncQueue() {
      if (isSyncing) return;
      isSyncing = true;

      const salesToSync = [...userSales];
      let syncedCount = 0;
      let failedCount = 0;

      toast.info(`Sincronizando ${salesToSync.length} venta(s) guardadas localmente...`);

      for (let i = 0; i < salesToSync.length; i++) {
        const queueItem = salesToSync[i];
        const payload = queueItem.sale ?? queueItem;
        try {
          await createSale(payload);
          if (payload.client_uuid) {
            removeOfflineSaleByUuid(payload.client_uuid);
          } else {
            removeOfflineSale(0);
          }
          syncedCount++;
        } catch (err) {
          console.error("Fallo al sincronizar venta encolada:", err);
          failedCount++;
          // Stop sync to preserve transaction ordering if connection drops again
          break;
        }
      }

      if (syncedCount > 0) {
        toast.success(`Se sincronizaron ${syncedCount} venta(s) pendientes.`);
      }
      if (failedCount > 0) {
        toast.error("No se pudieron sincronizar algunas ventas. Se reintentará al recuperar estabilidad.");
      }

      isSyncing = false;
    }

    const timer = setTimeout(syncQueue, 3000);
    return () => clearTimeout(timer);
  }, [online, offlineSalesQueue, removeOfflineSale, removeOfflineSaleByUuid, user?.id]);
}
