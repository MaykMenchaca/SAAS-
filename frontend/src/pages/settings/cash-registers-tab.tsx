import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { qk } from "../../api/query-keys";
import type { CashRegisterInfo } from "../../api/sales";
import { createAgentKey, createCashRegister, listCashRegisters, updateCashRegister } from "../../api/sales";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Select, SkeletonTable } from "../../components/ui";

const codepageOptions = [
  { value: "cp850", label: "CP850 (Latinoamérica, recomendado)" },
  { value: "cp858", label: "CP858 (CP850 con €)" },
  { value: "cp437", label: "CP437 (EE. UU.)" },
  { value: "cp1252", label: "Windows-1252" },
];

export function CashRegistersTab() {
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
      <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="mb-1 text-lg">Cajas e impresora de tickets</h2>
          <p className="text-sm text-ink-2">
            Ruta absoluta del dispositivo o puerto (por ejemplo <span className="font-mono">COM3</span>). El cajón se abre
            automáticamente al cobrar en efectivo.
          </p>
        </div>
        <NewRegisterButton />
      </Card>
      {registers.length === 0 ? (
        <Card><EmptyState message="No hay cajas registradas." /></Card>
      ) : (
        registers.map((register) => <CashRegisterPrinterForm key={register.id} register={register} />)
      )}
    </div>
  );
}

/** Alta de una caja registradora: cada equipo de cobro necesita la suya para abrir turno (RF-09). */
function NewRegisterButton() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => createCashRegister(name.trim()),
    onSuccess: async (register) => {
      await queryClient.invalidateQueries({ queryKey: qk.cashRegisters() });
      toast.success(`Caja «${register.name}» creada.`);
      setOpen(false);
      setName("");
    },
    onError: (err) => {
      setError(err instanceof AxiosError ? (err.response?.data?.error ?? "No se pudo crear la caja.") : "No se pudo crear la caja.");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Escribe el nombre de la caja.");
      return;
    }
    mutation.mutate();
  }

  return (
    <>
      <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => setOpen(true)} variant="secondary">
        Nueva caja
      </Button>
      <Modal
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="secondary">Cancelar</Button>
            <Button disabled={mutation.isPending} form="new-register-form" type="submit">
              {mutation.isPending ? "Creando..." : "Crear caja"}
            </Button>
          </>
        }
        onClose={() => setOpen(false)}
        open={open}
        title="Nueva caja registradora"
      >
        <form className="grid gap-3" id="new-register-form" onSubmit={submit}>
          <Input
            autoFocus
            error={error || undefined}
            label="Nombre de la caja"
            maxLength={50}
            onChange={(event) => setName(event.target.value)}
            placeholder="Caja 2"
            value={name}
          />
          <p className="text-sm text-ink-2">Después podrás configurar su impresora y su agente de impresión aquí mismo.</p>
        </form>
      </Modal>
    </>
  );
}

/** Copia al portapapeles; en http://<ip> no existe navigator.clipboard, así que se usa un respaldo (OPS-22). */
async function copyText(text: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      if (!ok) throw new Error("copy");
    }
    toast.success("Clave copiada.");
  } catch {
    toast.error("No se pudo copiar. Selecciona la clave y cópiala manualmente.");
  }
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
          <h3 className="text-lg">{register.name}</h3>
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
          <p className="text-sm text-ink-2">
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
          <p className="text-sm text-ink-2">
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
                onClick={() => void copyText(agentKey)}
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
            <p className="font-semibold text-warn">Cópiala ahora: no se volverá a mostrar.</p>
            <code className="select-all break-all border border-divider bg-bg p-3 font-mono text-sm">{agentKey}</code>
            <p className="text-ink-2">En la caja, en PowerShell como administrador (el script pedirá la clave sin mostrarla):</p>
            <code className="break-all border border-divider bg-bg p-3 font-mono text-xs">
              {`.\\install-agent.ps1 -ServerUrl ${serverUrl} -PrinterName "<nombre de la impresora>"`}
            </code>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
