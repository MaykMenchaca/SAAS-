import {
  BarChart3,
  Boxes,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Hammer,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuthStore } from "../../stores/auth-store";
import { usePosStore } from "../../stores/pos-store";
import { useThemeStore } from "../../stores/theme-store";
import { getBranding, updateConfig } from "../../api/config";
import { useSidebarBadges } from "../../hooks/use-sidebar-badges";
import type { SidebarBadges } from "../../hooks/use-sidebar-badges";
import { useSyncQueue } from "../../hooks/useSyncQueue";
import { useServerStatus } from "../../hooks/useServerStatus";
import { NotificationsBell } from "./notifications-bell";
import { PendingSalesIndicator } from "./pending-sales";
import { useCan } from "../auth/require-permission";
import { cn } from "../../lib/cn";
import { Badge, Button, Input, Modal } from "../ui";
import { CommandPalette } from "./command-palette";
import { useCommandPalette } from "./command-palette-context";
import { qk } from "../../api/query-keys";

type BadgeKey = keyof SidebarBadges;

type NavItem = {
  href: string;
  icon: any;
  label: string;
  badgeKey?: BadgeKey;
  badgeTone?: "warning" | "danger" | "info";
  permission?: string;
  adminOnly?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Principal",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard", permission: "reportes:ver" },
      { href: "/pos", icon: ShoppingCart, label: "Punto de Venta", permission: "ventas:crear" },
    ],
  },
  {
    label: "Inventario",
    items: [
      { href: "/inventario", icon: Boxes, label: "Inventario", badgeKey: "lowStock", badgeTone: "warning", permission: "inventario:ver" },
      { href: "/productos", icon: Package, label: "Productos", permission: "productos:ver" },
      { href: "/compras", icon: Truck, label: "Compras", badgeKey: "pendingPurchases", badgeTone: "info", permission: "compras:ver" },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { href: "/ventas", icon: ReceiptText, label: "Historial de Ventas", permission: "ventas:ver" },
      { href: "/corte-caja", icon: Calculator, label: "Corte de Caja", permission: "caja:ver" },
      { href: "/devoluciones", icon: CornerDownLeft, label: "Devoluciones", permission: "ventas:cancelar" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/usuarios", icon: Users, label: "Usuarios", permission: "usuarios:ver" },
      { href: "/reportes", icon: BarChart3, label: "Reportes", permission: "reportes:ver" },
      { href: "/configuracion", icon: Settings, label: "Configuración", adminOnly: true },
    ],
  },
];

const LOGO_ICONS = {
  ShoppingCart: ShoppingCart,
  Wrench: Wrench,
  Hammer: Hammer,
  Boxes: Boxes,
  Package: Package,
  Store: Store,
};

const LOGO_COLORS = [
  { id: "primary", bg: "bg-brand-cyan", text: "text-on-primary", label: "Cian Primario" },
  { id: "emerald", bg: "bg-brand-emerald", text: "text-white", label: "Esmeralda" },
  { id: "indigo", bg: "bg-brand-indigo", text: "text-white", label: "Índigo" },
  { id: "amber", bg: "bg-brand-amber", text: "text-white", label: "Ámbar" },
  { id: "rose", bg: "bg-brand-rose", text: "text-white", label: "Rosa" },
  { id: "slate", bg: "bg-brand-slate", text: "text-white", label: "Gris Acero" },
];

const isCustomColor = (colorId: string) => !LOGO_COLORS.some((c) => c.id === colorId);

/** Map pathname to a human-readable page title. */
function usePageTitle(): string {
  const { pathname } = useLocation();
  const allItems = navSections.flatMap((s) => s.items);
  const match = allItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );
  return match?.label ?? "Página";
}

function TopbarClock() {
  const [timeStr, setTimeStr] = useState("");
  useEffect(() => {
    function update() {
      const n = new Date();
      const options: Intl.DateTimeFormatOptions = {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
      setTimeStr(n.toLocaleString("es-MX", options).replace(/\./g, ""));
    }
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-[11px] text-neutral-text-muted">{timeStr}</span>;
}


/** Badge interno reutilizable para el sidebar — compacta cuando isCollapsed. */
function NavBadge({ count, tone, collapsed }: { count: number; tone: "warning" | "danger" | "info"; collapsed: boolean }) {
  if (count <= 0) return null;
  const toneClasses = {
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    info: "bg-info/15 text-info",
  }[tone];

  if (collapsed) {
    const dotClass = { warning: "bg-warning", danger: "bg-danger", info: "bg-info" }[tone];
    return (
      <span
        aria-hidden="true"
        className={cn("absolute top-1 right-1 h-2 w-2 rounded-full", dotClass)}
      />
    );
  }

  return (
    <span
      className={cn(
        "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none min-w-5 text-center",
        toneClasses,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell() {
  useSyncQueue();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const sessionId = usePosStore((s) => s.sessionId);
  const sessionName = usePosStore((s) => s.sessionName);
  const pageTitle = usePageTitle();
  const location = useLocation();
  const navigate = useNavigate();
  const badges = useSidebarBadges();
  const commandPalette = useCommandPalette();
  const isOnline = useServerStatus();
  const isPosRoute = location.pathname.startsWith("/pos");
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const cmdKey = isMac ? "⌘" : "Ctrl";

  const queryClient = useQueryClient();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(isCollapsed));
  }, [isCollapsed]);

  // Dynamic system branding query (accesible a todos los roles)
  const brandingQuery = useQuery({
    queryKey: qk.branding(),
    queryFn: getBranding,
  });

  // Dynamic company brand customization state
  const isAdmin = user?.role === "admin";
  const can = useCan();
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.permission && !can(item.permission)) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const [isCustomizingBrand, setIsCustomizingBrand] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempSubtitle, setTempSubtitle] = useState("");
  const [tempIcon, setTempIcon] = useState("ShoppingCart");
  const [tempColor, setTempColor] = useState("primary");

  const configMutation = useMutation({
    mutationFn: (updates: Record<string, string>) => updateConfig(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.branding() });
      queryClient.invalidateQueries({ queryKey: qk.systemConfig() });
      toast.success("Diseño de marca actualizado.");
      setIsCustomizingBrand(false);
    },
    onError: () => {
      toast.error("No se pudo actualizar el diseño de marca.");
    },
  });

  const handleOpenCustomizer = () => {
    setTempName(brandingQuery.data?.company_name || "Ferretería");
    setTempSubtitle(brandingQuery.data?.company_subtitle || "VRNTAS POS");
    setTempIcon(brandingQuery.data?.company_logo_icon || "ShoppingCart");
    setTempColor(brandingQuery.data?.company_logo_color || "primary");
    setIsCustomizingBrand(true);
  };

  const handleSaveBrand = () => {
    const trimmedName = tempName.trim();
    if (!trimmedName) {
      toast.error("El nombre del local no puede estar vacío.");
      return;
    }
    configMutation.mutate({
      company_name: trimmedName,
      company_subtitle: tempSubtitle.trim(),
      company_logo_icon: tempIcon,
      company_logo_color: tempColor,
    });
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-neutral-bg lg:grid transition-[grid-template-columns] duration-200 ease-[var(--ease-out-strong)]",
        isCollapsed ? "lg:grid-cols-[64px_1fr]" : "lg:grid-cols-[240px_1fr]"
      )}
    >
      {/* Skip-to-content — visible only on focus (keyboard navigation) */}
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary focus:shadow-lg"
        href="#main-content"
      >
        Ir al contenido principal
      </a>

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-b border-neutral-border bg-sidebar-bg text-sidebar-text lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r transition-[width] duration-200 ease-[var(--ease-out-strong)] overflow-x-hidden",
          isCollapsed ? "lg:w-16" : "lg:w-60"
        )}
      >
        {/* Logo / brand */}
        <div 
          className={cn(
            "flex items-center gap-3 px-5 py-5 border-b border-white/5 shrink-0", 
            isCollapsed && "justify-center px-2",
            isAdmin && "hover:bg-white/5 transition-colors cursor-pointer group/brand relative"
          )}
          onClick={isAdmin ? handleOpenCustomizer : undefined}
          title={isAdmin ? "Personalizar diseño de marca" : undefined}
        >
          {/* Logo icon and background based on configuration */}
          {(() => {
            const configuredIconKey = brandingQuery.data?.company_logo_icon || "ShoppingCart";
            const LogoIconComponent = LOGO_ICONS[configuredIconKey as keyof typeof LOGO_ICONS] || ShoppingCart;
            const configuredColorKey = brandingQuery.data?.company_logo_color || "primary";
            const logoColorObj = LOGO_COLORS.find((c) => c.id === configuredColorKey);

            let bgStyle = {};
            let bgClass = "";
            let textClass = "text-white";

            if (logoColorObj) {
              bgClass = logoColorObj.bg;
              textClass = logoColorObj.text;
            } else {
              const hue = parseInt(configuredColorKey, 10);
              if (!isNaN(hue)) {
                bgStyle = { backgroundColor: `oklch(0.69 0.16 ${hue})` };
                textClass = hue >= 50 && hue <= 95 ? "text-neutral-text-primary" : "text-white";
              } else {
                bgClass = LOGO_COLORS[0].bg;
                textClass = LOGO_COLORS[0].text;
              }
            }

            return (
              <div 
                className={cn(
                  "flex h-9.5 w-9.5 items-center justify-center rounded-lg shadow-md shrink-0 transition-transform duration-150 ease-[var(--ease-out-strong)]",
                  bgClass, 
                  textClass,
                  isAdmin && "group-hover/brand:scale-105"
                )}
                style={bgStyle}
              >
                <LogoIconComponent size={18} />
              </div>
            );
          })()}

          {!isCollapsed && (
            <div className="fade-in flex-1 min-w-0 pr-6">
              <p className="text-sm font-bold text-white leading-tight transition-colors truncate">
                {brandingQuery.data?.company_name || "Ferretería"}
              </p>
              <p className="text-[10px] tracking-wider text-sidebar-text uppercase truncate">
                {brandingQuery.data?.company_subtitle || "VRNTAS POS"}
              </p>
            </div>
          )}

          {/* Settings icon overlay on hover for admin */}
          {isAdmin && !isCollapsed && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover/brand:opacity-100 transition-opacity text-sidebar-text/40 hover:text-white">
              <Settings size={14} />
            </div>
          )}
          {isAdmin && isCollapsed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 hover:opacity-100 transition-opacity rounded-md">
              <Settings size={14} className="text-white" />
            </div>
          )}
        </div>



        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
          {visibleSections.map((section) => (
            <div key={section.label} className="space-y-1">
              {!isCollapsed ? (
                <div className="text-[10px] font-semibold text-sidebar-muted/80 uppercase tracking-widest px-4 mb-2 fade-in">
                  {section.label}
                </div>
              ) : (
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-3" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const count = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <NavLink
                      className={({ isActive }) =>
                        cn(
                          "relative flex min-h-[38px] shrink-0 items-center rounded-md py-2 text-xs font-semibold transition-[background-color,padding-left,color] duration-150 ease-[var(--ease-out-strong)]",
                          isCollapsed ? "justify-center px-0" : "gap-3 px-3",
                          isActive
                            ? "bg-primary/15 text-info"
                            : "text-sidebar-text hover:bg-white/5 hover:text-white [@media(hover:hover)]:hover:pl-4",
                        )
                      }
                      end={item.href === "/"}
                      key={item.href}
                      to={item.href}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon aria-hidden="true" size={16} className="shrink-0" />
                      {!isCollapsed && (
                        <span className="truncate fade-in">{item.label}</span>
                      )}
                      {item.badgeKey && item.badgeTone && (
                        <NavBadge collapsed={isCollapsed} count={count} tone={item.badgeTone} />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer — operator info + session + logout */}
        <div className="mt-auto border-t border-white/5 p-4 lg:block hidden shrink-0">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              {sessionId && (
                <span className="w-2.5 h-2.5 rounded-full bg-success" title={sessionName ?? "Turno activo"} />
              )}
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary shrink-0 cursor-help"
                title={`${user?.full_name ?? "Usuario"} (${user?.role ?? "rol"})`}
              >
                {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <button
                onClick={() => void logout()}
                className="text-sidebar-text hover:text-danger p-1 transition-colors focus:ring-1 focus:ring-danger rounded"
                title="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <div className="fade-in space-y-3">
              {sessionId && (
                <Badge className="w-full justify-center border-success/30 bg-success/10 text-success text-[10px] py-0.5" dot tone="success">
                  {sessionName ?? "Turno activo"}
                </Badge>
              )}

              <div className="flex items-center gap-2.5 rounded-lg bg-white/5 p-2 border border-white/5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary shrink-0">
                  {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{user?.full_name ?? "Usuario"}</p>
                  <p className="truncate text-[10px] text-sidebar-text capitalize">{user?.role ?? "rol"}</p>
                </div>
                <button
                  onClick={() => void logout()}
                  className="text-sidebar-text hover:text-danger p-1 transition-colors focus:ring-1 focus:ring-danger rounded"
                  title="Cerrar sesión"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────── */}
      <div className="min-w-0 flex flex-col">
        {/* Header — sidebar toggle, breadcrumb, search palette, quick actions */}
        <header className="flex min-h-14 items-center justify-between border-b border-neutral-border bg-neutral-surface px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Sidebar toggle button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex h-9 w-9 items-center justify-center text-neutral-text-secondary bg-neutral-surface hover:bg-neutral-bg hover:text-neutral-text-primary rounded-md border border-neutral-border transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95 cursor-pointer shadow-sm shrink-0"
              title={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            >
              {isCollapsed ? <Menu size={14} /> : <ChevronLeft size={14} />}
            </button>

            <div className="flex items-center gap-1.5 text-xs text-neutral-text-secondary min-w-0">
              <Home className="text-neutral-text-muted shrink-0" size={14} />
              <ChevronRight className="text-neutral-text-muted shrink-0" size={12} />
              <span className="font-semibold text-neutral-text-primary truncate">{pageTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Command palette trigger — reemplaza el search vacío */}
            <button
              aria-label="Abrir paleta de comandos"
              className="hidden sm:flex items-center gap-2 h-9 bg-neutral-bg border border-neutral-border rounded-md px-3 text-xs text-neutral-text-secondary min-w-[220px] transition-colors duration-150 ease-[var(--ease-out-strong)] hover:border-primary/40 hover:text-neutral-text-primary focus:border-primary focus:ring-2 focus:ring-primary/30"
              onClick={() => commandPalette.setOpen(true)}
              type="button"
            >
              <Search className="text-neutral-text-muted shrink-0" size={14} />
              <span className="flex-1 text-left">Buscar páginas, productos...</span>
              <kbd className="rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-text-secondary">
                {cmdKey}K
              </kbd>
            </button>

            {/* Quick action — Nueva venta (oculto si ya estás en /pos o sin permiso) */}
            {!isPosRoute && can("ventas:crear") && (
              <Button
                aria-label="Nueva venta"
                className="hidden md:inline-flex min-h-0 h-9 px-3 text-xs"
                icon={<ShoppingCart aria-hidden="true" size={14} />}
                onClick={() => navigate("/pos")}
                variant="primary"
              >
                Nueva venta
              </Button>
            )}

            <TopbarClock />

            <PendingSalesIndicator />

            {/* Indicador conexión LAN */}
            <span
              aria-label={isOnline ? "Conexión LAN activa" : "Sin conexión al servidor"}
              className="relative inline-flex items-center justify-center"
              title={isOnline ? "Conexión LAN OK" : "Sin conexión al servidor"}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 rounded-full",
                  isOnline ? "bg-success" : "bg-danger animate-pulse",
                )}
              />
            </span>

            {/* Notificaciones: stock bajo, compras pendientes y ventas sin sincronizar (H-44) */}
            <NotificationsBell badges={badges} />

            {/* Tema toggle */}
            <button
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center text-neutral-text-secondary bg-neutral-surface hover:bg-neutral-bg hover:text-neutral-text-primary rounded-md border border-neutral-border transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-95 cursor-pointer shadow-sm"
              type="button"
              title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
            >
              <ThemeIcon aria-hidden="true" size={16} />
            </button>
            {/* Logout visible on mobile (sidebar footer hidden) */}
            <Button
              className="lg:hidden"
              icon={<LogOut aria-hidden="true" size={16} />}
              onClick={() => void logout()}
              variant="secondary"
            >
              Salir
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6" id="main-content">
          <Outlet />
        </main>
      </div>

      {/* Command Palette overlay — montado a nivel raíz para z-index limpio */}
      <CommandPalette />

      {/* ── Branding Customizer Modal ──────────────────────────── */}
      {isCustomizingBrand && (
        <Modal
          open={isCustomizingBrand}
          onClose={() => setIsCustomizingBrand(false)}
          title="Personalizar Diseño del Local"
          footer={
            <>
              <Button onClick={() => setIsCustomizingBrand(false)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={configMutation.isPending}
                onClick={handleSaveBrand}
                variant="primary"
              >
                {configMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {/* Live Preview Card */}
            <div className="rounded-lg bg-sidebar-bg p-4 border border-white/10 text-white shadow-inner">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Vista Previa en Barra Lateral</div>
              <div className="flex items-center gap-3">
                {(() => {
                  const IconComp = LOGO_ICONS[tempIcon as keyof typeof LOGO_ICONS] || ShoppingCart;
                  const colorObj = LOGO_COLORS.find((c) => c.id === tempColor);

                  let bgStyle = {};
                  let bgClass = "";
                  let textClass = "text-white";

                  if (colorObj) {
                    bgClass = colorObj.bg;
                    textClass = colorObj.text;
                  } else {
                    const hue = parseInt(tempColor, 10);
                    if (!isNaN(hue)) {
                      bgStyle = { backgroundColor: `oklch(0.69 0.16 ${hue})` };
                      textClass = hue >= 50 && hue <= 95 ? "text-neutral-text-primary" : "text-white";
                    } else {
                      bgClass = LOGO_COLORS[0].bg;
                      textClass = LOGO_COLORS[0].text;
                    }
                  }

                  return (
                    <div 
                      className={cn("flex h-9.5 w-9.5 items-center justify-center rounded-lg shadow-md shrink-0 transition-colors", bgClass, textClass)}
                      style={bgStyle}
                    >
                      <IconComp size={18} />
                    </div>
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight truncate">{tempName || "Ferretería"}</p>
                  <p className="text-[10px] tracking-wider uppercase text-slate-400 truncate">{tempSubtitle || "VRNTAS POS"}</p>
                </div>
              </div>
            </div>

            {/* Name Input */}
            <Input
              label="Nombre del Local"
              name="brand-name"
              maxLength={40}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Ej. Ferretería El Clavo"
              value={tempName}
            />

            {/* Subtitle Input */}
            <Input
              label="Subtítulo / Lema"
              name="brand-subtitle"
              maxLength={30}
              onChange={(e) => setTempSubtitle(e.target.value)}
              placeholder="Ej. Sucursal Centro"
              value={tempSubtitle}
            />

            {/* Icon Picker Grid */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-text-secondary">Icono de la Marca</label>
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(LOGO_ICONS).map(([key, IconComponent]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTempIcon(key)}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-lg border text-neutral-text-primary transition-colors duration-150 ease-[var(--ease-out-strong)] hover:bg-neutral-bg",
                      tempIcon === key
                        ? "border-primary bg-primary/10 text-primary-text ring-1 ring-primary"
                        : "border-neutral-border bg-neutral-surface"
                    )}
                  >
                    <IconComponent size={18} />
                  </button>
                ))}
              </div>
            </div>

            {/* Color Swatch Picker */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-text-secondary">Color del Icono</label>
              <div className="flex gap-3">
                {LOGO_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setTempColor(color.id)}
                    title={color.label}
                    className={cn(
                      "relative h-8 w-8 before:absolute before:inset-[-6px] before:content-[''] rounded-full border border-neutral-border flex items-center justify-center transition-transform duration-150 ease-[var(--ease-out-strong)] [@media(hover:hover)]:hover:scale-105 shadow-inner",
                      color.bg,
                      tempColor === color.id ? "ring-2 ring-primary ring-offset-2 ring-offset-neutral-surface" : ""
                    )}
                  >
                    {tempColor === color.id && (
                      <Check size={14} className="text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Hue Slider */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-neutral-text-secondary">Color Personalizado (Matiz / Hue)</label>
                <span className="text-[10px] font-mono text-neutral-text-muted">
                  {isCustomColor(tempColor) ? `${tempColor}°` : "Por defecto"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={isCustomColor(tempColor) ? tempColor : "235"}
                  onChange={(e) => setTempColor(e.target.value)}
                  className="w-full h-1.5 bg-neutral-bg rounded-lg appearance-none cursor-pointer accent-primary"
                  style={{
                    background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                  }}
                />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
