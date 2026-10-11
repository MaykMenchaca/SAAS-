import type { FormEvent } from "react";
import { useState } from "react";
import { AxiosError } from "axios";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { changePasswordRequest } from "../api/auth";
import { Button, Card, Input } from "../components/ui";
import { useAuthStore } from "../stores/auth-store";

const MIN_LENGTH = 8;

/**
 * Cambio de contraseña obligatorio (primer inicio de sesión del admin creado por el seed, o cuando
 * un administrador lo exige). Sin esta pantalla el backend responde 403 en todo (FE-101).
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const passwordChanged = useAuthStore((s) => s.passwordChanged);
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const nextError = next && next.length < MIN_LENGTH ? `Debe tener al menos ${MIN_LENGTH} caracteres.` : "";
  const confirmError = confirm && confirm !== next ? "Las contraseñas no coinciden." : "";
  const sameError = next && current && next === current ? "La nueva contraseña debe ser distinta de la actual." : "";
  const canSubmit = Boolean(current && next && confirm) && !nextError && !confirmError && !sameError && !saving;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSaving(true);
    try {
      const result = await changePasswordRequest(current, next);
      passwordChanged(result.access_token);
      toast.success("Contraseña actualizada.");
      navigate("/", { replace: true });
    } catch (caught) {
      const message =
        caught instanceof AxiosError ? caught.response?.data?.error ?? "No se pudo cambiar la contraseña." : "No se pudo cambiar la contraseña.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-bg p-4">
      <Card className="grid w-full max-w-md gap-5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-text">
            <KeyRound aria-hidden="true" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-text-primary">Cambia tu contraseña</h1>
            <p className="text-sm text-neutral-text-secondary">
              {user?.full_name ? `${user.full_name}, ` : ""}por seguridad debes elegir una contraseña nueva antes de continuar.
            </p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Input
            autoComplete="current-password"
            autoFocus
            label="Contraseña actual (temporal)"
            name="current_password"
            onChange={(e) => setCurrent(e.target.value)}
            type="password"
            value={current}
          />
          <Input
            autoComplete="new-password"
            error={nextError || sameError || undefined}
            label="Contraseña nueva"
            name="new_password"
            onChange={(e) => setNext(e.target.value)}
            type="password"
            value={next}
          />
          <Input
            autoComplete="new-password"
            error={confirmError || undefined}
            label="Confirma la contraseña nueva"
            name="confirm_password"
            onChange={(e) => setConfirm(e.target.value)}
            type="password"
            value={confirm}
          />

          {error ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger-text" role="alert">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button onClick={() => void logout()} variant="ghost">
              Cerrar sesión
            </Button>
            <Button disabled={!canSubmit} type="submit">
              {saving ? "Guardando..." : "Guardar y continuar"}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
