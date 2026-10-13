import { useState } from "react";
import { Database, Printer, ScrollText, Settings } from "lucide-react";

import { PageHeader } from "../components/ui";
import { AuditTab } from "./settings/audit-tab";
import { BackupsTab } from "./settings/backups-tab";
import { CashRegistersTab } from "./settings/cash-registers-tab";
import { GeneralTab } from "./settings/general-tab";

type Tab = "general" | "cajas" | "auditoria" | "backups";

const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "cajas", label: "Cajas", icon: Printer },
  { id: "auditoria", label: "Auditoría", icon: ScrollText },
  { id: "backups", label: "Respaldos", icon: Database },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="grid gap-5">
      <PageHeader
        subtitle="Datos del negocio, impresoras, auditoría y respaldos"
        title="Configuración"
      />

      <nav aria-label="Secciones de configuración" className="-mt-2 flex gap-7 overflow-x-auto border-b border-divider" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              aria-selected={active}
              className={[
                "-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 font-heading text-lg font-semibold transition-colors",
                active ? "border-accent text-text" : "border-transparent text-ink-2 hover:text-text",
              ].join(" ")}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "general" ? <GeneralTab /> : null}
      {activeTab === "cajas" ? <CashRegistersTab /> : null}
      {activeTab === "auditoria" ? <AuditTab /> : null}
      {activeTab === "backups" ? <BackupsTab /> : null}
    </div>
  );
}
