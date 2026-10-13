import { Link } from "react-router-dom";

import { useCan } from "../../components/auth/require-permission";
import { cn } from "../../lib/cn";

/** Pestañas de Inventario: Existencias y Conteo físico (cada una es su propia ruta). */
export function InventoryTabs({ active }: { active: "existencias" | "conteo" }) {
  const can = useCan();
  const tabs = [
    { id: "existencias" as const, label: "Existencias", to: "/inventario", show: true },
    { id: "conteo" as const, label: "Conteo físico", to: "/inventario/conteo", show: can("inventario:ajustar") },
  ].filter((tab) => tab.show);

  return (
    <nav aria-label="Secciones de inventario" className="-mt-2 flex gap-7 overflow-x-auto border-b border-divider">
      {tabs.map((tab) => (
        <Link
          aria-current={active === tab.id ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 font-heading text-lg font-semibold transition-colors duration-150",
            active === tab.id ? "border-accent text-text" : "border-transparent text-ink-2 hover:text-text",
          )}
          key={tab.id}
          to={tab.to}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
