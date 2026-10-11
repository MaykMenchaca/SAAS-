import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "../../stores/auth-store";

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const mustChangePassword = useAuthStore((state) => Boolean(state.user?.must_change_password));
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  // Contraseña temporal (seed o reseteo): primero hay que cambiarla; el backend responde 403 en todo (FE-101)
  if (mustChangePassword) {
    return <Navigate replace to="/cambiar-contrasena" />;
  }

  return children;
}
