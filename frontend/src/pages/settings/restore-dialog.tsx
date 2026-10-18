import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import type { RestoreStatus } from "../../api/backup";
import { getRestoreStatus, restoreBackup } from "../../api/backup";
import type { BackupEntry } from "../../api/config";
import { Button, Input, Modal } from "../../components/ui";
import { useAuthStore } from "../../stores/auth-store";
import { formatBytes, formatDateTime } from "./format";

type Step = "resumen" | "confirmar" | "progreso";

type Props = {
  backup: BackupEntry;
  onClose: () => void;
  /** Intervalo de consulta del estado; configurable para las pruebas. */
  pollMs?: number;
};

/**
 * Restaurar un respaldo en dos pasos: 1) resumen de lo que ocurrirá, 2) escribir el nombre exacto
 * del archivo. Después muestra el progreso consultando el estado y, al terminar, cierra la sesión.
 */
export function RestoreDialog({ backup, onClose, pollMs = 2000 }: Props) {
  const [step, setStep] = useState<Step>("resumen");
  const [typed, setTyped] = useState("");
  const [startError, setStartError] = useState("");
  const loggedOut = useRef(false);

  const matches = typed === backup.filename;

  const startMutation = useMutation({
    mutationFn: () => restoreBackup(backup.filename),
    onSuccess: () => {
      setStartError("");
      setStep("progreso");
    },
    onError: (error) => {
      setStartError(
        error instanceof AxiosError
          ? error.response?.data?.error ?? "No se pudo iniciar la restauración."
          : "No se pudo iniciar la restauración.",
      );
    },
  });

  const statusQuery = useQuery<RestoreStatus>({
    queryKey: ["restore-status"],
    queryFn: getRestoreStatus,
    enabled: step === "progreso",
    // Mientras corre, y también si el servidor tarda en responder, se sigue preguntando
    refetchInterval: (query) => (query.state.data?.state === "ok" || query.state.data?.state === "error" ? false : pollMs),
    retry: false,
    gcTime: 0,
  });

  const status = statusQuery.data;
  const finished = status?.state === "ok";
  const failed = status?.state === "error";

  // Al terminar bien, todas las sesiones quedaron revocadas: se cierra la de este usuario
  function endSession() {
    if (loggedOut.current) return;
    loggedOut.current = true;
    useAuthStore.getState().clearSession();
  }

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(endSession, 4000);
    return () => clearTimeout(timer);
  }, [finished]);

  if (step === "progreso") {
    return (
      <Modal
        footer={
          finished ? (
            <Button onClick={endSession}>Ir al inicio de sesión</Button>
          ) : failed ? (
            <Button onClick={onClose}>Cerrar</Button>
          ) : undefined
        }
        onClose={() => {
          if (failed) onClose();
        }}
        open
        title="Restaurando respaldo"
      >
        <div aria-live="polite" className="grid gap-3 text-sm" role="status">
          {finished ? (
            <p className="flex items-start gap-2 font-medium text-ok">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
              <span>{status?.message}</span>
            </p>
          ) : failed ? (
            <p className="flex items-start gap-2 font-medium text-bad">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
              <span>{status?.message}</span>
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 font-medium">
                <Loader2 aria-hidden="true" className="animate-spin" size={18} />
                {status?.step || "Restaurando la base de datos..."}
              </p>
              <p className="text-ink-2">
                No cierres esta ventana ni apagues el servidor. Las cajas muestran un aviso de mantenimiento y
                guardan sus ventas para enviarlas después.
              </p>
              {statusQuery.isError ? (
                <p className="text-warn">Esperando respuesta del servidor...</p>
              ) : null}
            </>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      footer={
        step === "resumen" ? (
          <>
            <Button onClick={onClose} variant="secondary">
              Cancelar
            </Button>
            <Button onClick={() => setStep("confirmar")} variant="danger">
              Continuar
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={startMutation.isPending}
              onClick={() => {
                setStep("resumen");
                setTyped("");
                setStartError("");
              }}
              variant="secondary"
            >
              Atrás
            </Button>
            <Button disabled={!matches || startMutation.isPending} onClick={() => startMutation.mutate()} variant="danger">
              {startMutation.isPending ? "Iniciando..." : "Restaurar ahora"}
            </Button>
          </>
        )
      }
      onClose={onClose}
      open
      title={step === "resumen" ? "Restaurar respaldo · paso 1 de 2" : "Restaurar respaldo · paso 2 de 2"}
    >
      {step === "resumen" ? (
        <div className="grid gap-4 text-sm">
          <dl className="grid gap-2 border border-divider p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-2">Archivo</dt>
              <dd className="break-all font-mono font-medium">{backup.filename}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-2">Fecha del respaldo</dt>
              <dd>{formatDateTime(backup.created_at)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-2">Tamaño</dt>
              <dd className="tabular-nums">{formatBytes(backup.size)}</dd>
            </div>
          </dl>
          <div className="grid gap-2 border border-warn bg-warn-tint p-3 text-text">
            <p className="flex items-center gap-2 font-semibold text-warn">
              <AlertTriangle aria-hidden="true" size={17} />
              Esta acción reemplaza todos los datos actuales
            </p>
            <ul className="grid list-disc gap-1 pl-5">
              <li>Se cerrarán todas las sesiones y cajas; todos tendrán que volver a iniciar sesión.</li>
              <li>Lo capturado después de la fecha del respaldo se perderá.</li>
              <li>Antes de restaurar se crea un respaldo automático (pre-restore) y, si algo falla, se recupera solo.</li>
              <li>Durante unos minutos el sistema estará en mantenimiento.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 text-sm">
          <p>
            Para confirmar, escribe el nombre exacto del archivo:{" "}
            <span className="break-all font-mono font-semibold">{backup.filename}</span>
          </p>
          <Input
            autoComplete="off"
            label="Nombre del archivo"
            name="restore-confirm"
            onChange={(e) => setTyped(e.target.value)}
            placeholder={backup.filename}
            value={typed}
          />
          {startError ? (
            <div className="border border-bad bg-bad-tint px-3 py-2 font-medium text-bad" role="alert">
              {startError}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
