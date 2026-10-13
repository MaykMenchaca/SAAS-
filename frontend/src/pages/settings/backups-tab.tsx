import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Database, DatabaseBackup } from "lucide-react";
import { toast } from "sonner";

import { downloadBackup } from "../../api/backup";
import type { BackupEntry } from "../../api/config";
import { createBackup, deleteBackup, listBackups, verifyBackup } from "../../api/config";
import { qk } from "../../api/query-keys";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  SkeletonTable,
  Table,
  tableCellClass,
  tableHeadClass,
  tableNumClass,
  tableRowClass,
} from "../../components/ui";
import { formatBytes, formatDateTime } from "./format";

function apiError(error: unknown, fallback: string) {
  return error instanceof AxiosError ? error.response?.data?.error ?? fallback : fallback;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="font-heading text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function BackupsTab() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const backupsQuery = useQuery({
    queryKey: qk.backups(),
    queryFn: listBackups,
  });

  const createMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.backups() });
      toast.success("Respaldo creado correctamente.");
    },
    onError: (err) => toast.error(apiError(err, "No se pudo crear el respaldo.")),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.backups() });
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(apiError(err, "No se pudo eliminar el respaldo.")),
  });

  const verifyMutation = useMutation({
    mutationFn: verifyBackup,
    onSuccess: (result) => {
      toast.success(`Respaldo verificado: ${result.filename} (${result.entries} entradas).`);
    },
    onError: () => {
      toast.error("No se pudo verificar el respaldo.");
    },
  });

  const downloadMutation = useMutation({
    mutationFn: downloadBackup,
    onError: (err) => toast.error(apiError(err, "No se pudo descargar el respaldo.")),
  });

  if (backupsQuery.isLoading) {
    return <SkeletonTable rows={4} cols={4} />;
  }

  if (backupsQuery.isError) {
    return <ErrorState onRetry={() => void backupsQuery.refetch()} />;
  }

  const backups: BackupEntry[] = backupsQuery.data ?? [];
  const latest = backups[0];

  return (
    <div className="grid gap-4">
      <div className="grid items-center border border-divider sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <Stat label="Último respaldo" value={latest ? formatDateTime(latest.created_at) : "Sin respaldos"} />
        <div className="sm:border-l sm:border-divider">
          <Stat label="Programación" value="Diario, 23:30" />
        </div>
        <div className="sm:border-l sm:border-divider">
          <Stat label="Respaldos guardados" value={String(backups.length)} />
        </div>
        <div className="px-4 py-3.5 sm:border-l sm:border-divider">
          <Button
            disabled={createMutation.isPending}
            frame
            icon={<DatabaseBackup aria-hidden="true" size={17} />}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creando..." : "Crear respaldo ahora"}
          </Button>
        </div>
      </div>

      <Card frame>
        {backups.length === 0 ? (
          <EmptyState icon={<Database aria-hidden="true" size={32} />} message="Sin respaldos. Crea el primero." />
        ) : (
          <Table>
            <caption className="sr-only">Tabla de respaldos</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Archivo</th>
                <th className={`${tableHeadClass} text-right`}>Tamaño</th>
                <th className={tableHeadClass}>Fecha</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr className={tableRowClass} key={backup.filename}>
                  <td className={`${tableCellClass} font-mono text-sm font-medium`}>{backup.filename}</td>
                  <td className={`${tableCellClass} ${tableNumClass} font-mono text-sm text-ink-2`}>{formatBytes(backup.size)}</td>
                  <td className={`${tableCellClass} whitespace-nowrap text-sm text-ink-2`}>{formatDateTime(backup.created_at)}</td>
                  <td className={tableCellClass}>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        aria-label={`Verificar ${backup.filename}`}
                        disabled={verifyMutation.isPending}
                        onClick={() => verifyMutation.mutate(backup.filename)}
                        size="sm"
                        variant="ghost"
                      >
                        Verificar
                      </Button>
                      <Button
                        aria-label={`Descargar ${backup.filename}`}
                        disabled={downloadMutation.isPending}
                        onClick={() => downloadMutation.mutate(backup.filename)}
                        size="sm"
                        variant="ghost"
                      >
                        Descargar
                      </Button>
                      <Button
                        aria-label={`Eliminar ${backup.filename}`}
                        className="text-bad"
                        onClick={() => setConfirmDelete(backup.filename)}
                        size="sm"
                        variant="ghost"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {confirmDelete ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmDelete(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDelete)}
                variant="danger"
              >
                {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </>
          }
          onClose={() => setConfirmDelete(null)}
          open
          title="Eliminar respaldo"
        >
          <p className="text-sm text-ink-2">
            ¿Seguro que quieres eliminar el respaldo <span className="font-mono font-semibold">{confirmDelete}</span>?
            Esta acción no se puede deshacer.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
