import { ChevronLeft, Menu, Moon, Search, ShoppingCart, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { SidebarBadges } from "../../hooks/use-sidebar-badges";
import { useServerStatus } from "../../hooks/useServerStatus";
import { cn } from "../../lib/cn";
import { useThemeStore } from "../../stores/theme-store";
import { useCan } from "../auth/require-permission";
import { Button, Kbd } from "../ui";
import { useCommandPalette } from "./command-palette-context";
import { NotificationsBell } from "./notifications-bell";
import { PendingSalesIndicator } from "./pending-sales";

/** Reloj del encabezado: "12 oct 2026 · 20:22" (solo la hora en pantallas angostas). Se actualiza cada 15 s. */
function TopbarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const date = now.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");
  const time = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <span className="hidden whitespace-nowrap text-[0.8125rem] tabular-nums text-ink-2 sm:inline">
      <span className="hidden min-[1200px]:inline">{date} · </span>
      {time}
    </span>
  );
}

/** Estado de la conexión con el servidor (ping real a /api/health, no solo navigator.onLine). */
function LanStatus() {
  const online = useServerStatus();
  const label = online ? "Conexión LAN activa" : "Sin conexión al servidor";
  return (
    <span
      className={cn(
        "h-7 items-center gap-1.5 whitespace-nowrap border px-2 text-[0.8125rem]",
        // Conectado: solo se muestra desde `sm`. Sin conexión: siempre visible (una caja debe saberlo en cualquier pantalla).
        online ? "hidden border-transparent text-ink-2 sm:flex" : "flex border-bad bg-bad-tint text-bad",
      )}
      role="status"
      title={label}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", online ? "bg-ok" : "animate-pulse bg-bad")} />
      <span className="sr-only">{label}. </span>
      <span aria-hidden="true">{online ? "LAN" : "Sin conexión"}</span>
    </span>
  );
}

type TopbarProps = {
  badges: SidebarBadges;
  isCollapsed: boolean;
  isPosRoute: boolean;
  onOpenMobileMenu: () => void;
  onToggleCollapsed: () => void;
  pageTitle: string;
  sectionLabel?: string;
};

const iconButton = "w-11 px-0 lg:w-9";

/** Encabezado de 64 px: menú, breadcrumb "Sección / Página", buscador Ctrl K, nueva venta, reloj, LAN, alertas y tema. */
export function Topbar({ badges, isCollapsed, isPosRoute, onOpenMobileMenu, onToggleCollapsed, pageTitle, sectionLabel }: TopbarProps) {
  const navigate = useNavigate();
  const can = useCan();
  const palette = useCommandPalette();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const cmdKey = isMac ? "⌘ K" : "Ctrl K";

  return (
    <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-divider bg-bg px-3 sm:gap-3.5 sm:px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {/* Menú de navegación (tablet y móvil) */}
        <Button aria-label="Abrir menú de navegación" className={cn(iconButton, "lg:hidden")} onClick={onOpenMobileMenu} size="sm" variant="secondary">
          <Menu aria-hidden="true" size={18} />
        </Button>

        {/* Colapsar el menú (escritorio). En el POS siempre está colapsado, como en el diseño. */}
        {isPosRoute ? null : (
          <Button
            aria-label={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            className={cn(iconButton, "hidden lg:inline-flex")}
            onClick={onToggleCollapsed}
            size="sm"
            title={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            variant="secondary"
          >
            {isCollapsed ? <Menu aria-hidden="true" size={16} /> : <ChevronLeft aria-hidden="true" size={16} />}
          </Button>
        )}

        <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-2 text-sm">
          {sectionLabel ? (
            <>
              <span className="hidden whitespace-nowrap text-ink-2 min-[1200px]:inline">{sectionLabel}</span>
              <span aria-hidden="true" className="hidden text-ink-3 min-[1200px]:inline">/</span>
            </>
          ) : null}
          <span aria-current="page" className="truncate font-medium">{pageTitle}</span>
        </nav>
      </div>

      {/* Buscador / paleta de comandos */}
      <button
        aria-label="Abrir paleta de comandos"
        className="hidden min-h-9 min-w-40 max-w-[300px] flex-[0_1_300px] items-center gap-2 border border-field-border bg-surface px-2.5 text-left text-sm text-ink-2 transition-colors hover:border-text min-[1200px]:flex"
        onClick={() => palette.setOpen(true)}
        type="button"
      >
        <Search aria-hidden="true" className="shrink-0" size={16} />
        <span className="min-w-0 flex-1 truncate">Buscar páginas, productos…</span>
        <Kbd aria-hidden="true">{cmdKey}</Kbd>
      </button>
      <Button aria-label="Buscar" className={cn(iconButton, "min-[1200px]:hidden")} onClick={() => palette.setOpen(true)} size="sm" variant="secondary">
        <Search aria-hidden="true" size={17} />
      </Button>

      {!isPosRoute && can("ventas:crear") ? (
        <Button aria-label="Nueva venta" className="hidden shrink-0 whitespace-nowrap md:inline-flex" icon={<ShoppingCart aria-hidden="true" size={16} />} onClick={() => navigate("/pos")} size="sm">
          Nueva venta
        </Button>
      ) : null}

      <PendingSalesIndicator />

      <div className="flex shrink-0 items-center gap-3.5 sm:border-l sm:border-divider sm:pl-4">
        <TopbarClock />
        <LanStatus />
      </div>

      <NotificationsBell badges={badges} />

      <Button
        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        className={iconButton}
        onClick={toggleTheme}
        size="sm"
        title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        variant="secondary"
      >
        {theme === "dark" ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
      </Button>
    </header>
  );
}
