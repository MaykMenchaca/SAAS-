import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AlertTriangle, ArrowDownUp, Boxes, ClipboardList, Package, Search } from "lucide-react";
import { Link } from "react-router-dom";

import type { StockAdjustPayload, StockItem, StockMovement } from "../api/inventory";
import { adjustStock, listMovements, listStock } from "../api/inventory";
import { Badge, Button, Card, Input, Modal, Table, tableCellClass, tableHeadClass } from "../components/ui";

// ── Main Page ──────────────────────────────────────────────────────

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<StockItem | null>(null);

  const stockQuery = useQuery({
    queryKey: ["stock", page, search],
    queryFn: () => listStock({ page, search }),
  });

  const stocks = stockQuery.data?.items ?? [];
  const totalPages = stockQuery.data?.pages ?? 1;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="grid gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Inventario</h1>
          <p className="text-sm text-neutral-text-secondary">Stock actual y movimientos</p>
        </div>
        <Link to="/inventario/conteo">
          <Button icon={<ClipboardList aria-hidden="true" size={18} />} variant="secondary">
            Conteo fisico
          </Button>
        </Link>
      </div>

      {/* Search + Table */}
      <section className="grid gap-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
          <Input
            label="Buscar"
            name="search"
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nombre, SKU o codigo"
            value={searchInput}
          />
          <div className="flex items-end">
            <Button className="w-full sm:w-auto" icon={<Search aria-hidden="true" size={18} />} type="submit">
              Buscar
            </Button>
          </div>
        </form>

        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th className={tableHeadClass}>Producto</th>
                <th className={tableHeadClass}>Stock</th>
                <th className={tableHeadClass}>Min / Max</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((item) => {
                const qty = Number(item.quantity);
                const min = Number(item.min_stock);
                const isLow = min > 0 && qty < min;

                return (
                  <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={item.id}>
                    <td className={tableCellClass}>
                      <div className="font-semibold text-neutral-text-primary">{item.product_name}</div>
                      <div className="font-mono text-xs text-neutral-text-secondary">{item.sku}</div>
                    </td>
                    <td className={`${tableCellClass} font-mono font-semibold`}>
                      {item.quantity} {item.unit_abbreviation}
                    </td>
                    <td className={`${tableCellClass} text-neutral-text-secondary`}>
                      {item.min_stock} / {item.max_stock}
                    </td>
                    <td className={tableCellClass}>
                      {isLow ? (
                        <Badge tone="warning">
                          <AlertTriangle aria-hidden="true" className="mr-1 inline" size={12} />
                          Bajo
                        </Badge>
                      ) : (
                        <Badge tone="success">Normal</Badge>
                      )}
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex gap-2">
                        <Button
                          aria-label={`Movimientos de ${item.product_name}`}
                          className="h-11 w-11 px-0"
                          onClick={() => setSelectedProduct(item)}
                          variant="secondary"
                        >
                          <ArrowDownUp aria-hidden="true" size={17} />
                        </Button>
                        <Button
                          aria-label={`Ajustar stock de ${item.product_name}`}
                          className="h-11 w-11 px-0"
                          onClick={() => setAdjustProduct(item)}
                          variant="secondary"
                        >
                          <Package aria-hidden="true" size={17} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!stockQuery.isLoading && stocks.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={5}>
                    <Boxes aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
                    Sin productos en inventario.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
          <span>
            Pagina {stockQuery.data?.page ?? page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button disabled={page <= 1 || stockQuery.isFetching} onClick={() => setPage((v) => v - 1)} variant="secondary">
              Anterior
            </Button>
            <Button disabled={page >= totalPages || stockQuery.isFetching} onClick={() => setPage((v) => v + 1)} variant="secondary">
              Siguiente
            </Button>
          </div>
        </div>
      </section>

      {/* Movement History Modal */}
      {selectedProduct ? (
        <MovementHistoryModal onClose={() => setSelectedProduct(null)} product={selectedProduct} />
      ) : null}

      {/* Adjust Stock Modal */}
      {adjustProduct ? (
        <AdjustStockModal
          onClose={() => setAdjustProduct(null)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            setAdjustProduct(null);
          }}
          product={adjustProduct}
        />
      ) : null}
    </div>
  );
}

// ── Movement History Modal ─────────────────────────────────────────

function MovementHistoryModal({ product, onClose }: { product: StockItem; onClose: () => void }) {
  const movementsQuery = useQuery({
    queryKey: ["movements", product.product_id],
    queryFn: () => listMovements(product.product_id),
  });

  const movements = movementsQuery.data ?? [];

  const typeLabels: Record<string, string> = {
    entrada: "Entrada",
    salida: "Salida",
    ajuste: "Ajuste",
  };

  const refLabels: Record<string, string> = {
    venta: "Venta",
    compra: "Compra",
    ajuste_manual: "Ajuste manual",
    cancelacion: "Cancelacion",
    devolucion: "Devolucion",
    conteo: "Conteo fisico",
  };

  function typeTone(type: string): "success" | "danger" | "warning" {
    if (type === "entrada") return "success";
    if (type === "salida") return "danger";
    return "warning";
  }

  return (
    <Modal onClose={onClose} open title={`Movimientos — ${product.product_name}`}>
      <div className="max-h-96 overflow-auto">
        {movementsQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando...</p>
        ) : movements.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-text-secondary">Sin movimientos registrados.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={tableHeadClass}>Tipo</th>
                <th className={tableHeadClass}>Cant.</th>
                <th className={tableHeadClass}>Anterior</th>
                <th className={tableHeadClass}>Nuevo</th>
                <th className={tableHeadClass}>Referencia</th>
                <th className={tableHeadClass}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m: StockMovement) => (
                <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={m.id}>
                  <td className={tableCellClass}>
                    <Badge tone={typeTone(m.movement_type)}>{typeLabels[m.movement_type] ?? m.movement_type}</Badge>
                  </td>
                  <td className={`${tableCellClass} font-mono`}>{m.quantity}</td>
                  <td className={`${tableCellClass} font-mono text-neutral-text-secondary`}>{m.previous_stock}</td>
                  <td className={`${tableCellClass} font-mono font-semibold`}>{m.new_stock}</td>
                  <td className={`${tableCellClass} text-xs`}>
                    {refLabels[m.reference_type] ?? m.reference_type}
                    {m.notes ? <div className="text-neutral-text-secondary">{m.notes}</div> : null}
                  </td>
                  <td className={`${tableCellClass} text-xs text-neutral-text-secondary`}>
                    {new Date(m.created_at).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Modal>
  );
}

// ── Adjust Stock Modal ─────────────────────────────────────────────

function AdjustStockModal({
  product,
  onClose,
  onSuccess,
}: {
  product: StockItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState(product.quantity);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: StockAdjustPayload) => adjustStock(payload),
    onSuccess,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({
      product_id: product.product_id,
      quantity,
      notes: notes.trim() || undefined,
    });
  }

  const errorMessage = mutation.error
    ? mutation.error instanceof AxiosError
      ? mutation.error.response?.data?.error ?? "No se pudo ajustar."
      : "No se pudo ajustar."
    : "";

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={mutation.isPending || !quantity} form="adjust-form" type="submit">
            {mutation.isPending ? "Guardando" : "Ajustar"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={`Ajustar stock — ${product.product_name}`}
    >
      <form className="grid gap-4" id="adjust-form" onSubmit={handleSubmit}>
        <div className="rounded-md border border-neutral-border bg-neutral-bg px-3 py-2 text-sm">
          <span className="text-neutral-text-secondary">Stock actual: </span>
          <span className="font-mono font-semibold">
            {product.quantity} {product.unit_abbreviation}
          </span>
        </div>

        <Input
          label="Nueva cantidad"
          name="quantity"
          onChange={(e) => setQuantity(e.target.value)}
          type="number"
          value={quantity}
        />

        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Notas (opcional)</span>
          <textarea
            className="min-h-20 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Razon del ajuste..."
            value={notes}
          />
        </label>

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">{errorMessage}</div>
        ) : null}
      </form>
    </Modal>
  );
}
