import type { FormEvent } from "react";
import { useState } from "react";
import { CircleCheck, KeyRound } from "lucide-react";

import type { Role, User, UserCreatePayload } from "../../api/users";
import { Button, Card, Input, Segmented } from "../../components/ui";
import { roleLabel } from "./helpers";

type FormState = {
  email: string;
  full_name: string;
  password: string;
  role_id: string;
  username: string;
};

type UserPanelProps = {
  canDeactivate: boolean;
  canEdit: boolean;
  error: string;
  isSaving: boolean;
  onClose: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onResetPassword: () => void;
  onSubmit: (payload: UserCreatePayload) => void;
  roles: Role[];
  saved: boolean;
  /** Usuario en edición; `null` para el alta. */
  user: User | null;
};

function initialForm(user: User | null, roles: Role[]): FormState {
  if (user) {
    return {
      email: user.email ?? "",
      full_name: user.full_name,
      password: "",
      role_id: String(user.role_id),
      username: user.username,
    };
  }
  const cajero = roles.find((role) => role.name === "cajero") ?? roles[0];
  return { email: "", full_name: "", password: "", role_id: cajero ? String(cajero.id) : "", username: "" };
}

/** Panel lateral de alta y edición. Se remonta (con `key`) al cambiar de usuario. */
export function UserPanel({
  canDeactivate,
  canEdit,
  error,
  isSaving,
  onClose,
  onDeactivate,
  onReactivate,
  onResetPassword,
  onSubmit,
  roles,
  saved,
  user,
}: UserPanelProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(user, roles));
  const editing = user !== null;
  const readOnly = !canEdit;

  const selectedRole = roles.find((role) => String(role.id) === form.role_id);
  const canSubmit = Boolean(
    form.username.trim() && form.full_name.trim() && form.role_id && (editing || form.password.trim()),
  );

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || readOnly) return;
    onSubmit({
      email: form.email.trim() || null,
      full_name: form.full_name.trim(),
      password: form.password,
      role_id: Number(form.role_id),
      username: form.username.trim(),
    });
  }

  return (
    <Card className="flex flex-col" frame>
      <header className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3.5">
        <div className="min-w-0">
          <div className="font-heading text-sm font-semibold uppercase tracking-widest text-acc-text">
            {editing ? `Editar · @${user.username}` : "Alta"}
          </div>
          <h2 className="mt-0.5 truncate text-2xl">{editing ? user.full_name : "Nuevo usuario"}</h2>
        </div>
        <Button className="shrink-0" onClick={onClose} size="sm" variant="ghost">
          Cerrar
        </Button>
      </header>

      <form className="grid gap-3 px-4 py-4" id="user-form" onSubmit={handleSubmit}>
        <Input
          disabled={editing || readOnly}
          label="Usuario"
          name="username"
          onChange={(e) => setField("username", e.target.value)}
          placeholder="ej. jperez"
          value={form.username}
        />
        <Input
          disabled={readOnly}
          label="Nombre completo"
          name="full_name"
          onChange={(e) => setField("full_name", e.target.value)}
          value={form.full_name}
        />
        <Input
          disabled={readOnly}
          label="Email (opcional)"
          name="email"
          onChange={(e) => setField("email", e.target.value)}
          type="email"
          value={form.email}
        />

        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-text" id="user-role-label">Rol</span>
          <Segmented
            aria-label="Rol"
            className={readOnly ? "pointer-events-none opacity-60" : undefined}
            fullWidth
            onChange={(value) => setField("role_id", String(value))}
            options={roles.map((role) => ({ label: roleLabel(role.name), value: String(role.id) }))}
            value={form.role_id}
          />
          {selectedRole?.description ? <p className="text-sm text-ink-2">{selectedRole.description}</p> : null}
        </div>

        <Input
          autoComplete="new-password"
          disabled={readOnly}
          label={editing ? "Nueva contraseña (opcional)" : "Contraseña temporal"}
          name="password"
          onChange={(e) => setField("password", e.target.value)}
          placeholder={editing ? "Déjala vacía para mantener la actual" : "Mínimo 8 caracteres"}
          type="password"
          value={form.password}
        />

        {readOnly ? <p className="text-sm text-ink-2">Tu rol solo puede consultar los usuarios.</p> : null}
        {error ? (
          <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
            {error}
          </div>
        ) : null}
      </form>

      {readOnly ? null : (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <Button className="flex-1" disabled={!canSubmit || isSaving} form="user-form" frame type="submit">
            {isSaving ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}
          </Button>
          {editing ? (
            <Button disabled={!user.is_active} icon={<KeyRound aria-hidden="true" size={16} />} onClick={onResetPassword} variant="secondary">
              Restablecer contraseña
            </Button>
          ) : null}
        </div>
      )}

      {editing && user.is_active && canDeactivate ? (
        <div className="px-4 pb-4">
          <Button className="text-bad" onClick={onDeactivate} variant="ghost">
            Desactivar usuario
          </Button>
        </div>
      ) : null}
      {editing && !user.is_active && canEdit ? (
        <div className="px-4 pb-4">
          <Button onClick={onReactivate} variant="ghost">
            Reactivar usuario
          </Button>
        </div>
      ) : null}

      {saved ? (
        <p className="mx-4 mb-4 flex items-center gap-1.5 text-sm text-ok" role="status">
          <CircleCheck aria-hidden="true" size={14} />
          Usuario guardado.
        </p>
      ) : null}
    </Card>
  );
}
