import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/auth/protected-route";
import { AppShell } from "./components/layout/app-shell";
import { ErrorBoundary } from "./components/layout/error-boundary";
import { useAuthStore } from "./stores/auth-store";
import { CashCutPage } from "./pages/cash-cut";
import { DashboardPage } from "./pages/dashboard";
import { LoginPage } from "./pages/login";
import { InventoryPage } from "./pages/inventory";
import { InventoryCountPage } from "./pages/inventory-count";
import { NotFoundPage } from "./pages/not-found";
import { PosPage } from "./pages/pos";
import { ProductsPage } from "./pages/products";
import { PurchasesPage } from "./pages/purchases";
import { ReportsPage } from "./pages/reports";
import { ReturnsPage } from "./pages/returns";
import { SalesHistoryPage } from "./pages/sales-history";
import { SettingsPage } from "./pages/settings";
import { UsersPage } from "./pages/users";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthEvents />
          <Routes>
            <Route element={<LoginPage />} path="/login" />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route element={<DashboardPage />} index />
              <Route element={<PosPage />} path="pos" />
              <Route element={<CashCutPage />} path="corte-caja" />
              <Route element={<SalesHistoryPage />} path="ventas" />
              <Route element={<ReturnsPage />} path="devoluciones" />
              <Route element={<ProductsPage />} path="productos" />
              <Route element={<InventoryPage />} path="inventario" />
              <Route element={<InventoryCountPage />} path="inventario/conteo" />
              <Route element={<PurchasesPage />} path="compras" />
              <Route element={<UsersPage />} path="usuarios" />
              <Route element={<ReportsPage />} path="reportes" />
              <Route element={<SettingsPage />} path="configuracion" />
            </Route>
            <Route element={<NotFoundPage />} path="*" />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

function AuthEvents() {
  const clearSession = useAuthStore((state) => state.clearSession);
  const loadCurrentUser = useAuthStore((state) => state.loadCurrentUser);

  useEffect(() => {
    void loadCurrentUser();

    function handleExpiredSession() {
      clearSession();
    }

    window.addEventListener("auth:expired", handleExpiredSession);
    return () => window.removeEventListener("auth:expired", handleExpiredSession);
  }, [clearSession, loadCurrentUser]);

  return null;
}
