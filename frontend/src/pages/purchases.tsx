import { useState } from "react";
import { Building2, Package, Plus } from "lucide-react";

import { useCan } from "../components/auth/require-permission";
import { Button, PageHeader } from "../components/ui";
import { cn } from "../lib/cn";
import type { Tab } from "./purchases/helpers";
import { OrdersTab } from "./purchases/orders-tab";
import { SuppliersTab } from "./purchases/suppliers-tab";

const tabs: { icon: typeof Package; id: Tab; label: string }[] = [
  { icon: Package, id: "ordenes", label: "Órdenes" },
  { icon: Building2, id: "proveedores", label: "Proveedores" },
];

export function PurchasesPage() {
  const can = useCan();
  const [activeTab, setActiveTab] = useState<Tab>("ordenes");
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);

  const onOrders = activeTab === "ordenes";

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          can("compras:crear") ? (
            <Button
              frame
              icon={<Plus aria-hidden="true" size={16} />}
              onClick={() => (onOrders ? setShowCreateOrder(true) : setShowCreateSupplier(true))}
            >
              {onOrders ? "Nueva orden" : "Nuevo proveedor"}
            </Button>
          ) : undefined
        }
        className="mb-0"
        subtitle="Órdenes de compra, recepción de mercancía y proveedores"
        title="Compras"
      />

      <div aria-label="Secciones de compras" className="flex gap-7 overflow-x-auto border-b border-divider" role="tablist">
        {tabs.map(({ icon: Icon, id, label }) => (
          <button
            aria-selected={activeTab === id}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 font-heading text-lg font-semibold transition-colors duration-150",
              activeTab === id ? "border-accent text-text" : "border-transparent text-ink-2 hover:text-text",
            )}
            key={id}
            onClick={() => setActiveTab(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </button>
        ))}
      </div>

      {onOrders ? (
        <OrdersTab
          onCloseCreate={() => setShowCreateOrder(false)}
          onRequestCreate={() => setShowCreateOrder(true)}
          showCreate={showCreateOrder}
        />
      ) : (
        <SuppliersTab
          onCloseCreate={() => setShowCreateSupplier(false)}
          onRequestCreate={() => setShowCreateSupplier(true)}
          showCreate={showCreateSupplier}
        />
      )}
    </div>
  );
}
