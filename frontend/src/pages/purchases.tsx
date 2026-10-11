import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  Ban,
  Building2,
  Eye,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import type { Product } from "../api/products";
import { listProducts } from "../api/products";
import type {
  CreateOrderPayload,
  PurchaseOrder,
  PurchaseOrderListItem,
  ReceiveItemInput,
  Supplier,
  SupplierCreatePayload,
  SupplierUpdatePayload,
} from "../api/purchases";
import {
  cancelOrder,
  createOrder,
  createSupplier,
  deactivateSupplier,
  getOrder,
  listOrders,
  listSuppliers,
  receiveOrder,
  sendOrder,
  updateSupplier,
} from "../api/purchases";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Pagination, Select, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../components/ui";
import { qk } from "../api/query-keys";
import { invalidateAfterPurchase } from "../api/invalidate";

// ── Helpers ────────────────────────────────────────────────────────

type Tab = "ordenes" | "proveedores";

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "recibida") return "success";
  if (status === "enviada" || status === "parcial") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    borrador: "Borrador",
    enviada: "Enviada",
    parcial: "Parcial",
    recibida: "Recibida",
    cancelada: "Cancelada",
  };
  return labels[status] ?? status;
}

// ── Main Page ──────────────────────────────────────────────────────

export function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("ordenes");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Compras</h1>
          <p className="text-sm text-neutral-text-secondary">Órdenes de compra y proveedores</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "ordenes"
              ? "bg-neutral-surface text-primary-text shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("ordenes")}
          type="button"
        >
          <Package aria-hidden="true" size={16} />
          Órdenes
        </button>
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "proveedores"
              ? "bg-neutral-surface text-primary-text shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("proveedores")}
          type="button"
        >
          <Building2 aria-hidden="true" size={16} />
          Proveedores
        </button>
      </nav>

      {activeTab === "ordenes" ? <OrdersTab /> : <SuppliersTab />}
    </div>
  );
}

// ── Orders Tab ────────────────────────────────────────────────────

function OrdersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState<number | null>(null);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<number | null>(null);

  const ordersQuery = useQuery({
    queryKey: qk.purchaseOrders(page, statusFilter),
    queryFn: () => listOrders({ page, status: statusFilter }),
  });

  const sendMutation = useMutation({
    mutationFn: sendOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const totalPages = ordersQuery.data?.pages ?? 1;

  return (
    <div className="grid gap-3">
      {/* Filters + New order button */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Select
          label="Estado"
          name="status-filter"
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "borrador", label: "Borrador" },
            { value: "enviada", label: "Enviada" },
            { value: "parcial", label: "Parcial" },
            { value: "recibida", label: "Recibida" },
            { value: "cancelada", label: "Cancelada" },
          ]}
          placeholder="Todos"
          value={statusFilter}
        />
        <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowCreateOrder(true)}>
          Nueva Orden
        </Button>
      </div>

      {ordersQuery.isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : ordersQuery.isError ? (
        <ErrorState onRetry={() => void ordersQuery.refetch()} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Truck size={32} />}
          message="Sin ordenes de compra."
          actionLabel="Nueva orden"
          onAction={() => setShowCreateOrder(true)}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <caption className="sr-only">Tabla de ordenes de compra</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Folio</th>
                  <th className={tableHeadClass}>Proveedor</th>
                  <th className={tableHeadClass}>Fecha</th>
                  <th className={`${tableHeadClass} text-right`}>Total</th>
                  <th className={tableHeadClass}>Estado</th>
                  <th className={tableHeadClass}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: PurchaseOrderListItem) => (
                  <tr className={tableRowClass} key={order.id}>
                    <td className={tableCellClass}>
                      <span className="font-mono text-sm font-semibold text-primary-text">{order.folio}</span>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex items-center gap-2">
                        <Avatar name={order.supplier_name} size="sm" />
                        <span className="font-medium">{order.supplier_name}</span>
                      </div>
                    </td>
                    <td className={`${tableCellClass} text-sm text-neutral-text-secondary`}>
                      {new Date(order.created_at).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {order.expected_date ? (
                        <div className="text-xs">
                          Espera: {new Date(order.expected_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${tableCellClass} text-right font-mono font-semibold`}>${order.total}</td>
                    <td className={tableCellClass}>
                      <Badge dot tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex gap-1.5">
                        <Tooltip content="Ver detalle">
                          <Button
                            aria-label={`Ver orden ${order.folio}`}
                            className="h-11 w-11 px-0"
                            onClick={() => setSelectedOrderId(order.id)}
                            variant="secondary"
                          >
                            <Eye aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                        {order.status === "borrador" ? (
                          <Tooltip content="Enviar">
                            <Button
                              aria-label={`Enviar orden ${order.folio}`}
                              className="h-11 w-11 px-0"
                              disabled={sendMutation.isPending}
                              onClick={() => sendMutation.mutate(order.id)}
                              variant="primary"
                            >
                              <Send aria-hidden="true" size={17} />
                            </Button>
                          </Tooltip>
                        ) : null}
                        {order.status === "enviada" || order.status === "parcial" ? (
                          <Tooltip content="Recibir">
                            <Button
                              aria-label={`Recibir orden ${order.folio}`}
                              className="h-11 w-11 px-0"
                              onClick={() => setReceivingOrderId(order.id)}
                              variant="primary"
                            >
                              <PackageCheck aria-hidden="true" size={17} />
                            </Button>
                          </Tooltip>
                        ) : null}
                        {order.status === "borrador" || order.status === "enviada" ? (
                          <Tooltip content="Cancelar">
                            <Button
                              aria-label={`Cancelar orden ${order.folio}`}
                              className="h-11 w-11 px-0 hover:text-danger hover:bg-danger/10"
                              disabled={cancelMutation.isPending}
                              onClick={() => setConfirmCancelOrderId(order.id)}
                              variant="ghost"
                            >
                              <Ban aria-hidden="true" size={17} />
                            </Button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
            <span>Página {ordersQuery.data?.page ?? page} de {totalPages}</span>
            <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
          </div>
        </>
      )}

      {selectedOrderId !== null ? (
        <OrderDetailModal onClose={() => setSelectedOrderId(null)} orderId={selectedOrderId} />
      ) : null}

      {showCreateOrder ? (
        <CreateOrderModal
          onClose={() => setShowCreateOrder(false)}
          onSuccess={async () => {
            setShowCreateOrder(false);
            await queryClient.invalidateQueries({ queryKey: qk.purchaseOrders() });
          }}
        />
      ) : null}

      {receivingOrderId !== null ? (
        <ReceiveOrderModal
          onClose={() => setReceivingOrderId(null)}
          onSuccess={async () => {
            setReceivingOrderId(null);
            await invalidateAfterPurchase(queryClient);
          }}
          orderId={receivingOrderId}
        />
      ) : null}

      {confirmCancelOrderId !== null ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmCancelOrderId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={cancelMutation.isPending}
                onClick={() => {
                  cancelMutation.mutate(confirmCancelOrderId, {
                    onSuccess: () => setConfirmCancelOrderId(null),
                  });
                }}
                variant="danger"
              >
                {cancelMutation.isPending ? "Cancelando..." : "Cancelar orden"}
              </Button>
            </>
          }
          onClose={() => setConfirmCancelOrderId(null)}
          open
          title="Cancelar orden de compra"
        >
          <p className="text-sm text-neutral-text-secondary">
            ¿Confirmas que deseas cancelar esta orden de compra? Esta acción no se puede deshacer.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

// ── Order Detail Modal ────────────────────────────────────────────

function OrderDetailModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const orderQuery = useQuery({
    queryKey: qk.purchaseOrderDetail(orderId),
    queryFn: () => getOrder(orderId),
  });

  const order: PurchaseOrder | undefined = orderQuery.data;

  return (
    <Modal onClose={onClose} open title={order ? `Orden ${order.folio}` : "Cargando..."}>
      {orderQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando detalle...</p>
      ) : !order ? (
        <p className="py-6 text-center text-sm text-danger">No se encontró la orden.</p>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-neutral-text-secondary">Proveedor: </span>
              <span className="font-medium">{order.supplier_name}</span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Estado: </span>
              <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Creada por: </span>
              <span className="font-medium">{order.username}</span>
            </div>
            <div>
              <span className="text-neutral-text-secondary">Fecha: </span>
              <span className="font-medium">
                {new Date(order.created_at).toLocaleDateString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {order.notes ? (
            <div className="rounded-md border border-neutral-border bg-neutral-bg px-3 py-2 text-sm text-neutral-text-secondary">
              {order.notes}
            </div>
          ) : null}

          <div className="max-h-64 overflow-auto">
            <Table>
              <caption className="sr-only">Tabla de items de la orden</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={`${tableHeadClass} text-right`}>Pedido</th>
                  <th className={`${tableHeadClass} text-right`}>Recibido</th>
                  <th className={`${tableHeadClass} text-right`}>Costo u.</th>
                  <th className={`${tableHeadClass} text-right`}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const received = Number(item.received_quantity);
                  const ordered = Number(item.quantity);
                  return (
                    <tr className={tableRowClass} key={item.id}>
                      <td className={tableCellClass}>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.quantity}</td>
                      <td className={tableCellClass}>
                        <div className="flex justify-end">
                          <Badge tone={received >= ordered ? "success" : received > 0 ? "warning" : "neutral"}>
                            {item.received_quantity}
                          </Badge>
                        </div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>${item.unit_cost}</td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold`}>${item.subtotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <div className="rounded-md bg-neutral-text-primary px-4 py-3 text-white">
            <div className="flex justify-between">
              <span className="text-lg font-bold">Total</span>
              <span className="font-mono text-xl font-bold">${order.total}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Create Order Modal ────────────────────────────────────────────

type OrderLineItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: string;
  unit_cost: string;
  tax_rate: string;
};

let lineIdCounter = 0;

function CreateOrderModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const suppliersQuery = useQuery({ queryKey: qk.suppliers(), queryFn: listSuppliers });
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [lines, setLines] = useState<OrderLineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const productsQuery = useQuery({
    queryKey: qk.orderProducts(debouncedSearch),
    queryFn: () => listProducts({ page: 1, perPage: 30, search: debouncedSearch }),
    enabled: debouncedSearch.length > 0,
  });

  // Debounce product search
  useState(() => {
    const timer = setTimeout(() => setDebouncedSearch(productSearch), 300);
    return () => clearTimeout(timer);
  });

  // Manual debounce effect
  const [, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setProductSearch(value);
    setSearchTimer((prev) => {
      if (prev) clearTimeout(prev);
      return setTimeout(() => setDebouncedSearch(value), 300);
    });
  }

  function addProduct(product: Product) {
    const existing = lines.find((l) => l.product_id === product.id);
    if (existing) return;
    setLines([
      ...lines,
      {
        id: ++lineIdCounter,
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        quantity: "1",
        unit_cost: product.purchase_price || "0.00",
        tax_rate: product.tax_rate || "16.00",
      },
    ]);
    setProductSearch("");
    setDebouncedSearch("");
  }

  function updateLine(id: number, field: keyof OrderLineItem, value: string) {
    setLines(lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function removeLine(id: number) {
    setLines(lines.filter((l) => l.id !== id));
  }

  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost), 0);
  const taxTotal = lines.reduce((sum, l) => {
    const lineSubtotal = Number(l.quantity) * Number(l.unit_cost);
    return sum + lineSubtotal * Number(l.tax_rate) / 100;
  }, 0);
  const grandTotal = subtotal + taxTotal;

  const orderMutation = useMutation({
    mutationFn: (payload: CreateOrderPayload) => createOrder(payload),
    onSuccess,
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lines.length === 0) return;
    orderMutation.mutate({
      supplier_id: supplierId ? Number(supplierId) : null,
      items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        tax_rate: l.tax_rate,
      })),
      notes: notes.trim() || undefined,
      expected_date: expectedDate || undefined,
    });
  }

  const errorMessage = orderMutation.error
    ? orderMutation.error instanceof AxiosError
      ? orderMutation.error.response?.data?.error ?? "No se pudo crear la orden."
      : "No se pudo crear la orden."
    : "";

  const suppliers = suppliersQuery.data?.filter((s) => s.is_active) ?? [];
  const searchResults = productsQuery.data?.items ?? [];

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">Cancelar</Button>
          <Button
            disabled={lines.length === 0 || orderMutation.isPending}
            form="create-order-form"
            type="submit"
          >
            {orderMutation.isPending ? "Creando..." : "Crear Orden"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Nueva Orden de Compra"
    >
      <form className="grid gap-4" id="create-order-form" onSubmit={handleSubmit}>
        {/* Supplier */}
        <Select
          label="Proveedor"
          name="supplier_id"
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Ninguno / Sin Proveedor"
          value={supplierId}
        />

        {/* Product search */}
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-neutral-text-primary">Agregar productos</span>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 text-neutral-text-secondary" size={16} />
            <input
              className="w-full rounded-md border border-neutral-border bg-neutral-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              type="text"
              value={productSearch}
            />
          </div>
          {debouncedSearch.length > 0 && searchResults.length > 0 ? (
            <div className="max-h-40 overflow-auto rounded-md border border-neutral-border bg-neutral-surface">
              {searchResults.map((product) => (
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary/5"
                  key={product.id}
                  onClick={() => addProduct(product)}
                  type="button"
                >
                  <span className="font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-neutral-text-secondary">{product.sku}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Line items */}
        {lines.length > 0 ? (
          <div className="max-h-48 overflow-auto">
            <Table>
              <caption className="sr-only">Tabla de items de la orden</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={`${tableHeadClass} text-right`}>Cant.</th>
                  <th className={`${tableHeadClass} text-right`}>Costo u.</th>
                  <th className={`${tableHeadClass} text-right`}>IVA %</th>
                  <th className={`${tableHeadClass} text-right`}>Subtotal</th>
                  <th className={tableHeadClass}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const lineSub = (Number(line.quantity) * Number(line.unit_cost)).toFixed(2);
                  return (
                    <tr className={tableRowClass} key={line.id}>
                      <td className={tableCellClass}>
                        <div className="text-sm font-medium">{line.product_name}</div>
                        <div className="font-mono text-xs text-neutral-text-secondary">{line.product_sku}</div>
                      </td>
                      <td className={tableCellClass}>
                        <input
                          className="w-16 rounded border border-neutral-border bg-neutral-surface px-2 py-1 text-right font-mono text-sm outline-none focus:border-primary"
                          min="0.001"
                          onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                          step="any"
                          type="number"
                          value={line.quantity}
                        />
                      </td>
                      <td className={tableCellClass}>
                        <input
                          className="w-20 rounded border border-neutral-border bg-neutral-surface px-2 py-1 text-right font-mono text-sm outline-none focus:border-primary"
                          min="0.01"
                          onChange={(e) => updateLine(line.id, "unit_cost", e.target.value)}
                          step="0.01"
                          type="number"
                          value={line.unit_cost}
                        />
                      </td>
                      <td className={tableCellClass}>
                        <input
                          className="w-16 rounded border border-neutral-border bg-neutral-surface px-2 py-1 text-right font-mono text-sm outline-none focus:border-primary"
                          min="0"
                          onChange={(e) => updateLine(line.id, "tax_rate", e.target.value)}
                          step="0.01"
                          type="number"
                          value={line.tax_rate}
                        />
                      </td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold`}>${lineSub}</td>
                      <td className={tableCellClass}>
                        <button className="text-neutral-text-secondary hover:text-danger" onClick={() => removeLine(line.id)} type="button">
                          <X aria-hidden="true" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-neutral-border p-4 text-center text-sm text-neutral-text-secondary">
            Busca y agrega productos a la orden
          </div>
        )}

        {/* Totals */}
        {lines.length > 0 ? (
          <div className="rounded-md border border-neutral-border bg-neutral-bg px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="text-neutral-text-secondary">Subtotal</span><span className="font-mono">${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-text-secondary">IVA</span><span className="font-mono">${taxTotal.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-neutral-border pt-1 font-bold"><span>Total</span><span className="font-mono">${grandTotal.toFixed(2)}</span></div>
          </div>
        ) : null}

        {/* Optional fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha esperada" name="expected_date" onChange={(e) => setExpectedDate(e.target.value)} type="date" value={expectedDate} />
          <Input label="Notas" name="notes" onChange={(e) => setNotes(e.target.value)} value={notes} />
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{errorMessage}</div>
        ) : null}
      </form>
    </Modal>
  );
}

// ── Receive Order Modal ──────────────────────────────────────────

function ReceiveOrderModal({
  orderId,
  onClose,
  onSuccess,
}: {
  orderId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const orderQuery = useQuery({
    queryKey: qk.purchaseOrderDetail(orderId),
    queryFn: () => getOrder(orderId),
  });

  const [quantities, setQuantities] = useState<Record<number, string>>({});

  const order = orderQuery.data;

  const receiveMutation = useMutation({
    mutationFn: (items: ReceiveItemInput[]) => receiveOrder(orderId, items),
    onSuccess,
  });

  function handleReceive() {
    if (!order) return;
    const items: ReceiveItemInput[] = [];
    for (const item of order.items) {
      const qty = quantities[item.id];
      if (qty && Number(qty) > 0) {
        items.push({ order_item_id: item.id, received_quantity: qty });
      }
    }
    if (items.length === 0) return;
    receiveMutation.mutate(items);
  }

  const errorMessage = receiveMutation.error
    ? receiveMutation.error instanceof AxiosError
      ? receiveMutation.error.response?.data?.error ?? "No se pudo procesar la recepción."
      : "No se pudo procesar la recepción."
    : "";

  const hasAnyQuantity = Object.values(quantities).some((q) => Number(q) > 0);

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">Cancelar</Button>
          <Button
            disabled={!hasAnyQuantity || receiveMutation.isPending}
            onClick={handleReceive}
          >
            {receiveMutation.isPending ? "Procesando..." : "Confirmar Recepción"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={order ? `Recibir ${order.folio}` : "Cargando..."}
    >
      {orderQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando orden...</p>
      ) : !order ? (
        <p className="py-6 text-center text-sm text-danger">No se encontró la orden.</p>
      ) : (
        <div className="grid gap-4">
          <div className="text-sm text-neutral-text-secondary">
            Proveedor: <span className="font-medium text-neutral-text-primary">{order.supplier_name}</span>
          </div>

          <div className="max-h-64 overflow-auto">
            <Table>
              <caption className="sr-only">Tabla de recepcion de orden</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={`${tableHeadClass} text-right`}>Pedido</th>
                  <th className={`${tableHeadClass} text-right`}>Recibido</th>
                  <th className={`${tableHeadClass} text-right`}>Pendiente</th>
                  <th className={`${tableHeadClass} text-right`}>Recibir</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const ordered = Number(item.quantity);
                  const received = Number(item.received_quantity);
                  const pending = Math.max(0, ordered - received);
                  const fullyReceived = pending <= 0;

                  return (
                    <tr className={`${tableRowClass} ${fullyReceived ? "opacity-50" : ""}`} key={item.id}>
                      <td className={tableCellClass}>
                        <div className="text-sm font-medium">{item.product_name}</div>
                        <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.quantity}</td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.received_quantity}</td>
                      <td className={`${tableCellClass} text-right font-mono`}>
                        <Badge tone={fullyReceived ? "success" : "warning"}>{pending.toFixed(3)}</Badge>
                      </td>
                      <td className={tableCellClass}>
                        {fullyReceived ? (
                          <span className="text-xs text-neutral-text-secondary">Completo</span>
                        ) : (
                          <input
                            className="w-20 rounded border border-neutral-border bg-neutral-surface px-2 py-1 text-right font-mono text-sm outline-none focus:border-primary"
                            max={pending}
                            min="0"
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="0"
                            step="any"
                            type="number"
                            value={quantities[item.id] ?? ""}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {errorMessage ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{errorMessage}</div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

// ── Suppliers Tab ─────────────────────────────────────────────────

function SuppliersTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [confirmDeactivateSupplierId, setConfirmDeactivateSupplierId] = useState<number | null>(null);

  const suppliersQuery = useQuery({
    queryKey: qk.suppliers(),
    queryFn: listSuppliers,
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.suppliers() });
      setIsModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SupplierUpdatePayload }) =>
      updateSupplier(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.suppliers() });
      setEditingSupplier(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateSupplier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.suppliers() });
    },
  });

  const suppliers: Supplier[] = suppliersQuery.data ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setIsModalOpen(true)}>
          Nuevo proveedor
        </Button>
      </div>

      {suppliersQuery.isLoading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : suppliersQuery.isError ? (
        <ErrorState onRetry={() => void suppliersQuery.refetch()} />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={<Building2 size={32} />}
          message="Sin proveedores registrados."
          actionLabel="Nuevo proveedor"
          onAction={() => setIsModalOpen(true)}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <caption className="sr-only">Tabla de proveedores</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Proveedor</th>
                <th className={tableHeadClass}>Contacto</th>
                <th className={tableHeadClass}>Teléfono</th>
                <th className={tableHeadClass}>Email</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr className={tableRowClass} key={supplier.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-neutral-text-primary">{supplier.name}</div>
                    {supplier.rfc ? (
                      <div className="font-mono text-xs text-neutral-text-secondary">RFC: {supplier.rfc}</div>
                    ) : supplier.address ? (
                      <div className="text-xs text-neutral-text-secondary">{supplier.address}</div>
                    ) : null}
                  </td>
                  <td className={`${tableCellClass} text-sm`}>{supplier.contact_name ?? "—"}</td>
                  <td className={`${tableCellClass} font-mono text-sm`}>{supplier.phone ?? "—"}</td>
                  <td className={`${tableCellClass} text-sm`}>{supplier.email ?? "—"}</td>
                  <td className={tableCellClass}>
                    <Badge tone={supplier.is_active ? "success" : "danger"}>
                      {supplier.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex gap-1.5">
                      <Tooltip content="Editar">
                        <Button
                          aria-label={`Editar ${supplier.name}`}
                          className="h-11 w-11 px-0"
                          onClick={() => setEditingSupplier(supplier)}
                          variant="secondary"
                        >
                          <Pencil aria-hidden="true" size={17} />
                        </Button>
                      </Tooltip>
                      {supplier.is_active ? (
                        <Tooltip content="Desactivar">
                          <Button
                            aria-label={`Desactivar ${supplier.name}`}
                            className="h-11 w-11 px-0 hover:text-danger hover:bg-danger/10"
                            disabled={deactivateMutation.isPending}
                            onClick={() => setConfirmDeactivateSupplierId(supplier.id)}
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {isModalOpen ? (
        <SupplierFormModal
          error={createMutation.error}
          isLoading={createMutation.isPending}
          onClose={() => {
            setIsModalOpen(false);
            createMutation.reset();
          }}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      ) : null}

      {editingSupplier ? (
        <SupplierFormModal
          error={updateMutation.error}
          isLoading={updateMutation.isPending}
          onClose={() => {
            setEditingSupplier(null);
            updateMutation.reset();
          }}
          onSubmit={(payload) => updateMutation.mutate({ id: editingSupplier.id, payload })}
          supplier={editingSupplier}
        />
      ) : null}

      {confirmDeactivateSupplierId !== null ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmDeactivateSupplierId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  deactivateMutation.mutate(confirmDeactivateSupplierId, {
                    onSuccess: () => setConfirmDeactivateSupplierId(null),
                  });
                }}
                variant="danger"
              >
                {deactivateMutation.isPending ? "Desactivando..." : "Desactivar"}
              </Button>
            </>
          }
          onClose={() => setConfirmDeactivateSupplierId(null)}
          open
          title="Confirmar desactivación de proveedor"
        >
          <p className="text-sm text-neutral-text-secondary">
            El proveedor será desactivado y ya no aparecerá en las órdenes de compra nuevas.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

// ── Supplier Form Modal ───────────────────────────────────────────

function SupplierFormModal({
  error,
  isLoading,
  onClose,
  onSubmit,
  supplier,
}: {
  error: Error | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (payload: SupplierCreatePayload) => void;
  supplier?: Supplier;
}) {
  const isEdit = Boolean(supplier);
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    rfc: supplier?.rfc ?? "",
    contact_name: supplier?.contact_name ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    payment_terms: supplier?.payment_terms ?? "",
    notes: supplier?.notes ?? "",
  });

  function setField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      rfc: form.rfc.trim() || null,
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      notes: form.notes.trim() || null,
    });
  }

  const errorMessage = error
    ? error instanceof AxiosError
      ? error.response?.data?.error ?? "No se pudo guardar."
      : "No se pudo guardar."
    : "";

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={!form.name.trim() || isLoading} form="supplier-form" type="submit">
            {isLoading ? "Guardando" : "Guardar"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={isEdit ? "Editar proveedor" : "Nuevo proveedor"}
    >
      <form className="grid gap-4" id="supplier-form" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nombre" name="name" onChange={(e) => setField("name", e.target.value)} value={form.name} />
          <Input label="RFC" name="rfc" onChange={(e) => setField("rfc", e.target.value)} value={form.rfc} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Contacto"
            name="contact_name"
            onChange={(e) => setField("contact_name", e.target.value)}
            value={form.contact_name}
          />
          <Input
            label="Teléfono"
            name="phone"
            onChange={(e) => setField("phone", e.target.value)}
            type="tel"
            value={form.phone}
          />
        </div>
        <Input label="Email" name="email" onChange={(e) => setField("email", e.target.value)} type="email" value={form.email} />
        <Input label="Dirección" name="address" onChange={(e) => setField("address", e.target.value)} value={form.address} />
        <Input label="Condiciones de pago" name="payment_terms" onChange={(e) => setField("payment_terms", e.target.value)} value={form.payment_terms} />

        {errorMessage ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{errorMessage}</div>
        ) : null}
      </form>
    </Modal>
  );
}
