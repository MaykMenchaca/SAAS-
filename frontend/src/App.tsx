import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Boxes, Package, Settings, ShoppingCart, Users, BarChart3 } from "lucide-react";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/auth/protected-route";
import { AppShell } from "./components/layout/app-shell";
import { ErrorBoundary } from "./components/layout/error-boundary";
import { useAuthStore } from "./stores/auth-store";
import { DashboardPage } from "./pages/dashboard";
import { LoginPage } from "./pages/login";
import { ModulePlaceholder } from "./pages/module-placeholder";
import { NotFoundPage } from "./pages/not-found";

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
              <Route element={<ModulePlaceholder icon={<ShoppingCart aria-hidden="true" size={24} />} title="POS" />} path="pos" />
              <Route element={<ModulePlaceholder icon={<Package aria-hidden="true" size={24} />} title="Productos" />} path="productos" />
              <Route element={<ModulePlaceholder icon={<Boxes aria-hidden="true" size={24} />} title="Inventario" />} path="inventario" />
              <Route element={<ModulePlaceholder icon={<Users aria-hidden="true" size={24} />} title="Usuarios" />} path="usuarios" />
              <Route element={<ModulePlaceholder icon={<BarChart3 aria-hidden="true" size={24} />} title="Reportes" />} path="reportes" />
              <Route element={<ModulePlaceholder icon={<Settings aria-hidden="true" size={24} />} title="Configuracion" />} path="configuracion" />
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
