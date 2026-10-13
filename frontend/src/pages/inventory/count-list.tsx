import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ClipboardList } from "lucide-react";

import type { InventoryCountListItem } from "../../api/inventory";
import { createInventoryCount, listInventoryCounts } from "../../api/inventory";
import { qk } from "../../api/query-keys";
import { Badge, Button, EmptyState, ErrorState, Modal, Pagination, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { countFolio } from "./stock-level";
import { textareaClass } from "./styles";

const STATUS_LABELS: Record<string, string> = {
  pendiente: "En curso",
  en_proceso: "En curso",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

export function countStatusTone(status: string): "accent" | "success" | "neutral" {
  if (status === "pendiente" || status === "en_proceso") return "accent";
  return status === "cerrado" ? "success" : "neutral";
}

export function countStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function formatCountDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type CountListProps = {
  /** Se enciende desde el encabezado de la página para abrir el diálogo de nuevo conteo. */
  creating: boolean;
  onCloseCreate: () => void;
  onOpenCount: (id: number) => void;
  onStartCreate: () => void;
};

/** Lista de conteos físicos: el conteo en curso destacado y los anteriores con su folio CF-. */
export function CountList({ creating, onCloseCreate, onOpenCount, onStartCreate }: CountListProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const countsQuery = useQuery({
    queryKey: qk.inventoryCounts(page),
    queryFn: () => listInventoryCounts(page),
  });

  const counts = countsQuery.data?.items ?? [];
  const totalPages = countsQuery.data?.pages ?? 1;

  const createMutation = useMutation({
    mutationFn: (notes?: string) => createInventoryCount(notes),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.inventoryCounts() });
      onCloseCreate();
      onOpenCount(data.id);
    },
  });

  const createError =
    createMutation.error instanceof AxiosError
      ? createMutation.error.response?.data?.error ?? "Error al crear conteo"
      : createMutation.error
        ? "Error al crear conteo"
        : "";

  if (countsQuery.isError) {
    return <ErrorState message="No se pudieron cargar los conteos." onRetry={() => void countsQuery.refetch()} />;
  }

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl">Conteos</h2>

      {countsQuery.isLoading ? (
        <SkeletonTable cols={6} rows={4} />
      ) : counts.length === 0 ? (
        <div className="border border-divider">
          <EmptyState
            actionLabel="Iniciar primer conteo"
            icon={<ClipboardList aria-hidden="true" size={36} />}
            message="No hay conteos registrados."
            onAction={onStartCreate}
          />
        </div>
      ) : (
        <Table>
          <caption className="sr-only">Tabla de conteos de inventario</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>Folio</th>
              <th className={tableHeadClass}>Nombre</th>
              <th className={tableHeadClass}>Usuario</th>
              <th className={tableHeadClass}>Estado</th>
              <th className={cn(tableHeadClass, "min-w-32")}>Avance</th>
              <th className={tableHeadClass}>Fecha</th>
              <th className={tableHeadClass}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c: InventoryCountListItem) => {
              const active = c.status === "pendiente" || c.status === "en_proceso";
              const pct = c.total_items > 0 ? Math.round((c.counted_items / c.total_items) * 100) : 0;
              return (
                <tr className={cn(tableRowClass, active && "bg-acc-tint")} key={c.id}>
                  <td className={cn(tableCellClass, "whitespace-nowrap font-medium tabular-nums")}>{countFolio(c.id)}</td>
                  <td className={cn(tableCellClass, "min-w-40")}>{c.notes || "Sin nombre"}</td>
                  <td className={tableCellClass}>{c.username}</td>
                  <td className={tableCellClass}>
                    <Badge tone={countStatusTone(c.status)}>{countStatusLabel(c.status)}</Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="h-2 bg-line-soft">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className={cn("mt-1 block text-xs text-ink-2", tableNumClass, "text-left")}>
                      {c.counted_items}/{c.total_items}
                    </span>
                  </td>
                  <td className={cn(tableCellClass, "whitespace-nowrap text-xs text-ink-2")}>{formatCountDate(c.created_at)}</td>
                  <td className={tableCellClass}>
                    <Button className="min-h-11 px-3 text-sm lg:min-h-9" onClick={() => onOpenCount(c.id)} variant={active ? "primary" : "secondary"}>
                      {active ? "Continuar" : "Ver arqueo"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
          <span>
            Página {countsQuery.data?.page ?? page} de {totalPages}
          </span>
          <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
        </div>
      ) : null}

      {creating ? <CreateCountModal error={createError} isLoading={createMutation.isPending} onClose={onCloseCreate} onConfirm={(notes) => createMutation.mutate(notes)} /> : null}
    </div>
  );
}

function CreateCountModal({
  error,
  isLoading,
  onClose,
  onConfirm,
}: {
  error: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: (notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onConfirm(notes.trim() || undefined);
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={isLoading} onClick={() => onConfirm(notes.trim() || undefined)}>
            {isLoading ? "Creando..." : "Iniciar conteo"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Nuevo conteo físico"
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <p className="text-sm text-ink-2">
          Se creará un conteo con todos los productos activos. El stock esperado se capturará al momento de crear el conteo.
        </p>
        <label className="grid gap-1.5 text-sm font-medium text-ink-2">
          <span>Nombre o notas (opcional)</span>
          <textarea className={textareaClass} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: Conteo mensual octubre 2026" value={notes} />
        </label>
        {error ? (
          <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
