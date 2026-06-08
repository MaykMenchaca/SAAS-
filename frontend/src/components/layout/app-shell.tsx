import { BarChart3, Boxes, Calculator, CornerDownLeft, LayoutDashboard, LogOut, Package, ReceiptText, Settings, ShoppingCart, Truck, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";
import { Badge, Button } from "../ui";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/pos", icon: ShoppingCart, label: "POS" },
  { href: "/corte-caja", icon: Calculator, label: "Corte" },
  { href: "/ventas", icon: ReceiptText, label: "Ventas" },
  { href: "/devoluciones", icon: CornerDownLeft, label: "Devoluciones" },
  { href: "/productos", icon: Package, label: "Productos" },
  { href: "/inventario", icon: Boxes, label: "Inventario" },
  { href: "/compras", icon: Truck, label: "Compras" },
  { href: "/usuarios", icon: Users, label: "Usuarios" },
  { href: "/reportes", icon: BarChart3, label: "Reportes" },
  { href: "/configuracion", icon: Settings, label: "Config" },
];

export function AppShell() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  return (
    <div className="min-h-screen bg-neutral-bg lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-700 bg-sidebar-bg text-sidebar-text lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex min-h-16 items-center justify-between px-4 lg:min-h-20">
          <div>
            <p className="text-base font-bold text-white">POS Local</p>
            <p className="text-xs text-slate-300">Caja y control</p>
          </div>
          <Badge className="border-slate-600 bg-slate-800 text-slate-200">{user?.role ?? "rol"}</Badge>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:grid lg:gap-1 lg:overflow-visible lg:px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) =>
                  [
                    "flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-200 outline-none transition-colors hover:bg-slate-700 focus:ring-2 focus:ring-primary",
                    isActive ? "bg-slate-700 text-white" : "",
                  ].join(" ")
                }
                end={item.href === "/"}
                key={item.href}
                to={item.href}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-neutral-border bg-neutral-surface px-4 lg:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-text-primary">
              {user?.full_name ?? "Usuario"}
            </p>
            <p className="truncate text-xs text-neutral-text-secondary">Sucursal principal</p>
          </div>
          <Button icon={<LogOut aria-hidden="true" size={17} />} onClick={() => void logout()} variant="secondary">
            Salir
          </Button>
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
