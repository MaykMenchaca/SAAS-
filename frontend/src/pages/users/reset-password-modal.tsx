import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import type { User } from "../../api/users";
import { Button, Modal } from "../../components/ui";

type ResetPasswordModalProps = {
  error: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Contraseña temporal devuelta por el servidor; solo existe en memoria mientras el diálogo está abierto. */
  temporaryPassword: string | null;
  user: User;
};

export function ResetPasswordModal({ error, isPending, onClose, onConfirm, temporaryPassword, user }: ResetPasswordModalProps) {
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  async function copy() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  if (temporaryPassword) {
    return (
      <Modal
        footer={<Button onClick={onClose}>Listo, ya la anoté</Button>}
        onClose={onClose}
        open
        title="Contraseña temporal"
      >
        <div className="grid gap-4">
          <p className="text-ink-2">
            Entrega esta contraseña a <strong className="text-text">{user.full_name}</strong> (@{user.username}). Deberá cambiarla al iniciar sesión.
          </p>
          <div className="flex flex-wrap items-center gap-3 border border-field-border bg-surface px-3 py-3">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-xl text-text" data-testid="temporary-password">
              {temporaryPassword}
            </code>
            <Button
              icon={copied === "ok" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
              onClick={() => void copy()}
              variant="secondary"
            >
              {copied === "ok" ? "Copiada" : "Copiar"}
            </Button>
          </div>
          {copied === "error" ? (
            <p className="text-sm text-bad" role="alert">No se pudo copiar automáticamente. Selecciónala y cópiala a mano.</p>
          ) : null}
          <p className="border border-warn bg-warn-tint px-3 py-2 text-sm font-medium text-warn" role="note">
            No se volverá a mostrar. Si la pierdes, tendrás que restablecerla de nuevo.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">Cancelar</Button>
          <Button disabled={isPending} icon={<KeyRound aria-hidden="true" size={16} />} onClick={onConfirm}>
            {isPending ? "Restableciendo…" : "Restablecer contraseña"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Restablecer contraseña"
    >
      <div className="grid gap-3">
        <p className="text-ink-2">
          Se generará una contraseña temporal para <strong className="text-text">{user.full_name}</strong> (@{user.username}).
          Se cerrarán sus sesiones abiertas y tendrá que cambiarla al volver a entrar.
        </p>
        {error ? (
          <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">{error}</div>
        ) : null}
      </div>
    </Modal>
  );
}
