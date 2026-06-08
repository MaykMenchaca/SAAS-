import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  Database,
  Download,
  HardDrive,
  Save,
  ScrollText,
  Settings,
  Trash2,
} from "lucide-react";

import type { AuditLog } from "../api/audit";
import { listAuditLogs } from "../api/audit";
import type { BackupEntry, ConfigMap } from "../api/config";
import { createBackup, deleteBackup, getConfig, listBackups, updateConfig } from "../api/config";
import { Badge, Button, Card, Input, Modal, Table, tableCellClass, tableHeadClass, Toast } from "../components/ui";

// ── Helpers ────────────────────────────────────────────────────────

type Tab = "general" | "auditoria" | "backups";

const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "auditoria", label: "Auditoria", icon: ScrollText },
  { id: "backups", label: "Backups", icon: Database },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function actionTone(action: string): "neutral" | "success" | "warning" | "danger" {
  if (action === "create" || action === "login") return "success";
  if (action === "delete" || action === "cancel") return "danger";
  if (action === "update") return "warning";
  return "neutral";
}

// ── Main Page ──────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Configuracion</h1>
          <p className="text-sm text-neutral-text-secondary">Ajustes del sistema, auditoria y respaldos</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={[
                "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
                activeTab === tab.id
                  ? "bg-neutral-surface text-primary shadow-sm"
                  : "text-neutral-text-secondary hover:text-neutral-text-primary",
              ].join(" ")}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "general" ? <GeneralTab /> : null}
      {activeTab === "auditoria" ? <AuditTab /> : null}
      {activeTab === "backups" ? <BackupsTab /> : null}
    </div>
  );
}

// ── General Tab ───────────────────────────────────────────────────

function GeneralTab() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ConfigMap>({});
  const [saved, setSaved] = useState(false);

  const configQuery = useQuery({
    queryKey: ["system-config"],
    queryFn: getConfig,
  });

  useEffect(() => {
    if (configQuery.data) {
      setFormData(configQuery.data);
    }
  }, [configQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function setField(key: string, value: string) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate(formData);
  }

  const errorMessage = updateMutation.error
    ? updateMutation.error instanceof AxiosError
      ? updateMutation.error.response?.data?.error ?? "No se pudo guardar."
      : "No se pudo guardar."
    : "";

  const configFields: { key: string; label: string; placeholder: string }[] = [
    { key: "company_name", label: "Nombre de la empresa", placeholder: "Mi Negocio" },
    { key: "company_address", label: "Direccion", placeholder: "Calle 123, Col. Centro" },
    { key: "company_phone", label: "Telefono", placeholder: "(123) 456-7890" },
    { key: "company_rfc", label: "RFC", placeholder: "XAXX010101000" },
    { key: "default_tax_rate", label: "IVA por defecto (%)", placeholder: "16.00" },
    { key: "ticket_footer", label: "Pie de ticket", placeholder: "Gracias por su compra" },
  ];

  return (
    <Card className="p-4">
      {configQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando configuracion...</p>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {configFields.map((field) => (
              <Input
                key={field.key}
                label={field.label}
                name={field.key}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                value={formData[field.key] ?? ""}
              />
            ))}
          </div>

          {errorMessage ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
              {errorMessage}
            </div>
          ) : null}

          {saved ? <Toast tone="success">Configuracion guardada correctamente.</Toast> : null}

          <div className="flex justify-end">
            <Button
              disabled={updateMutation.isPending}
              icon={<Save aria-hidden="true" size={17} />}
              type="submit"
            >
              {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

// ── Audit Tab ─────────────────────────────────────────────────────

function AuditTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const auditQuery = useQuery({
    queryKey: ["audit-logs", page, actionFilter, entityFilter],
    queryFn: () =>
      listAuditLogs({
        page,
        perPage: 30,
        action: actionFilter,
        entityType: entityFilter,
      }),
  });

  const logs = auditQuery.data?.items ?? [];
  const totalPages = auditQuery.data?.pages ?? 1;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Accion</span>
          <select
            className="min-h-11 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            value={actionFilter}
          >
            <option value="">Todas</option>
            <option value="login">Login</option>
            <option value="create">Crear</option>
            <option value="update">Actualizar</option>
            <option value="delete">Eliminar</option>
            <option value="cancel">Cancelar</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Entidad</span>
          <select
            className="min-h-11 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            value={entityFilter}
          >
            <option value="">Todas</option>
            <option value="sale">Venta</option>
            <option value="product">Producto</option>
            <option value="user">Usuario</option>
            <option value="inventory">Inventario</option>
            <option value="purchase_order">Orden de compra</option>
            <option value="backup">Backup</option>
            <option value="config">Configuracion</option>
          </select>
        </label>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <th className={tableHeadClass}>Fecha</th>
              <th className={tableHeadClass}>Usuario</th>
              <th className={tableHeadClass}>Accion</th>
              <th className={tableHeadClass}>Entidad</th>
              <th className={tableHeadClass}>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: AuditLog) => (
              <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={log.id}>
                <td className={`${tableCellClass} text-xs text-neutral-text-secondary`}>
                  {new Date(log.created_at).toLocaleString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </td>
                <td className={tableCellClass}>
                  <span className="font-medium">{log.username ?? "Sistema"}</span>
                  {log.ip_address ? (
                    <div className="font-mono text-xs text-neutral-text-muted">{log.ip_address}</div>
                  ) : null}
                </td>
                <td className={tableCellClass}>
                  <Badge tone={actionTone(log.action)}>{log.action}</Badge>
                </td>
                <td className={tableCellClass}>
                  <span className="text-sm">{log.entity_type}</span>
                  {log.entity_id ? (
                    <span className="ml-1 font-mono text-xs text-neutral-text-secondary">#{log.entity_id}</span>
                  ) : null}
                </td>
                <td className={`${tableCellClass} max-w-48`}>
                  {log.details ? (
                    <span className="block truncate text-xs text-neutral-text-secondary" title={JSON.stringify(log.details)}>
                      {JSON.stringify(log.details)}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}

            {!auditQuery.isLoading && logs.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={5}>
                  <ScrollText aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
                  Sin registros de auditoria.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
        <span>
          Pagina {auditQuery.data?.page ?? page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button disabled={page <= 1 || auditQuery.isFetching} onClick={() => setPage((v) => v - 1)} variant="secondary">
            Anterior
          </Button>
          <Button disabled={page >= totalPages || auditQuery.isFetching} onClick={() => setPage((v) => v + 1)} variant="secondary">
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Backups Tab ───────────────────────────────────────────────────

function BackupsTab() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: listBackups,
  });

  const createMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["backups"] });
      setConfirmDelete(null);
    },
  });

  const backups: BackupEntry[] = backupsQuery.data ?? [];

  const createError = createMutation.error
    ? createMutation.error instanceof AxiosError
      ? createMutation.error.response?.data?.error ?? "No se pudo crear el backup."
      : "No se pudo crear el backup."
    : "";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-text-secondary">
          Respaldos de la base de datos. Los backups se almacenan localmente.
        </p>
        <Button
          disabled={createMutation.isPending}
          icon={<Download aria-hidden="true" size={17} />}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? "Creando..." : "Crear backup"}
        </Button>
      </div>

      {createError ? (
        <Toast tone="danger">{createError}</Toast>
      ) : null}

      {createMutation.isSuccess ? (
        <Toast tone="success">Backup creado correctamente.</Toast>
      ) : null}

      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <th className={tableHeadClass}>Archivo</th>
              <th className={`${tableHeadClass} text-right`}>Tamano</th>
              <th className={tableHeadClass}>Fecha</th>
              <th className={tableHeadClass}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={backup.filename}>
                <td className={tableCellClass}>
                  <div className="flex items-center gap-2">
                    <HardDrive aria-hidden="true" className="shrink-0 text-neutral-text-secondary" size={16} />
                    <span className="font-mono text-sm">{backup.filename}</span>
                  </div>
                </td>
                <td className={`${tableCellClass} text-right font-mono text-sm`}>
                  {formatBytes(backup.size)}
                </td>
                <td className={`${tableCellClass} text-sm text-neutral-text-secondary`}>
                  {new Date(backup.created_at).toLocaleString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className={tableCellClass}>
                  <Button
                    aria-label={`Eliminar ${backup.filename}`}
                    className="h-11 w-11 px-0"
                    onClick={() => setConfirmDelete(backup.filename)}
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </Button>
                </td>
              </tr>
            ))}

            {!backupsQuery.isLoading && backups.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={4}>
                  <Database aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
                  Sin backups. Crea el primero.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
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
          title="Eliminar backup"
        >
          <p className="text-sm text-neutral-text-secondary">
            Estas seguro de eliminar el backup <span className="font-mono font-semibold">{confirmDelete}</span>?
            Esta accion no se puede deshacer.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
