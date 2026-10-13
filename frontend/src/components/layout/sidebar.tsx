import { LogOut, Settings } from "lucide-react";

import type { SidebarBadges } from "../../hooks/use-sidebar-badges";
import { useAuthStore } from "../../stores/auth-store";
import { cn } from "../../lib/cn";
import { Button } from "../ui";
import { BrandMark } from "./brand-mark";
import type { NavSection } from "./nav-config";
import { NavList } from "./nav-list";
import { ShiftCard, ShiftDot } from "./shift-card";
import { UserCard } from "./user-card";
import { useBrand } from "./use-brand";

type SidebarProps = {
  badges: SidebarBadges;
  collapsed: boolean;
  /** Solo el administrador puede personalizar la marca (clic en el logo). */
  onCustomizeBrand?: () => void;
  sections: NavSection[];
};

/** Menú lateral de escritorio: 236 px expandido (marca, navegación, turno y usuario) o 64 px con iconos. */
export function Sidebar({ badges, collapsed, onCustomizeBrand, sections }: SidebarProps) {
  const brand = useBrand();
  const logout = useAuthStore((s) => s.logout);

  const mark = <BrandMark colorKey={brand.colorKey} iconKey={brand.iconKey} />;
  const header = collapsed ? mark : (
    <>
      {mark}
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate font-heading text-lg font-semibold leading-[1.1]">{brand.name}</div>
        <div className="truncate text-xs uppercase tracking-[0.1em] text-ink-2">{brand.subtitle}</div>
      </div>
      {onCustomizeBrand ? <Settings aria-hidden="true" className="shrink-0 text-ink-3" size={14} /> : null}
    </>
  );
  const headerClass = cn("flex h-16 w-full shrink-0 items-center border-b border-divider", collapsed ? "justify-center" : "gap-3 px-[18px]");

  return (
    <aside className="hidden min-h-0 flex-col border-r border-divider bg-bg lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-hidden">
      {onCustomizeBrand ? (
        <button
          aria-label="Personalizar la marca del local"
          className={cn(headerClass, "transition-colors hover:bg-line-soft")}
          onClick={onCustomizeBrand}
          title="Personalizar la marca del local"
          type="button"
        >
          {header}
        </button>
      ) : (
        <div className={headerClass}>{header}</div>
      )}

      <NavList badges={badges} collapsed={collapsed} sections={sections} />

      {collapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-2.5 border-t border-divider py-3">
          <ShiftDot />
          <Button aria-label="Cerrar sesión" className="h-9 min-h-0 w-9 px-0 text-ink-2" onClick={() => void logout()} title="Cerrar sesión" variant="ghost">
            <LogOut aria-hidden="true" size={16} />
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col gap-3 border-t border-divider p-3.5">
          <ShiftCard />
          <UserCard />
        </div>
      )}
    </aside>
  );
}
