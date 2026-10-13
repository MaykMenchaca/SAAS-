import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";

import type { InventoryCountItem } from "../../api/inventory";
import { cancelInventoryCount, captureCountItem, closeInventoryCount, getInventoryCount } from "../../api/inventory";
import { invalidateInventory } from "../../api/invalidate";
import { qk } from "../../api/query-keys";
import { Badge, Button, Card, ErrorState, Input, Modal, Skeleton, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatStock } from "../../lib/formatters";
import { countStatusLabel, countStatusTone, formatCountDate } from "./count-list";
import { countFolio, formatDelta } from "./stock-level";

type CountSessionProps = { countId: number; onBack: () => void };

function errorOf(error: unknown, fallback: string) {
  return error instanceof AxiosError ? error.response?.data?.error ?? fallback : fallback;
}

/** Un conteo abierto: avance, tabla esperado / contado / diferencia, cancelar y cerrar aplicando diferencias. */
export function CountSession({ countId, onBack }: CountSessionProps) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const countQuery = useQuery({
    queryKey: qk.inventoryCount(countId),
    queryFn: () => getInventoryCount(countId),
  });

  const captureMutation = useMutation({
    mutationFn: ({ item, quantity }: { item: InventoryCountItem; quantity: string }) =>
      // Las notas ya guardadas del renglón se conservan tal cual
      captureCountItem(countId, item.product_id, quantity, item.notes ?? undefined),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.inventoryCount(countId) }),
    onError: (error) => toast.error(errorOf(error, "No se pudo registrar el conteo.")),
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

  const backButton = (
    <Button aria-label="Volver a los conteos" icon={<ArrowLeft aria-hidden="true" size={16} />} onClick={onBack} variant="secondary">
      Volver a los conteos
    </Button>
  );

  if (countQuery.isError) {
    return (
      <div className="grid gap-4">
        <div>{backButton}</div>
        <ErrorState message="No se pudo cargar el conteo." onRetry={() => void countQuery.refetch()} />
      </div>
    );
  }

  const count = countQuery.data;
  if (!count) {
    return (
      <div className="grid gap-4">
        <div>{backButton}</div>
        <Skeleton className="h-20 w-full" />
        <SkeletonTable cols={5} rows={6} />
      </div>
    );
  }

  const isActive = count.status === "pendiente" || count.status === "en_proceso";
  const search = searchInput.trim().toLowerCase();
  const filteredItems = count.items.filter(
    (item) => !search || item.product_name.toLowerCase().includes(search) || item.product_sku.toLowerCase().includes(search),
  );

  const totalItems = count.total_items;
  const countedItems = count.counted_items;
  const itemsWithDiff = count.items.filter((i) => i.difference !== null && parseFloat(i.difference) !== 0).length;
  const pct = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;

  return (
    <div className="grid gap-5">
      <div>{backButton}</div>

      <Card className="flex flex-col" frame>
        <div className="flex flex-wrap items-center gap-4 border-b border-divider px-4 py-4">
          <div className="min-w-60 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="break-words text-2xl">
                {countFolio(count.id)}
                {count.notes ? ` · ${count.notes}` : ""}
              </h2>
              <Badge tone={countStatusTone(count.status)}>{countStatusLabel(count.status)}</Badge>
            </div>
            <p className="text-sm text-ink-2">
              Iniciado por {count.username} · {formatCountDate(count.created_at)}
              {count.closed_at ? ` · Cerrado ${formatCountDate(count.closed_at)}${count.closed_by_username ? ` por ${count.closed_by_username}` : ""}` : ""}
            </p>
          </div>
          {isActive ? (
            <div className="flex flex-wrap gap-2">
              <Button className="text-bad" onClick={() => setShowConfirmCancel(true)} variant="ghost">
                Cancelar conteo
              </Button>
              <Button frame onClick={() => setShowConfirmClose(true)}>
                Cerrar y aplicar diferencias
              </Button>
            </div>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)]">
          <div className="px-4 py-3.5">
            <dt className="text-sm text-ink-2">Productos</dt>
            <dd className="font-heading text-3xl font-semibold leading-tight tabular-nums">{totalItems}</dd>
          </div>
          <div className="border-l border-divider px-4 py-3.5">
            <dt className="text-sm text-ink-2">Contados</dt>
            <dd className="font-heading text-3xl font-semibold leading-tight tabular-nums">{countedItems}</dd>
          </div>
          <div className="border-t border-divider px-4 py-3.5 lg:border-l lg:border-t-0">
            <dt className="text-sm text-ink-2">Con diferencia</dt>
            <dd className="font-heading text-3xl font-semibold leading-tight tabular-nums text-warn">{itemsWithDiff}</dd>
          </div>
          <div className="flex flex-col justify-center gap-2 border-l border-t border-divider px-4 py-3.5 lg:border-t-0">
            <div className="flex justify-between text-sm text-ink-2">
              <dt>Avance</dt>
              <dd className="font-medium tabular-nums text-text">{pct}%</dd>
            </div>
            <div aria-label={`Avance del conteo: ${pct}%`} className="h-2 bg-line-soft" role="img">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </dl>
      </Card>

      <form className="max-w-sm" onSubmit={(e) => e.preventDefault()}>
        <Input
          icon={<Search aria-hidden="true" size={16} />}
          label="Buscar producto"
          name="search"
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Nombre o SKU"
          value={searchInput}
        />
      </form>

      <Table>
        <caption className="sr-only">Tabla de productos del conteo</caption>
        <thead>
          <tr>
            <th className={tableHeadClass}>Producto</th>
            <th className={cn(tableHeadClass, tableNumClass)}>Esperado</th>
            <th className={cn(tableHeadClass, tableNumClass, "w-36")}>Contado</th>
            <th className={cn(tableHeadClass, tableNumClass)}>Diferencia</th>
            <th className={tableHeadClass}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item) => {
            const diff = item.difference !== null ? parseFloat(item.difference) : null;
            const isCounted = item.counted_quantity !== null;
            return (
              <tr className={tableRowClass} key={item.id}>
                <td className={cn(tableCellClass, "min-w-48")}>
                  <div className="font-medium">{item.product_name}</div>
                  <div className="text-xs text-ink-2">{item.product_sku}</div>
                </td>
                <td className={cn(tableCellClass, tableNumClass)}>{formatStock(item.expected_quantity)}</td>
                <td className={cn(tableCellClass, tableNumClass)}>
                  {isActive ? (
                    <CountInput
                      disabled={captureMutation.isPending && captureMutation.variables?.item.id === item.id}
                      item={item}
                      onCommit={(quantity) => captureMutation.mutate({ item, quantity })}
                    />
                  ) : isCounted ? (
                    formatStock(item.counted_quantity)
                  ) : (
                    <span className="text-ink-2">—</span>
                  )}
                </td>
                <td
                  className={cn(
                    tableCellClass,
                    tableNumClass,
                    "font-medium",
                    diff == null ? "text-ink-2" : diff < 0 ? "text-bad" : diff > 0 ? "text-warn" : "text-ink-2",
                  )}
                >
                  {diff == null ? "—" : formatDelta(diff)}
                </td>
                <td className={tableCellClass}>
                  {isCounted ? (
                    diff !== null && diff !== 0 ? <Badge tone="warning">Diferencia</Badge> : <Badge tone="success">Coincide</Badge>
                  ) : (
                    <Badge tone="neutral">Pendiente</Badge>
                  )}
                </td>
              </tr>
            );
          })}
          {filteredItems.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-ink-2" colSpan={5}>
                Ningún producto coincide con la búsqueda.
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>

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
            <p className="text-sm text-ink-2">
              Al cerrar el conteo, el stock se ajustará por diferencia para los productos contados que no coinciden.
            </p>
            <div className="border border-divider px-3 py-2 text-sm">
              <span className="text-ink-2">Productos contados: </span>
              <span className="font-semibold">
                {countedItems} de {totalItems}
              </span>
            </div>
            <div className="border border-divider px-3 py-2 text-sm">
              <span className="text-ink-2">Con diferencia: </span>
              <span className="font-semibold">{itemsWithDiff}</span>
            </div>
            {totalItems - countedItems > 0 ? (
              <div className="border border-warn bg-warn-tint px-3 py-2 text-sm text-warn">
                {totalItems - countedItems} producto(s) sin contar no serán ajustados.
              </div>
            ) : null}
            {closeMutation.error ? (
              <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
                {errorOf(closeMutation.error, "Error al cerrar conteo")}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {showConfirmCancel ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setShowConfirmCancel(false)} variant="secondary">
                Volver
              </Button>
              <Button disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()} variant="danger">
                {cancelMutation.isPending ? "Cancelando..." : "Sí, cancelar conteo"}
              </Button>
            </>
          }
          onClose={() => setShowConfirmCancel(false)}
          open
          title="Cancelar conteo"
        >
          <p className="text-sm text-ink-2">
            Se cancelará el conteo sin aplicar ningún ajuste de stock. Esta acción no se puede deshacer.
          </p>
          {cancelMutation.error ? (
            <div className="mt-3 border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
              {errorOf(cancelMutation.error, "Error al cancelar conteo")}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

/** Campo de conteo del renglón: se guarda al salir del campo o al pulsar Enter, solo si cambió. */
function CountInput({
  disabled,
  item,
  onCommit,
}: {
  disabled: boolean;
  item: InventoryCountItem;
  onCommit: (quantity: string) => void;
}) {
  const saved = item.counted_quantity !== null ? formatStock(item.counted_quantity) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;

  function commit() {
    if (draft === null || draft.trim() === "" || Number(draft) === Number(saved === "" ? NaN : saved)) {
      setDraft(null);
      return;
    }
    onCommit(draft.trim());
    setDraft(null);
  }

  return (
    <input
      aria-label={`Contado de ${item.product_name}`}
      className="min-h-11 w-full border border-field-border bg-surface px-2 text-right text-base tabular-nums text-text hover:border-text focus-visible:border-accent focus-visible:outline-offset-0 disabled:opacity-45 lg:min-h-9"
      disabled={disabled}
      min="0"
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder="—"
      step="0.001"
      type="number"
      value={value}
    />
  );
}
