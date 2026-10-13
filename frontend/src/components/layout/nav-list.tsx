import { NavLink } from "react-router-dom";

import type { SidebarBadges } from "../../hooks/use-sidebar-badges";
import { cn } from "../../lib/cn";
import type { NavItem, NavSection } from "./nav-config";

type Tone = NonNullable<NavItem["badgeTone"]>;

const BADGE_TONES: Record<Tone, string> = {
  warning: "bg-warn-tint text-warn",
  danger: "bg-bad-tint text-bad",
  info: "bg-acc-tint text-acc-text",
};
const DOT_TONES: Record<Tone, string> = { warning: "bg-warn", danger: "bg-bad", info: "bg-accent" };

/** Contador del ítem: etiqueta cuadrada con el tono del aviso; en el menú colapsado, un punto. */
function NavBadge({ collapsed, count, tone }: { collapsed: boolean; count: number; tone: Tone }) {
  if (count <= 0) return null;
  if (collapsed) {
    return <span aria-hidden="true" className={cn("absolute right-2 top-2 h-[7px] w-[7px] rounded-full", DOT_TONES[tone])} />;
  }
  return (
    <span className={cn("ml-auto inline-grid h-5 min-w-[22px] place-items-center px-1.5 text-xs font-medium", BADGE_TONES[tone])}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

type NavListProps = {
  badges: SidebarBadges;
  /** Menú de 64 px solo con iconos. */
  collapsed?: boolean;
  onNavigate?: () => void;
  sections: NavSection[];
};

/** Lista de navegación del menú lateral (escritorio colapsado/expandido y drawer móvil). */
export function NavList({ badges, collapsed = false, onNavigate, sections }: NavListProps) {
  return (
    <nav aria-label="Navegación principal" className={cn("flex-1 overflow-y-auto", collapsed ? "flex flex-col items-center gap-1 py-3.5" : "flex flex-col gap-[18px] px-2.5 py-[18px]")}>
      {sections.map((section, index) => (
        <div className={cn("flex flex-col gap-0.5", collapsed && "items-center")} key={section.label}>
          {collapsed ? (
            index > 0 ? <div aria-hidden="true" className="my-2 h-px w-8 bg-divider" /> : null
          ) : (
            <div className="px-2.5 pb-1.5 font-heading text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-2">{section.label}</div>
          )}
          {section.items.map((item) => {
            const Icon = item.icon;
            const count = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <NavLink
                aria-label={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    "relative flex shrink-0 items-center text-sm transition-colors duration-150",
                    collapsed ? "min-h-11 w-11 justify-center lg:min-h-10" : "min-h-11 w-full gap-2.5 px-2.5 lg:min-h-[38px]",
                    isActive
                      ? "bg-acc-tint font-semibold text-acc-text shadow-[inset_2px_0_0_var(--color-accent)]"
                      : "text-text hover:bg-line-soft",
                  )
                }
                end={item.href === "/"}
                key={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                to={item.href}
              >
                {({ isActive }) => (
                  <>
                    <Icon aria-hidden="true" className={cn("shrink-0", isActive ? "text-accent" : "text-ink-2")} size={collapsed ? 18 : 17} />
                    {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {item.badgeKey && item.badgeTone ? <NavBadge collapsed={collapsed} count={count} tone={item.badgeTone} /> : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
