import {
  BarChart3,
  Boxes,
  Calculator,
  CornerDownLeft,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { SidebarBadges } from "../../hooks/use-sidebar-badges";

export type BadgeKey = keyof SidebarBadges;

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  badgeKey?: BadgeKey;
  /** `warning` = ámbar (stock bajo); `info` = acento (compras pendientes); `danger` = rojo. */
  badgeTone?: "warning" | "danger" | "info";
  permission?: string;
  adminOnly?: boolean;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/** Estructura de navegación del diseño: Principal, Inventario, Finanzas y Sistema. */
export const navSections: NavSection[] = [
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

/** Sección y página que corresponden a una ruta (para el breadcrumb y el título del documento). */
export function findNavEntry(pathname: string): { section: string; item: NavItem } | null {
  for (const section of navSections) {
    for (const item of section.items) {
      const matches = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      if (matches) return { section: section.label, item };
    }
  }
  return null;
}

/** Filtra la navegación según el rol y los permisos del usuario. */
export function filterNav(sections: NavSection[], opts: { isAdmin: boolean; can: (permission: string) => boolean }): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminOnly && !opts.isAdmin) return false;
        if (item.permission && !opts.can(item.permission)) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", gerente: "Gerente", cajero: "Cajero" };

/** Nombre legible del rol (admin → Administrador). */
export function roleLabel(role: string | undefined): string {
  if (!role) return "Usuario";
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

/** Iniciales para el cuadro de usuario: "Laura Méndez" → "LM". */
export function initialsOf(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
