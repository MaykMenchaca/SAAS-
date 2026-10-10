import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  Printer,
  Save,
  ScrollText,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { AuditLog } from "../api/audit";
import { listAuditLogs } from "../api/audit";
import type { BackupEntry, ConfigMap } from "../api/config";
import { createBackup, deleteBackup, getConfig, listBackups, updateConfig, verifyBackup } from "../api/config";
import type { CashRegisterInfo } from "../api/sales";
import { createAgentKey, listCashRegisters, updateCashRegister } from "../api/sales";
import { useServerStatus } from "../hooks/useServerStatus";
import { queryClient } from "../lib/query-client";
import { usePosStore } from "../stores/pos-store";
import { Badge, Button, Card, ErrorState, Input, Modal, Pagination, Select, Skeleton, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";
import { qk } from "../api/query-keys";

// ── Helpers ────────────────────────────────────────────────────────

type Tab = "general" | "cajas" | "auditoria" | "backups";

const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "cajas", label: "Cajas", icon: Printer },
  { id: "auditoria", label: "Auditoría", icon: ScrollText },
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
          <h1 className="text-2xl font-bold text-neutral-text-primary">Configuración</h1>
          <p className="text-sm text-neutral-text-secondary">Ajustes del sistema, auditoría y respaldos</p>
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
      {activeTab === "cajas" ? <CashRegistersTab /> : null}
      {activeTab === "auditoria" ? <AuditTab /> : null}
      {activeTab === "backups" ? <BackupsTab /> : null}
    </div>
  );
}

// ── General Tab ───────────────────────────────────────────────────

function GeneralTab() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ConfigMap>({});
  const serverOnline = useServerStatus();
  const [confirmRestart, setConfirmRestart] = useState(false);

  const configQuery = useQuery({
    queryKey: qk.systemConfig(),
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
      await queryClient.invalidateQueries({ queryKey: qk.systemConfig() });
      toast.success("Configuracion guardada correctamente.");
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
    { key: "company_address", label: "Dirección", placeholder: "Calle 123, Col. Centro" },
    { key: "company_phone", label: "Teléfono", placeholder: "(123) 456-7890" },
    { key: "company_rfc", label: "RFC", placeholder: "XAXX010101000" },
    { key: "default_tax_rate", label: "IVA por defecto (%)", placeholder: "16.00" },
    { key: "ticket_footer", label: "Pie de ticket", placeholder: "Gracias por su compra" },
  ];

  if (configQuery.isLoading) {
    return (
      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="grid gap-1.5" key={i}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (configQuery.isError) {
    return <ErrorState onRetry={() => void configQuery.refetch()} />;
  }

  return (
    <div className="grid gap-4">
      <Card className="p-4">
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
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
              {errorMessage}
            </div>
          ) : null}

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
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-neutral-text-primary mb-3">Estado del sistema</h3>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-neutral-text-secondary">Red</dt>
            <dd className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${serverOnline ? "bg-success" : "bg-danger"}`} />
              <span className="font-medium">{serverOnline ? "En línea" : "Sin conexión con el servidor"}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-neutral-text-secondary">Versión</dt>
            <dd className="font-mono text-xs">v{import.meta.env.VITE_APP_VERSION}</dd>
          </div>
        </dl>
      </Card>

      <Card className="border-danger/30 bg-danger/5 p-4">
        <h3 className="text-sm font-semibold text-danger mb-2">Zona de peligro</h3>
        <p className="mb-3 text-sm text-neutral-text-secondary">
          Reiniciar la terminal vacía el carrito, la caja seleccionada y la caché de datos, y recarga la aplicación.
          Las ventas pendientes de sincronizar se conservan.
        </p>
        <Button onClick={() => setConfirmRestart(true)} variant="danger">
          Reiniciar terminal
        </Button>
      </Card>

      {confirmRestart ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmRestart(false)} variant="secondary">
                Cancelar
              </Button>
              <Button onClick={restartTerminal} variant="danger">
                Reiniciar
              </Button>
            </>
          }
          onClose={() => setConfirmRestart(false)}
          open
          title="¿Reiniciar la terminal?"
        >
          <p className="text-sm text-neutral-text-secondary">
            Se vaciará el carrito actual y se recargará la aplicación. Tu sesión de usuario y las ventas pendientes de
            sincronizar no se borran.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

/** Limpia el estado local de la terminal (no la cola offline ni el login) y recarga. */
function restartTerminal() {
  usePosStore.getState().clearSession();
  queryClient.clear();
  window.location.reload();
}

// ── Cash Registers Tab ────────────────────────────────────────────

const codepageOptions = [
  { value: "cp850", label: "CP850 (Latinoamérica, recomendado)" },
  { value: "cp858", label: "CP858 (CP850 con €)" },
  { value: "cp437", label: "CP437 (EE. UU.)" },
  { value: "cp1252", label: "Windows-1252" },
];

function CashRegistersTab() {
  const registersQuery = useQuery({
    queryKey: qk.cashRegisters(),
    queryFn: listCashRegisters,
    // Estado del agente de impresión casi en tiempo real
    refetchInterval: 10_000,
  });

  if (registersQuery.isLoading) {
    return <SkeletonTable rows={3} cols={3} />;
  }

  if (registersQuery.isError) {
    return <ErrorState onRetry={() => void registersQuery.refetch()} />;
  }

  const registers = registersQuery.data ?? [];

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-semibold text-neutral-text-primary">Impresora de tickets por caja</h3>
        <p className="text-sm text-neutral-text-secondary">
          Ruta absoluta del dispositivo o puerto (por ejemplo <span className="font-mono">COM3</span>). El cajón se abre
          automáticamente al cobrar en efectivo.
        </p>
      </Card>
      {registers.length === 0 ? (
        <Card className="p-4 text-sm text-neutral-text-secondary">No hay cajas registradas.</Card>
      ) : (
        registers.map((register) => <CashRegisterPrinterForm key={register.id} register={register} />)
      )}
    </div>
  );
}

function agentStatus(register: CashRegisterInfo): { label: string; tone: "success" | "warning" | "neutral" } {
  if (!register.agent_configured) return { label: "Sin clave generada", tone: "neutral" };
  if (!register.agent_last_seen_at) return { label: "Nunca se ha conectado", tone: "warning" };
  const seconds = (Date.now() - new Date(register.agent_last_seen_at).getTime()) / 1000;
  if (seconds < 15) return { label: "Agente conectado", tone: "success" };
  const when = new Date(register.agent_last_seen_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  return { label: `Sin conexión desde ${when}`, tone: "warning" };
}

function CashRegisterPrinterForm({ register }: { register: CashRegisterInfo }) {
  const queryClient = useQueryClient();
  const [printerPath, setPrinterPath] = useState(register.printer_path ?? "");
  const [codepage, setCodepage] = useState(register.printer_codepage || "cp850");
  const [viaAgent, setViaAgent] = useState(register.print_via_agent);
  const [confirmNewKey, setConfirmNewKey] = useState(false);
  const [agentKey, setAgentKey] = useState<string | null>(null);

  function apiError(error: unknown, fallback: string) {
    return error instanceof AxiosError ? error.response?.data?.error ?? fallback : fallback;
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCashRegister(register.id, {
        printer_path: viaAgent ? register.printer_path : printerPath.trim() || null,
        printer_codepage: codepage,
        print_via_agent: viaAgent,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.cashRegisters() });
      toast.success(`Impresora de ${register.name} guardada.`);
    },
    onError: (error) => toast.error(apiError(error, "No se pudo guardar.")),
  });

  const keyMutation = useMutation({
    mutationFn: () => createAgentKey(register.id),
    onSuccess: async (data) => {
      setConfirmNewKey(false);
      setAgentKey(data.agent_key);
      await queryClient.invalidateQueries({ queryKey: qk.cashRegisters() });
    },
    onError: (error) => toast.error(apiError(error, "No se pudo generar la clave.")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  const status = agentStatus(register);
  const serverUrl = window.location.origin;

  return (
    <Card className="p-4">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold text-neutral-text-primary">{register.name}</h4>
          {register.print_via_agent ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Conexión de la impresora"
            name={`printer_mode_${register.id}`}
            onChange={(e) => setViaAgent(e.target.value === "agente")}
            options={[
              { value: "servidor", label: "Conectada al servidor" },
              { value: "agente", label: "USB en esta caja (agente de impresión)" },
            ]}
            value={viaAgent ? "agente" : "servidor"}
          />
          <Select
            label="Página de códigos"
            name={`printer_codepage_${register.id}`}
            onChange={(e) => setCodepage(e.target.value)}
            options={codepageOptions}
            value={codepage}
          />
          {!viaAgent ? (
            <Input
              label="Impresora en el servidor"
              name={`printer_path_${register.id}`}
              onChange={(e) => setPrinterPath(e.target.value)}
              placeholder="COM3"
              value={printerPath}
            />
          ) : null}
        </div>
        {viaAgent ? (
          <p className="text-sm text-neutral-text-secondary">
            La caja imprime con su propia impresora USB mediante el agente de impresión. Genera una clave e instala el
            agente en esa caja con <span className="font-mono">tools\print-agent\install-agent.ps1</span>.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {register.print_via_agent ? (
            <Button disabled={keyMutation.isPending} onClick={() => setConfirmNewKey(true)} variant="secondary">
              {register.agent_configured ? "Generar nueva clave" : "Generar clave del agente"}
            </Button>
          ) : null}
          <Button disabled={saveMutation.isPending} icon={<Save aria-hidden="true" size={17} />} type="submit">
            {saveMutation.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>

      {confirmNewKey ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmNewKey(false)} variant="secondary">
                Cancelar
              </Button>
              <Button disabled={keyMutation.isPending} onClick={() => keyMutation.mutate()}>
                {keyMutation.isPending ? "Generando..." : "Generar clave"}
              </Button>
            </>
          }
          onClose={() => setConfirmNewKey(false)}
          open
          title={`Clave del agente · ${register.name}`}
        >
          <p className="text-sm text-neutral-text-secondary">
            {register.agent_configured
              ? "La clave anterior dejará de funcionar y el agente de esta caja no imprimirá hasta que lo reconfigures."
              : "Se generará la clave con la que el agente de esta caja se conecta al servidor."}
          </p>
        </Modal>
      ) : null}

      {agentKey ? (
        <Modal
          footer={
            <>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(agentKey).then(() => toast.success("Clave copiada."));
                }}
                variant="secondary"
              >
                Copiar clave
              </Button>
              <Button onClick={() => setAgentKey(null)}>Listo</Button>
            </>
          }
          onClose={() => setAgentKey(null)}
          open
          size="lg"
          title="Clave del agente generada"
        >
          <div className="grid gap-3 text-sm">
            <p className="font-semibold text-warning">Cópiala ahora: no se volverá a mostrar.</p>
            <code className="break-all rounded-md border border-neutral-border bg-neutral-bg p-3 font-mono text-sm">{agentKey}</code>
            <p className="text-neutral-text-secondary">En la caja, en PowerShell como administrador:</p>
            <code className="break-all rounded-md border border-neutral-border bg-neutral-bg p-3 font-mono text-xs">
              {`.\\install-agent.ps1 -ServerUrl ${serverUrl} -AgentKey "<clave>" -PrinterName "<nombre de la impresora>"`}
            </code>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

// ── Audit Tab ─────────────────────────────────────────────────────

function AuditTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const auditQuery = useQuery({
    queryKey: qk.auditLogs(page, actionFilter, entityFilter),
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

  if (auditQuery.isLoading) {
    return <SkeletonTable rows={8} cols={5} />;
  }

  if (auditQuery.isError) {
    return <ErrorState onRetry={() => void auditQuery.refetch()} />;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="Accion"
          name="action-filter"
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "login", label: "Login" },
            { value: "create", label: "Crear" },
            { value: "update", label: "Actualizar" },
            { value: "delete", label: "Eliminar" },
            { value: "cancel", label: "Cancelar" },
          ]}
          placeholder="Todas"
          value={actionFilter}
        />
        <Select
          label="Entidad"
          name="entity-filter"
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "sale", label: "Venta" },
            { value: "product", label: "Producto" },
            { value: "user", label: "Usuario" },
            { value: "inventory", label: "Inventario" },
            { value: "purchase_order", label: "Orden de compra" },
            { value: "backup", label: "Backup" },
            { value: "config", label: "Configuracion" },
          ]}
          placeholder="Todas"
          value={entityFilter}
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <caption className="sr-only">Tabla de auditoria</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>Fecha</th>
              <th className={tableHeadClass}>Usuario</th>
              <th className={tableHeadClass}>Acción</th>
              <th className={tableHeadClass}>Entidad</th>
              <th className={tableHeadClass}>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: AuditLog) => (
              <tr className={tableRowClass} key={log.id}>
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
                  Sin registros de auditoría.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
        <span>Página {auditQuery.data?.page ?? page} de {totalPages}</span>
        <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
      </div>
    </div>
  );
}

// ── Backups Tab ───────────────────────────────────────────────────

function BackupsTab() {
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
      toast.success("Backup creado correctamente.");
    },
    onError: (err) => {
      const msg = err instanceof AxiosError ? err.response?.data?.error ?? "No se pudo crear el backup." : "No se pudo crear el backup.";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.backups() });
      setConfirmDelete(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyBackup,
    onSuccess: (result) => {
      toast.success(`Backup verificado: ${result.filename} (${result.entries} entradas).`);
    },
    onError: () => {
      toast.error("No se pudo verificar el backup.");
    },
  });

  const backups: BackupEntry[] = backupsQuery.data ?? [];

  if (backupsQuery.isLoading) {
    return <SkeletonTable rows={4} cols={4} />;
  }

  if (backupsQuery.isError) {
    return <ErrorState onRetry={() => void backupsQuery.refetch()} />;
  }

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

      <Card className="overflow-hidden">
        <Table>
          <caption className="sr-only">Tabla de respaldos</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>Archivo</th>
              <th className={`${tableHeadClass} text-right`}>Tamaño</th>
              <th className={tableHeadClass}>Fecha</th>
              <th className={tableHeadClass}>Acciónes</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr className={tableRowClass} key={backup.filename}>
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
                  <div className="flex gap-2">
                    <Tooltip content="Verificar">
                      <Button
                        aria-label={`Verificar ${backup.filename}`}
                        className="h-11 w-11 px-0"
                        disabled={verifyMutation.isPending}
                        onClick={() => {
                          verifyMutation.mutate(backup.filename);
                        }}
                        variant="secondary"
                      >
                        <CheckCircle2 aria-hidden="true" size={17} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Eliminar">
                      <Button
                        aria-label={`Eliminar ${backup.filename}`}
                        className="h-11 w-11 px-0"
                        onClick={() => setConfirmDelete(backup.filename)}
                        variant="danger"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </Button>
                    </Tooltip>
                  </div>
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
            Esta acción no se puede deshacer.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
