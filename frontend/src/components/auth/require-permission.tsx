import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import type { AuthUser } from "../../api/auth";
import { useAuthStore } from "../../stores/auth-store";

/**
 * Evalúa si el usuario cuenta con un permiso específico.
 * Los usuarios con rol "admin" tienen acceso irrestricto.
 */
export function can(permission: string, user?: AuthUser | null): boolean {
  const currentUser = user ?? useAuthStore.getState().user;
  if (!currentUser) return false;
  if (currentUser.role === "admin") return true;
  return Boolean(currentUser.permissions?.includes(permission));
}

/** Hook reactivo para validar permisos contra el usuario de sesión */
export function useCan() {
  const user = useAuthStore((state) => state.user);
  return (permission?: string) => {
    if (!permission) return true;
    if (!user) return false;
    if (user.role === "admin") return true;
    return Boolean(user.permissions?.includes(permission));
  };
}

export function AccessDenied() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center animate-fade-in">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger ring-8 ring-danger/5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-neutral-text-primary">Acceso Denegado</h2>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-text-muted">
        No tienes permisos suficientes para acceder a este módulo.
      </p>
    </div>
  );
}

type RequirePermissionProps = {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
};

/**
 * Componente guardián de rutas y vistas basado en permisos.
 */
export function RequirePermission({
  permission,
  children,
  fallback,
  redirectTo,
}: RequirePermissionProps) {
  const canPerm = useCan();

  if (!canPerm(permission)) {
    if (redirectTo) {
      return <Navigate replace to={redirectTo} />;
    }
    return <>{fallback !== undefined ? fallback : <AccessDenied />}</>;
  }

  return <>{children}</>;
}
