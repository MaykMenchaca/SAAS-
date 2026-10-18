import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";

import { useSidebarBadges } from "../../hooks/use-sidebar-badges";
import { useSyncQueue } from "../../hooks/useSyncQueue";
import { cn } from "../../lib/cn";
import { useAuthStore } from "../../stores/auth-store";
import { POS_STORAGE_ERROR_EVENT } from "../../stores/pos-store";
import { useCan } from "../auth/require-permission";
import { BrandCustomizer } from "./brand-customizer";
import { CommandPalette } from "./command-palette";
import { ErrorBoundary } from "./error-boundary";
import { MobileDrawer } from "./mobile-drawer";
import { filterNav, findNavEntry, navSections } from "./nav-config";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useBrand } from "./use-brand";

/** Avisa (una vez por minuto) si el navegador no pudo guardar ventas o el carrito (OPS-15). */
function useStorageErrorAlert() {
  useEffect(() => {
    let lastShown = 0;
    function onError() {
      if (Date.now() - lastShown < 60_000) return;
      lastShown = Date.now();
      toast.error(
        "No se pudo guardar en este equipo (almacenamiento lleno o bloqueado). Las ventas sin conexión podrían perderse al recargar: no recargues la página y avisa a soporte.",
        { duration: 30_000 },
      );
    }
    window.addEventListener(POS_STORAGE_ERROR_EVENT, onError);
    return () => window.removeEventListener(POS_STORAGE_ERROR_EVENT, onError);
  }, []);
}

/**
 * Marco de la aplicación (diseño Industry): menú lateral de 236 px (64 px colapsado), encabezado de 64 px y
 * contenido. El menú se colapsa solo en el punto de venta; en el resto de pantallas se puede colapsar a mano
 * y la preferencia se recuerda. Por debajo de `lg` el menú es un drawer.
 */
function PageSpinner() {
  return (
    <div className="flex min-h-[300px] w-full items-center justify-center" role="status">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  );
}

export function AppShell() {
  useSyncQueue();
  useStorageErrorAlert();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const badges = useSidebarBadges();
  const brand = useBrand();

  const isPosRoute = location.pathname.startsWith("/pos");
  const isAdmin = user?.role === "admin";
  const sections = filterNav(navSections, { isAdmin, can });
  const entry = findNavEntry(location.pathname);
  const pageTitle = entry?.item.label ?? "Página";

  const [manualCollapsed, setManualCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customizingBrand, setCustomizingBrand] = useState(false);
  const isCollapsed = isPosRoute || manualCollapsed;

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(manualCollapsed));
  }, [manualCollapsed]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${pageTitle} · ${brand.companyName || "VRNTAS POS"}`;
  }, [pageTitle, brand.companyName]);

  return (
    <div
      className={cn(
        "min-h-screen bg-bg text-text lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-[var(--ease-out-strong)]",
        isCollapsed ? "lg:grid-cols-[64px_minmax(0,1fr)]" : "lg:grid-cols-[236px_minmax(0,1fr)]",
      )}
    >
      {/* Saltar al contenido — visible solo al enfocarlo con el teclado */}
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:bg-accent focus:px-4 focus:py-2 focus:text-on-acc focus:shadow-lg"
        href="#main-content"
      >
        Ir al contenido principal
      </a>

      <Sidebar badges={badges} collapsed={isCollapsed} onCustomizeBrand={isAdmin ? () => setCustomizingBrand(true) : undefined} sections={sections} />

      <div className="flex min-w-0 flex-col">
        <Topbar
          badges={badges}
          isCollapsed={isCollapsed}
          isPosRoute={isPosRoute}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onToggleCollapsed={() => setManualCollapsed((v) => !v)}
          pageTitle={pageTitle}
          sectionLabel={entry?.section}
        />
        {/* El POS ocupa todo el ancho y alto disponibles (sin el relleno de las demás pantallas) */}
        <main className={cn("flex-1", isPosRoute ? "p-0" : "p-4 lg:p-6")} id="main-content">
          {/* Error y carga por página: el menú sigue disponible y al navegar se reintenta (RF-52) */}
          <ErrorBoundary resetKey={location.pathname} variant="page">
            <Suspense fallback={<PageSpinner />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Paleta Ctrl K: montada en la raíz para un z-index limpio */}
      <CommandPalette />

      <MobileDrawer badges={badges} onClose={() => setMobileMenuOpen(false)} open={mobileMenuOpen} sections={sections} />

      {customizingBrand ? <BrandCustomizer onClose={() => setCustomizingBrand(false)} /> : null}
    </div>
  );
}
