import { useState } from "react";
import { Plus } from "lucide-react";

import { Button, PageHeader } from "../components/ui";
import { CountList } from "./inventory/count-list";
import { CountSession } from "./inventory/count-session";
import { InventoryTabs } from "./inventory/inventory-tabs";

/** Conteo físico: lista de conteos (con el folio CF-) y, al abrir uno, su captura inline. */
export function InventoryCountPage() {
  const [activeCountId, setActiveCountId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Inventario"
        subtitle="Conteo físico con ajuste por diferencia"
        actions={
          activeCountId === null ? (
            <Button frame icon={<Plus aria-hidden="true" size={18} />} onClick={() => setCreating(true)}>
              Nuevo conteo
            </Button>
          ) : undefined
        }
      />

      <InventoryTabs active="conteo" />

      {activeCountId !== null ? (
        <CountSession countId={activeCountId} onBack={() => setActiveCountId(null)} />
      ) : (
        <CountList creating={creating} onCloseCreate={() => setCreating(false)} onOpenCount={setActiveCountId} onStartCreate={() => setCreating(true)} />
      )}
    </div>
  );
}
