import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Save } from "lucide-react";
import { toast } from "sonner";

import type { ConfigMap } from "../../api/config";
import { getConfig, updateConfig } from "../../api/config";
import { qk } from "../../api/query-keys";
import { Button, Card, ErrorState, Input, Modal, Skeleton } from "../../components/ui";
import { useServerStatus } from "../../hooks/useServerStatus";
import { queryClient as globalQueryClient } from "../../lib/query-client";
import { usePosStore } from "../../stores/pos-store";
import { TicketPreview } from "./ticket-preview";

type FieldDef = { key: string; label: string; placeholder: string; wide?: boolean };
type GroupDef = { title: string; description: string; fields: FieldDef[] };

const GROUPS: GroupDef[] = [
  {
    title: "Datos del negocio",
    description: "Aparecen en el encabezado de cada ticket.",
    fields: [
      { key: "company_name", label: "Nombre de la empresa", placeholder: "Mi Negocio", wide: true },
      { key: "company_address", label: "Dirección", placeholder: "Calle 123, Col. Centro", wide: true },
      { key: "company_phone", label: "Teléfono", placeholder: "(123) 456-7890" },
      { key: "company_rfc", label: "RFC", placeholder: "XAXX010101000" },
    ],
  },
  {
    title: "Ventas",
    description: "Valores por defecto para nuevos productos y tickets.",
    fields: [
      { key: "default_tax_rate", label: "IVA por defecto (%)", placeholder: "16.00" },
      { key: "ticket_footer", label: "Pie de ticket", placeholder: "Gracias por su compra" },
    ],
  },
];

/** Limpia el estado local de la terminal (no la cola offline ni el login) y recarga. */
function restartTerminal() {
  usePosStore.getState().clearSession();
  globalQueryClient.clear();
  window.location.reload();
}

export function GeneralTab() {
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
      toast.success("Configuración guardada correctamente.");
    },
    // El servidor valida cada clave (RF-06): se muestra qué campo y por qué
    onError: (error) => {
      const data = error instanceof AxiosError ? error.response?.data : undefined;
      const details = data?.details as Record<string, string[]> | undefined;
      const first = details ? Object.entries(details)[0] : undefined;
      const label = first ? (GROUPS.flatMap((g) => g.fields).find((f) => f.key === first[0])?.label ?? first[0]) : null;
      toast.error(first ? `${label}: ${first[1][0]}` : (data?.error ?? "No se pudo guardar la configuración."));
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

  if (configQuery.isLoading) {
    return (
      <Card className="p-4" data-testid="config-loading">
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
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-6">
        <form className="grid min-w-0 flex-[1_1_34rem] gap-6" onSubmit={handleSubmit}>
          {GROUPS.map((group) => (
            <Card frame key={group.title}>
              <header className="border-b border-divider px-4 py-3">
                <h2 className="text-xl">{group.title}</h2>
                <p className="text-sm text-ink-2">{group.description}</p>
              </header>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div className={field.wide ? "sm:col-span-2" : undefined} key={field.key}>
                    <Input
                      label={field.label}
                      name={field.key}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      value={formData[field.key] ?? ""}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {errorMessage ? (
            <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={updateMutation.isPending} frame icon={<Save aria-hidden="true" size={17} />} type="submit">
              {updateMutation.isPending ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
        </form>

        <div className="min-w-0 flex-[1_1_20rem] lg:sticky lg:top-5 lg:max-w-md">
          <TicketPreview config={formData} />
        </div>
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-lg">Estado del sistema</h3>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-2">Red</dt>
            <dd className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${serverOnline ? "bg-ok" : "bg-bad"}`} />
              <span className="font-medium">{serverOnline ? "En línea" : "Sin conexión con el servidor"}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-2">Versión</dt>
            <dd className="font-mono text-xs">v{import.meta.env.VITE_APP_VERSION}</dd>
          </div>
        </dl>
      </Card>

      <Card className="border-bad p-4">
        <h3 className="mb-2 text-lg text-bad">Zona de peligro</h3>
        <p className="mb-3 text-sm text-ink-2">
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
          <p className="text-sm text-ink-2">
            Se vaciará el carrito actual y se recargará la aplicación. Tu sesión de usuario y las ventas pendientes de
            sincronizar no se borran.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
