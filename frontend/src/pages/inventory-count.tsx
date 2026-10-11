import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Minus,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { InventoryCountItem, InventoryCountListItem } from "../api/inventory";
import {
  cancelInventoryCount,
  captureCountItem,
  closeInventoryCount,
  createInventoryCount,
  getInventoryCount,
  listInventoryCounts,
} from "../api/inventory";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Pagination, SkeletonTable, Table, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";
import { qk } from "../api/query-keys";
import { invalidateInventory } from "../api/invalidate";

// ── Main Page ──────────────────────────────────────────────────────

export function InventoryCountPage() {
  const [activeCountId, setActiveCountId] = useState<number | null>(null);

  if (activeCountId) {
    return <CountSession countId={activeCountId} onBack={() => setActiveCountId(null)} />;
  }

  return <CountList onOpenCount={setActiveCountId} />;
}

// ── Count List ─────────────────────────────────────────────────────

function CountList({ onOpenCount }: { onOpenCount: (id: number) => void }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

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
      setShowCreate(false);
      onOpenCount(data.id);
    },
  });

  const statusLabels: Record<string, string> = {
    pendiente: "Pendiente",
    en_proceso: "En proceso",
    cerrado: "Cerrado",
    cancelado: "Cancelado",
  };

  function statusTone(status: string): "warning" | "neutral" | "success" | "danger" {
    if (status === "pendiente") return "warning";
    if (status === "en_proceso") return "neutral";
    if (status === "cerrado") return "success";
    return "danger";
  }

  if (countsQuery.isError) {
    return (
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link className="text-neutral-text-secondary hover:text-primary-text" to="/inventario">
                <ArrowLeft size={20} />
              </Link>
              <h1 className="text-2xl font-bold text-neutral-text-primary">Conteos Físicos</h1>
            </div>
          </div>
        </div>
        <Card className="p-6">
          <ErrorState message="No se pudieron cargar los conteos." onRetry={() => void countsQuery.refetch()} />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link className="text-neutral-text-secondary hover:text-primary-text" to="/inventario">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-neutral-text-primary">Conteos Físicos</h1>
          </div>
          <p className="mt-0.5 text-sm text-neutral-text-secondary">
            Conteo de inventario físico con ajuste automático
          </p>
        </div>
        <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowCreate(true)}>
          Nuevo conteo
        </Button>
      </div>

      <Card className="overflow-hidden">
        {countsQuery.isLoading ? (
          <SkeletonTable cols={6} rows={4} />
        ) : counts.length === 0 ? (
          <EmptyState
            actionLabel="Iniciar primer conteo"
            icon={<ClipboardList aria-hidden="true" size={36} />}
            message="No hay conteos registrados."
            onAction={() => setShowCreate(true)}
          />
        ) : (
        <Table>
          <caption className="sr-only">Tabla de conteos de inventario</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>#</th>
              <th className={tableHeadClass}>Usuario</th>
              <th className={tableHeadClass}>Estado</th>
              <th className={tableHeadClass}>Progreso</th>
              <th className={tableHeadClass}>Fecha</th>
              <th className={tableHeadClass}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c: InventoryCountListItem) => (
              <tr className={tableRowClass} key={c.id}>
                <td className={`${tableCellClass} font-mono`}>{c.id}</td>
                <td className={tableCellClass}>{c.username}</td>
                <td className={tableCellClass}>
                  <Badge dot tone={statusTone(c.status)}>{statusLabels[c.status] ?? c.status}</Badge>
                </td>
                <td className={tableCellClass}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-neutral-border">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-[var(--ease-out-strong)]"
                        style={{
                          width: c.total_items > 0 ? `${(c.counted_items / c.total_items) * 100}%` : "0%",
                        }}
                      />
                    </div>
                    <span className="text-xs text-neutral-text-secondary">
                      {c.counted_items}/{c.total_items}
                    </span>
                  </div>
                </td>
                <td className={`${tableCellClass} text-xs text-neutral-text-secondary`}>
                  {new Date(c.created_at).toLocaleString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className={tableCellClass}>
                  <Button onClick={() => onOpenCount(c.id)} className="text-xs px-3 min-h-9" variant="secondary">
                    {c.status === "pendiente" || c.status === "en_proceso" ? "Continuar" : "Ver"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
          <span>Página {countsQuery.data?.page ?? page} de {totalPages}</span>
          <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
        </div>
      ) : null}

      {/* Create Modal */}
      {showCreate ? (
        <CreateCountModal
          error={
            createMutation.error instanceof AxiosError
              ? createMutation.error.response?.data?.error
              : createMutation.error
                ? "Error al crear conteo"
                : ""
          }
          isLoading={createMutation.isPending}
          onClose={() => setShowCreate(false)}
          onConfirm={(notes) => createMutation.mutate(notes)}
        />
      ) : null}
    </div>
  );
}

// ── Create Count Modal ─────────────────────────────────────────────

function CreateCountModal({
  onClose,
  onConfirm,
  isLoading,
  error,
}: {
  onClose: () => void;
  onConfirm: (notes?: string) => void;
  isLoading: boolean;
  error: string;
}) {
  const [notes, setNotes] = useState("");

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
      <div className="grid gap-4">
        <p className="text-sm text-neutral-text-secondary">
          Se creará un conteo con todos los productos activos. El stock esperado se capturará al momento de crear el
          conteo.
        </p>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Notas (opcional)</span>
          <textarea
            className="min-h-20 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Conteo mensual junio 2026"
            value={notes}
          />
        </label>
        {error ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Count Session ──────────────────────────────────────────────────

function CountSession({ countId, onBack }: { countId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [captureProduct, setCaptureProduct] = useState<InventoryCountItem | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const countQuery = useQuery({
    queryKey: qk.inventoryCount(countId),
    queryFn: () => getInventoryCount(countId),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeInventoryCount(countId),
    onSuccess: () => {
      // Cerrar el conteo ajusta existencias: refrescar todo lo que depende del stock (H-29)
      void invalidateInventory(queryClient);
      setShowConfirmClose(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelInventoryCount(countId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.inventoryCount(countId) });
      void queryClient.invalidateQueries({ queryKey: qk.inventoryCounts() });
      setShowConfirmCancel(false);
    },
  });

  const count = countQuery.data;

  if (countQuery.isError) {
    return (
      <div className="grid gap-5">
        <div className="flex items-center gap-2">
          <button className="text-neutral-text-secondary hover:text-primary-text" onClick={onBack} type="button">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Conteo</h1>
        </div>
        <Card className="p-6">
          <ErrorState message="No se pudo cargar el conteo." onRetry={() => void countQuery.refetch()} />
        </Card>
      </div>
    );
  }

  if (!count) {
    return (
      <div className="py-12 text-center text-neutral-text-secondary">
        {countQuery.isLoading ? "Cargando conteo..." : "Conteo no encontrado"}
      </div>
    );
  }

  const isActive = count.status === "pendiente" || count.status === "en_proceso";

  // Filter items by search
  const search = searchInput.trim().toLowerCase();
  const filteredItems = count.items.filter((item) => {
    if (!search) return true;
    return (
      item.product_name.toLowerCase().includes(search) ||
      item.product_sku.toLowerCase().includes(search)
    );
  });

  // Stats
  const totalItems = count.total_items;
  const countedItems = count.counted_items;
  const itemsWithDiff = count.items.filter(
    (i) => i.difference !== null && parseFloat(i.difference) !== 0,
  ).length;

  return (
    <div className="grid gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              className="text-neutral-text-secondary hover:text-primary-text"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold text-neutral-text-primary">Conteo #{count.id}</h1>
            <Badge
              tone={
                count.status === "cerrado"
                  ? "success"
                  : count.status === "cancelado"
                    ? "danger"
                    : "neutral"
              }
            >
              {count.status === "pendiente"
                ? "Pendiente"
                : count.status === "en_proceso"
                  ? "En proceso"
                  : count.status === "cerrado"
                    ? "Cerrado"
                    : "Cancelado"}
            </Badge>
          </div>
          {count.notes ? (
            <p className="mt-0.5 text-sm text-neutral-text-secondary">{count.notes}</p>
          ) : null}
        </div>
        {isActive ? (
          <div className="flex gap-2">
            <Button
              icon={<XCircle aria-hidden="true" size={18} />}
              onClick={() => setShowConfirmCancel(true)}
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              icon={<CheckCircle2 aria-hidden="true" size={18} />}
              onClick={() => setShowConfirmClose(true)}
            >
              Cerrar conteo
            </Button>
          </div>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary-text">
            <ClipboardList size={24} />
          </div>
          <div>
            <div className="text-sm text-neutral-text-secondary">Total productos</div>
            <div className="text-xl font-bold text-neutral-text-primary">{totalItems}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-lg bg-success/10 p-2 text-success">
            <Check size={24} />
          </div>
          <div>
            <div className="text-sm text-neutral-text-secondary">Contados</div>
            <div className="text-xl font-bold text-neutral-text-primary">
              {countedItems}
              <span className="ml-1 text-sm font-normal text-neutral-text-secondary">
                ({totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0}%)
              </span>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-lg bg-warning/10 p-2 text-warning">
            <Minus size={24} />
          </div>
          <div>
            <div className="text-sm text-neutral-text-secondary">Con diferencia</div>
            <div className="text-xl font-bold text-neutral-text-primary">{itemsWithDiff}</div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e: FormEvent) => e.preventDefault()}
      >
        <Input
          label="Buscar producto"
          name="search"
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Nombre o SKU"
          value={searchInput}
        />
        <div className="flex items-end">
          <Button
            className="w-full sm:w-auto"
            icon={<Search aria-hidden="true" size={18} />}
            type="submit"
            variant="secondary"
          >
            Filtrar
          </Button>
        </div>
      </form>

      {/* Items Table */}
      <Card className="overflow-hidden">
        <Table>
          <caption className="sr-only">Tabla de items del conteo</caption>
          <thead>
            <tr>
              <th className={tableHeadClass}>Producto</th>
              <th className={`${tableHeadClass} text-right`}>Esperado</th>
              <th className={`${tableHeadClass} text-right`}>Contado</th>
              <th className={tableHeadClass}>Diferencia</th>
              <th className={tableHeadClass}>Estado</th>
              {isActive ? <th className={tableHeadClass}>Acción</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const diff = item.difference ? parseFloat(item.difference) : null;
              const isCounted = item.counted_quantity !== null;

              return (
                <tr className={tableRowClass} key={item.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-neutral-text-primary">{item.product_name}</div>
                    <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                  </td>
                  <td className={`${tableCellClass} text-right font-mono`}>{item.expected_quantity}</td>
                  <td className={`${tableCellClass} text-right font-mono font-semibold`}>
                    {isCounted ? item.counted_quantity : <span className="text-neutral-text-secondary">---</span>}
                  </td>
                  <td className={tableCellClass}>
                    {diff !== null ? (
                      <span
                        className={`font-mono font-semibold ${
                          diff < 0 ? "text-danger" : diff > 0 ? "text-success" : "text-neutral-text-secondary"
                        }`}
                      >
                        {diff > 0 ? "+" : ""}
                        {item.difference}
                      </span>
                    ) : (
                      <span className="text-neutral-text-secondary">---</span>
                    )}
                  </td>
                  <td className={tableCellClass}>
                    {isCounted ? (
                      diff !== null && diff !== 0 ? (
                        <Badge tone="warning">Diferencia</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">Pendiente</Badge>
                    )}
                  </td>
                  {isActive ? (
                    <td className={tableCellClass}>
                      <Button onClick={() => setCaptureProduct(item)} className="text-xs px-3 min-h-9" variant="secondary">
                        {isCounted ? "Recontar" : "Contar"}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {/* Capture Modal */}
      {captureProduct ? (
        <CaptureModal
          countId={countId}
          item={captureProduct}
          onClose={() => setCaptureProduct(null)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: qk.inventoryCount(countId) });
            setCaptureProduct(null);
          }}
        />
      ) : null}

      {/* Confirm Close Modal */}
      {showConfirmClose ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setShowConfirmClose(false)} variant="secondary">
                Cancelar
              </Button>
              <Button disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
                {closeMutation.isPending ? "Cerrando..." : "Cerrar y ajustar"}
              </Button>
            </>
          }
          onClose={() => setShowConfirmClose(false)}
          open
          title="Cerrar conteo"
        >
          <div className="grid gap-3">
            <p className="text-sm text-neutral-text-secondary">
              Al cerrar el conteo, el stock se ajustará automáticamente para los productos contados con diferencias.
            </p>
            <div className="rounded-md border border-neutral-border bg-neutral-bg px-3 py-2 text-sm">
              <span className="text-neutral-text-secondary">Productos contados: </span>
              <span className="font-semibold">{countedItems} de {totalItems}</span>
            </div>
            <div className="rounded-md border border-neutral-border bg-neutral-bg px-3 py-2 text-sm">
              <span className="text-neutral-text-secondary">Con diferencia: </span>
              <span className="font-semibold">{itemsWithDiff}</span>
            </div>
            {totalItems - countedItems > 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                {totalItems - countedItems} producto(s) sin contar no serán ajustados.
              </div>
            ) : null}
            {closeMutation.error ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
                {closeMutation.error instanceof AxiosError
                  ? closeMutation.error.response?.data?.error
                  : "Error al cerrar conteo"}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {/* Confirm Cancel Modal */}
      {showConfirmCancel ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setShowConfirmCancel(false)} variant="secondary">
                Volver
              </Button>
              <Button disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()} variant="danger">
                {cancelMutation.isPending ? "Cancelando..." : "Si, cancelar conteo"}
              </Button>
            </>
          }
          onClose={() => setShowConfirmCancel(false)}
          open
          title="Cancelar conteo"
        >
          <p className="text-sm text-neutral-text-secondary">
            Se cancelará el conteo sin aplicar ningún ajuste de stock. Esta acción no se puede deshacer.
          </p>
          {cancelMutation.error ? (
            <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
              {cancelMutation.error instanceof AxiosError
                ? cancelMutation.error.response?.data?.error
                : "Error al cancelar conteo"}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

// ── Capture Modal ──────────────────────────────────────────────────

function CaptureModal({
  countId,
  item,
  onClose,
  onSuccess,
}: {
  countId: number;
  item: InventoryCountItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState(item.counted_quantity ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => captureCountItem(countId, item.product_id, quantity, notes.trim() || undefined),
    onSuccess,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quantity) return;
    mutation.mutate();
  }

  const errorMessage = mutation.error
    ? mutation.error instanceof AxiosError
      ? mutation.error.response?.data?.error ?? "No se pudo registrar el conteo."
      : "No se pudo registrar el conteo."
    : "";

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={mutation.isPending || !quantity} form="capture-form" type="submit">
            {mutation.isPending ? "Guardando..." : "Registrar"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={`Contar — ${item.product_name}`}
    >
      <form className="grid gap-4" id="capture-form" onSubmit={handleSubmit}>
        <div className="rounded-md border border-neutral-border bg-neutral-bg px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-text-secondary">SKU:</span>
            <span className="font-mono">{item.product_sku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-text-secondary">Stock esperado:</span>
            <span className="font-mono font-semibold">{item.expected_quantity}</span>
          </div>
        </div>

        <Input
          autoFocus
          label="Cantidad contada"
          min="0"
          name="counted_quantity"
          onChange={(e) => setQuantity(e.target.value)}
          step="0.001"
          type="number"
          value={quantity}
        />

        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Notas (opcional)</span>
          <textarea
            className="min-h-16 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones del conteo..."
            value={notes}
          />
        </label>

        {quantity !== "" && item.expected_quantity ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              parseFloat(quantity) === parseFloat(item.expected_quantity)
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/30 bg-warning/10 text-warning"
            }`}
          >
            Diferencia:{" "}
            <span className="font-mono">
              {(parseFloat(quantity) - parseFloat(item.expected_quantity)).toFixed(3)}
            </span>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
