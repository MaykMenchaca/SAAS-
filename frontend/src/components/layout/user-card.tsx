import { LogOut } from "lucide-react";

import { useAuthStore } from "../../stores/auth-store";
import { Button } from "../ui";
import { initialsOf, roleLabel } from "./nav-config";

/** Usuario en sesión: iniciales en cuadro de línea fina, nombre, "usuario · rol" y cerrar sesión. */
export function UserCard({ onLogout }: { onLogout?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex items-center gap-2.5">
      <div aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center border border-divider font-heading text-sm font-semibold">
        {initialsOf(user?.full_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{user?.full_name ?? "Usuario"}</div>
        <div className="truncate text-xs text-ink-2">
          {user?.username ?? "—"} · {roleLabel(user?.role)}
        </div>
      </div>
      <Button
        aria-label="Cerrar sesión"
        className="h-11 w-11 px-0 text-ink-2 lg:h-9 lg:min-h-0 lg:w-9"
        onClick={() => {
          onLogout?.();
          void logout();
        }}
        title="Cerrar sesión"
        variant="ghost"
      >
        <LogOut aria-hidden="true" size={16} />
      </Button>
    </div>
  );
}
