import { useState } from "react";
import { Building2, Package } from "lucide-react";

import { PageHeader } from "../components/ui";
import type { Tab } from "./purchases/helpers";
import { OrdersTab } from "./purchases/orders-tab";
import { SuppliersTab } from "./purchases/suppliers-tab";

export function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("ordenes");

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Compras"
        subtitle="Órdenes de compra y proveedores"
      />

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto border border-divider bg-bg p-1">
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition-colors",
            activeTab === "ordenes"
              ? "bg-bg text-acc-text shadow-sm"
              : "text-ink-2 hover:text-text",
          ].join(" ")}
          onClick={() => setActiveTab("ordenes")}
          type="button"
        >
          <Package aria-hidden="true" size={16} />
          Órdenes
        </button>
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition-colors",
            activeTab === "proveedores"
              ? "bg-bg text-acc-text shadow-sm"
              : "text-ink-2 hover:text-text",
          ].join(" ")}
          onClick={() => setActiveTab("proveedores")}
          type="button"
        >
          <Building2 aria-hidden="true" size={16} />
          Proveedores
        </button>
      </nav>

      {activeTab === "ordenes" ? <OrdersTab /> : <SuppliersTab />}
    </div>
  );
}
