import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { CornerDownLeft, Search, Undo2 } from "lucide-react";

import type { ReturnItemInput, SaleItem } from "../api/sales";
import { getSale, listSales, returnSale } from "../api/sales";
import { Badge, Button, Card, Input, Modal, Table, tableCellClass, tableHeadClass, Toast } from "../components/ui";

// ── Main Page ────────────────────────────────────────────────────

export function ReturnsPage() {
  const [searchFolio, setSearchFolio] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  // Search for recent completed sales to show as quick picks
  const recentQuery = useQuery({
    queryKey: ["sales-history", 1],
    queryFn: () => listSales(1, 20),
  });

  const recentCompleted = (recentQuery.data?.items ?? []).filter(
    (s) => s.status === "completada",
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Find by folio among recent sales
    const found = recentQuery.data?.items.find(
      (s) => s.folio.toLowerCase() === searchFolio.trim().toLowerCase(),
    );
    if (found) {
      setSelectedSaleId(found.id);
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-text-primary">Devoluciones</h1>
        <p className="text-sm text-neutral-text-secondary">
          Busca una venta por folio para devolver productos
        </p>
      </div>

      {/* Search by folio */}
      <Card className="p-4">
        <form className="flex gap-2" onSubmit={handleSearch}>
          <div className="flex-1">
            <Input
              label="Buscar por folio"
              name="folio"
              onChange={(e) => setSearchFolio(e.target.value)}
              placeholder="V-20260607-0001"
              value={searchFolio}
            />
          </div>
          <div className="flex items-end">
            <Button icon={<Search aria-hidden="true" size={17} />} type="submit">
              Buscar
            </Button>
          </div>
        </form>
      </Card>

      {/* Recent completed sales for quick selection */}
      <section className="grid gap-3">
        <h2 className="text-sm font-semibold uppercase text-neutral-text-secondary">
          Ventas recientes completadas
        </h2>
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th className={tableHeadClass}>Folio</th>
                <th className={tableHeadClass}>Fecha</th>
                <th className={tableHeadClass}>Cajero</th>
                <th className={`${tableHeadClass} text-right`}>Total</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {recentCompleted.map((sale) => (
                <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={sale.id}>
                  <td className={tableCellClass}>
                    <span className="font-mono text-sm font-semibold text-primary">{sale.folio}</span>
                  </td>
                  <td className={`${tableCellClass} text-sm text-neutral-text-secondary`}>
                    {new Date(sale.created_at).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={tableCellClass}>{sale.username}</td>
                  <td className={`${tableCellClass} text-right font-mono font-semibold`}>
                    ${sale.total}
                  </td>
                  <td className={tableCellClass}>
                    <Button
                      aria-label={`Devolver ${sale.folio}`}
                      icon={<Undo2 aria-hidden="true" size={17} />}
                      onClick={() => setSelectedSaleId(sale.id)}
                      variant="secondary"
                    >
                      Devolver
                    </Button>
                  </td>
                </tr>
              ))}

              {!recentQuery.isLoading && recentCompleted.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={5}>
                    <CornerDownLeft aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
                    Sin ventas completadas recientes.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </Card>
      </section>

      {/* Return modal */}
      {selectedSaleId !== null ? (
        <ReturnModal onClose={() => setSelectedSaleId(null)} saleId={selectedSaleId} />
      ) : null}
    </div>
  );
}

// ── Return Modal ─────────────────────────────────────────────────

type ReturnSelection = {
  sale_item_id: number;
  maxQty: number;
  quantity: string;
  selected: boolean;
};

function ReturnModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [selections, setSelections] = useState<ReturnSelection[]>([]);
  const [success, setSuccess] = useState(false);

  const saleQuery = useQuery({
    queryKey: ["sale-detail", saleId],
    queryFn: () => getSale(saleId),
    // Initialize selections when data loads
  });

  const sale = saleQuery.data;

  // Initialize selections when sale data arrives
  if (sale && selections.length === 0 && sale.items.length > 0) {
    const initial: ReturnSelection[] = sale.items.map((item: SaleItem) => ({
      sale_item_id: item.id,
      maxQty: Number(item.quantity),
      quantity: item.quantity,
      selected: false,
    }));
    setSelections(initial);
  }

  const returnMutation = useMutation({
    mutationFn: (data: { reason: string; items: ReturnItemInput[] }) =>
      returnSale(saleId, data.reason, data.items),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-history"] });
      await queryClient.invalidateQueries({ queryKey: ["sale-detail", saleId] });
      setSuccess(true);
    },
  });

  function toggleItem(saleItemId: number) {
    setSelections((prev) =>
      prev.map((s) =>
        s.sale_item_id === saleItemId ? { ...s, selected: !s.selected } : s,
      ),
    );
  }

  function updateQuantity(saleItemId: number, qty: string) {
    setSelections((prev) =>
      prev.map((s) =>
        s.sale_item_id === saleItemId ? { ...s, quantity: qty } : s,
      ),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return;

    const items: ReturnItemInput[] = selections
      .filter((s) => s.selected && Number(s.quantity) > 0)
      .map((s) => ({
        sale_item_id: s.sale_item_id,
        quantity: s.quantity,
      }));

    if (items.length === 0) return;
    returnMutation.mutate({ reason, items });
  }

  const selectedItems = selections.filter((s) => s.selected && Number(s.quantity) > 0);

  // Estimate refund total
  const estimatedRefund = selectedItems.reduce((sum, sel) => {
    if (!sale) return sum;
    const item = sale.items.find((i: SaleItem) => i.id === sel.sale_item_id);
    if (!item) return sum;
    const pricePerUnit = Number(item.subtotal) / Number(item.quantity);
    const taxPerUnit = pricePerUnit * Number(item.tax_rate) / 100;
    return sum + (pricePerUnit + taxPerUnit) * Number(sel.quantity);
  }, 0);

  const returnError = returnMutation.error
    ? returnMutation.error instanceof AxiosError
      ? returnMutation.error.response?.data?.error ?? "No se pudo procesar la devolucion."
      : "No se pudo procesar la devolucion."
    : "";

  return (
    <Modal
      onClose={onClose}
      open
      title={sale ? `Devolucion — ${sale.folio}` : "Cargando..."}
    >
      {saleQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando venta...</p>
      ) : !sale ? (
        <p className="py-6 text-center text-sm text-danger">No se encontro la venta.</p>
      ) : sale.status === "cancelada" ? (
        <p className="py-6 text-center text-sm text-danger">
          Esta venta esta cancelada y no admite devoluciones.
        </p>
      ) : success ? (
        <div className="grid gap-4 py-4">
          <Toast tone="success">
            Devolucion procesada correctamente. El inventario ha sido restaurado.
          </Toast>
          <div className="flex justify-end">
            <Button onClick={onClose} variant="secondary">
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {/* Sale header */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-neutral-text-secondary">Cajero: </span>
              <span className="font-medium">{sale.username}</span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Total: </span>
              <span className="font-mono font-semibold">${sale.total}</span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Fecha: </span>
              <span className="font-medium">
                {new Date(sale.created_at).toLocaleString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Estado: </span>
              <Badge tone="success">Completada</Badge>
            </div>
          </div>

          {/* Item selection */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-text-secondary">
              Selecciona productos a devolver
            </p>
            <div className="grid gap-2">
              {sale.items.map((item: SaleItem) => {
                const sel = selections.find((s) => s.sale_item_id === item.id);
                if (!sel) return null;

                return (
                  <div
                    className={`rounded-md border p-3 transition-colors ${
                      sel.selected
                        ? "border-primary bg-primary/5"
                        : "border-neutral-border bg-neutral-surface"
                    }`}
                    key={item.id}
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <input
                        checked={sel.selected}
                        className="h-4 w-4 rounded border-neutral-border accent-primary"
                        onChange={() => toggleItem(item.id)}
                        type="checkbox"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-neutral-text-primary">
                          {item.product_name}
                        </div>
                        <div className="text-xs text-neutral-text-secondary">
                          SKU: {item.product_sku} — Vendido: {item.quantity} a ${item.unit_price} c/u
                        </div>
                      </div>
                      <div className="text-right font-mono text-sm font-semibold">
                        ${item.subtotal}
                      </div>
                    </div>

                    {sel.selected ? (
                      <div className="ml-7 flex items-center gap-2">
                        <label className="text-xs text-neutral-text-secondary">Cantidad a devolver:</label>
                        <input
                          className="h-8 w-20 rounded border border-neutral-border bg-neutral-bg text-center font-mono text-sm outline-none focus:border-primary"
                          max={sel.maxQty}
                          min="0.001"
                          onChange={(e) => updateQuantity(item.id, e.target.value)}
                          step="1"
                          type="number"
                          value={sel.quantity}
                        />
                        <span className="text-xs text-neutral-text-secondary">
                          de {sel.maxQty}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Estimated refund */}
          {selectedItems.length > 0 ? (
            <div className="rounded-md bg-neutral-text-primary px-4 py-3 text-white">
              <div className="flex justify-between">
                <span className="text-sm text-slate-300">
                  {selectedItems.length} producto{selectedItems.length > 1 ? "s" : ""} a devolver
                </span>
                <span className="font-mono text-lg font-bold">
                  ${estimatedRefund.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-slate-400">Reembolso estimado (incluye impuestos)</div>
            </div>
          ) : null}

          {/* Reason */}
          <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
            <span>Razon de la devolucion</span>
            <textarea
              className="min-h-16 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/20"
              onChange={(e) => setReason(e.target.value)}
              placeholder="Producto defectuoso, error en cantidad..."
              value={reason}
            />
          </label>

          {returnError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
              {returnError}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={onClose} variant="secondary">
              Cancelar
            </Button>
            <Button
              disabled={selectedItems.length === 0 || !reason.trim() || returnMutation.isPending}
              icon={<Undo2 aria-hidden="true" size={17} />}
              type="submit"
              variant="danger"
            >
              {returnMutation.isPending ? "Procesando..." : "Confirmar devolucion"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
