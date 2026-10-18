import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { SidebarBadges } from "../../hooks/use-sidebar-badges";
import { Button } from "../ui";
import { BrandMark } from "./brand-mark";
import type { NavSection } from "./nav-config";
import { NavList } from "./nav-list";
import { ShiftCard } from "./shift-card";
import { UserCard } from "./user-card";
import { useBrand } from "./use-brand";

type MobileDrawerProps = {
  badges: SidebarBadges;
  onClose: () => void;
  open: boolean;
  sections: NavSection[];
};

/** Menú de navegación off-canvas para tablet y móvil (por debajo de `lg`). Esc, clic fuera y navegar lo cierran. */
export function MobileDrawer({ badges, onClose, open, sections }: MobileDrawerProps) {
  const brand = useBrand();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div aria-label="Menú de navegación principal" aria-modal="true" className="fixed inset-0 z-50 flex lg:hidden" role="dialog">
      <div aria-hidden="true" className="fixed inset-0 bg-overlay fade-in" onClick={onClose} />
      <div className="relative z-10 flex h-full w-[280px] max-w-[85vw] flex-col border-r border-divider bg-bg shadow-lg">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-divider px-[18px]">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark colorKey={brand.colorKey} iconKey={brand.iconKey} />
            <div className="min-w-0">
              <div className="truncate font-heading text-lg font-semibold leading-[1.1]">{brand.name}</div>
              <div className="truncate text-xs uppercase tracking-[0.1em] text-ink-2">{brand.subtitle}</div>
            </div>
          </div>
          <Button aria-label="Cerrar menú" className="h-11 w-11 px-0" onClick={onClose} ref={closeRef} variant="ghost">
            <X aria-hidden="true" size={20} />
          </Button>
        </div>
        <NavList badges={badges} onNavigate={onClose} sections={sections} />
        <div className="flex shrink-0 flex-col gap-3 border-t border-divider p-3.5">
          <ShiftCard />
          <UserCard onLogout={onClose} />
        </div>
      </div>
    </div>
  );
}
