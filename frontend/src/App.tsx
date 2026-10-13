import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { ProtectedRoute } from "./components/auth/protected-route";
import { RequirePermission, useCan } from "./components/auth/require-permission";
import { AppShell } from "./components/layout/app-shell";
import { CommandPaletteProvider } from "./components/layout/command-palette-context";
import { ErrorBoundary } from "./components/layout/error-boundary";
import { queryClient } from "./lib/query-client";
import { useAuthStore } from "./stores/auth-store";
import { applyTheme, useThemeStore } from "./stores/theme-store";

// Lazy loaded page components
const CashCutPage = lazy(() => import("./pages/cash-cut").then((m) => ({ default: m.CashCutPage })));
const DashboardPage = lazy(() => import("./pages/dashboard").then((m) => ({ default: m.DashboardPage })));
const LoginPage = lazy(() => import("./pages/login").then((m) => ({ default: m.LoginPage })));
const ChangePasswordPage = lazy(() =>
  import("./pages/change-password").then((m) => ({ default: m.ChangePasswordPage })),
);
const InventoryPage = lazy(() => import("./pages/inventory").then((m) => ({ default: m.InventoryPage })));
const InventoryCountPage = lazy(() => import("./pages/inventory-count").then((m) => ({ default: m.InventoryCountPage })));
const NotFoundPage = lazy(() => import("./pages/not-found").then((m) => ({ default: m.NotFoundPage })));
const PosPage = lazy(() => import("./pages/pos").then((m) => ({ default: m.PosPage })));
const ProductsPage = lazy(() => import("./pages/products").then((m) => ({ default: m.ProductsPage })));
const PurchasesPage = lazy(() => import("./pages/purchases").then((m) => ({ default: m.PurchasesPage })));
const ReportsPage = lazy(() => import("./pages/reports").then((m) => ({ default: m.ReportsPage })));
const ReturnsPage = lazy(() => import("./pages/returns").then((m) => ({ default: m.ReturnsPage })));
const SalesHistoryPage = lazy(() => import("./pages/sales-history").then((m) => ({ default: m.SalesHistoryPage })));
const SettingsPage = lazy(() => import("./pages/settings").then((m) => ({ default: m.SettingsPage })));
const UsersPage = lazy(() => import("./pages/users").then((m) => ({ default: m.UsersPage })));
// Catálogo de componentes: solo en desarrollo (Vite elimina esta rama y su chunk en producción)
const UiCatalogPage = import.meta.env.DEV
  ? lazy(() => import("./pages/ui-catalog").then((m) => ({ default: m.UiCatalogPage })))
  : null;

function PageLoader() {
  return (
    <div className="flex h-full w-full min-h-[300px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function IndexRedirect() {
  const can = useCan();
  if (can("reportes:ver")) {
    return <DashboardPage />;
  }
  if (can("ventas:crear")) {
    return <Navigate replace to="/pos" />;
  }
  if (can("inventario:ver")) {
    return <Navigate replace to="/inventario" />;
  }
  return <Navigate replace to="/pos" />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <ThemeEvents />
          <AuthEvents />
          <SonnerTheme />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route element={<LoginPage />} path="/login" />
              {UiCatalogPage ? <Route element={<UiCatalogPage />} path="/_ui" /> : null}
              <Route element={<ChangePasswordRoute />} path="/cambiar-contrasena" />
              <Route
                element={
                  <ProtectedRoute>
                    <CommandPaletteProvider>
                      <AppShell />
                    </CommandPaletteProvider>
                  </ProtectedRoute>
                }
              >
                <Route element={<IndexRedirect />} index />
                <Route element={<RequirePermission permission="ventas:crear"><PosPage /></RequirePermission>} path="pos" />
                <Route element={<RequirePermission permission="caja:ver"><CashCutPage /></RequirePermission>} path="corte-caja" />
                <Route element={<RequirePermission permission="ventas:ver"><SalesHistoryPage /></RequirePermission>} path="ventas" />
                <Route element={<RequirePermission permission="ventas:cancelar"><ReturnsPage /></RequirePermission>} path="devoluciones" />
                <Route element={<RequirePermission permission="productos:ver"><ProductsPage /></RequirePermission>} path="productos" />
                <Route element={<RequirePermission permission="inventario:ver"><InventoryPage /></RequirePermission>} path="inventario" />
                <Route element={<RequirePermission permission="inventario:ajustar"><InventoryCountPage /></RequirePermission>} path="inventario/conteo" />
                <Route element={<RequirePermission permission="compras:ver"><PurchasesPage /></RequirePermission>} path="compras" />
                <Route element={<RequirePermission permission="usuarios:ver"><UsersPage /></RequirePermission>} path="usuarios" />
                <Route element={<RequirePermission permission="reportes:ver"><ReportsPage /></RequirePermission>} path="reportes" />
                <Route element={<RequirePermission permission="admin"><SettingsPage /></RequirePermission>} path="configuracion" />
              </Route>
              <Route element={<NotFoundPage />} path="*" />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

/** Sonner toaster with theme-awareness */
function SonnerTheme() {
  const theme = useThemeStore((state) => state.theme);
  return <Toaster position="bottom-right" richColors theme={theme} />;
}

function ThemeEvents() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return null;
}

/** Solo con sesión iniciada; si ya no hace falta cambiarla, vuelve al inicio. */
function ChangePasswordRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const mustChange = useAuthStore((state) => Boolean(state.user?.must_change_password));
  if (!isAuthenticated) return <Navigate replace to="/login" />;
  if (!mustChange) return <Navigate replace to="/" />;
  return <ChangePasswordPage />;
}

function AuthEvents() {
  const clearSession = useAuthStore((state) => state.clearSession);
  const loadCurrentUser = useAuthStore((state) => state.loadCurrentUser);

  useEffect(() => {
    void loadCurrentUser();

    function handleExpiredSession() {
      clearSession();
    }

    function handlePasswordChangeRequired() {
      useAuthStore.getState().requirePasswordChange();
    }

    window.addEventListener("auth:expired", handleExpiredSession);
    window.addEventListener("auth:password-change-required", handlePasswordChangeRequired);
    return () => {
      window.removeEventListener("auth:expired", handleExpiredSession);
      window.removeEventListener("auth:password-change-required", handlePasswordChangeRequired);
    };
  }, [clearSession, loadCurrentUser]);

  return null;
}
