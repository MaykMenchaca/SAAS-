import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  Ban,
  Building2,
  Eye,
  Package,
  Plus,
  Send,
  Truck,
} from "lucide-react";

import type {
  PurchaseOrder,
  PurchaseOrderListItem,
  Supplier,
  SupplierCreatePayload,
} from "../api/purchases";
import {
  cancelOrder,
  createSupplier,
  getOrder,
  listOrders,
  listSuppliers,
  sendOrder,
} from "../api/purchases";
import { Badge, Button, Card, Input, Modal, Table, tableCellClass, tableHeadClass } from "../components/ui";

// ── Helpers ────────────────────────────────────────────────────────

type Tab = "ordenes" | "proveedores";

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "recibida") return "success";
  if (status === "enviada") return "warning";
  if (status === "cancelada") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    borrador: "Borrador",
    enviada: "Enviada",
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
          <p className="text-sm text-neutral-text-secondary">Ordenes de compra y proveedores</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-border bg-neutral-bg p-1">
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "ordenes"
              ? "bg-neutral-surface text-primary shadow-sm"
              : "text-neutral-text-secondary hover:text-neutral-text-primary",
          ].join(" ")}
          onClick={() => setActiveTab("ordenes")}
          type="button"
        >
          <Package aria-hidden="true" size={16} />
          Ordenes
        </button>
        <button
          className={[
            "flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
            activeTab === "proveedores"
              ? "bg-neutral-surface text-primary shadow-sm"
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

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", page, statusFilter],
    queryFn: () => listOrders({ page, status: statusFilter }),
  });

  const sendMutation = useMutation({
    mutationFn: sendOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const totalPages = ordersQuery.data?.pages ?? 1;

  return (
    <div className="grid gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1.5 text-sm font-medium text-neutral-text-primary">
          <span>Estado</span>
          <select
            className="min-h-11 rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            value={statusFilter}
          >
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="recibida">Recibida</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>
      </div>

      <Card className="overflow-hidden">
        <Table>
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
              <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={order.id}>
                <td className={tableCellClass}>
                  <span className="font-mono text-sm font-semibold text-primary">{order.folio}</span>
                </td>
                <td className={tableCellClass}>
                  <div className="font-semibold">{order.supplier_name}</div>
                  <div className="text-xs text-neutral-text-secondary">por {order.username}</div>
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
                  <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                </td>
                <td className={tableCellClass}>
                  <div className="flex gap-1.5">
                    <Button
                      aria-label={`Ver orden ${order.folio}`}
                      className="h-11 w-11 px-0"
                      onClick={() => setSelectedOrderId(order.id)}
                      variant="secondary"
                    >
                      <Eye aria-hidden="true" size={17} />
                    </Button>
                    {order.status === "borrador" ? (
                      <Button
                        aria-label={`Enviar orden ${order.folio}`}
                        className="h-11 w-11 px-0"
                        disabled={sendMutation.isPending}
                        onClick={() => sendMutation.mutate(order.id)}
                        variant="primary"
                      >
                        <Send aria-hidden="true" size={17} />
                      </Button>
                    ) : null}
                    {order.status === "borrador" || order.status === "enviada" ? (
                      <Button
                        aria-label={`Cancelar orden ${order.folio}`}
                        className="h-11 w-11 px-0"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(order.id)}
                        variant="danger"
                      >
                        <Ban aria-hidden="true" size={17} />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {!ordersQuery.isLoading && orders.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={6}>
                  <Truck aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
                  Sin ordenes de compra.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-text-secondary">
        <span>
          Pagina {ordersQuery.data?.page ?? page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button disabled={page <= 1 || ordersQuery.isFetching} onClick={() => setPage((v) => v - 1)} variant="secondary">
            Anterior
          </Button>
          <Button disabled={page >= totalPages || ordersQuery.isFetching} onClick={() => setPage((v) => v + 1)} variant="secondary">
            Siguiente
          </Button>
        </div>
      </div>

      {selectedOrderId !== null ? (
        <OrderDetailModal onClose={() => setSelectedOrderId(null)} orderId={selectedOrderId} />
      ) : null}
    </div>
  );
}

// ── Order Detail Modal ────────────────────────────────────────────

function OrderDetailModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const orderQuery = useQuery({
    queryKey: ["purchase-order-detail", orderId],
    queryFn: () => getOrder(orderId),
  });

  const order: PurchaseOrder | undefined = orderQuery.data;

  return (
    <Modal onClose={onClose} open title={order ? `Orden ${order.folio}` : "Cargando..."}>
      {orderQuery.isLoading ? (
        <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando detalle...</p>
      ) : !order ? (
        <p className="py-6 text-center text-sm text-danger">No se encontro la orden.</p>
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
                  const received = Number(item.quantity_received);
                  const ordered = Number(item.quantity_ordered);
                  return (
                    <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={item.id}>
                      <td className={tableCellClass}>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="font-mono text-xs text-neutral-text-secondary">{item.product_sku}</div>
                      </td>
                      <td className={`${tableCellClass} text-right font-mono`}>{item.quantity_ordered}</td>
                      <td className={tableCellClass}>
                        <div className="flex justify-end">
                          <Badge tone={received >= ordered ? "success" : received > 0 ? "warning" : "neutral"}>
                            {item.quantity_received}
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

// ── Suppliers Tab ─────────────────────────────────────────────────

function SuppliersTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: listSuppliers,
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setIsModalOpen(false);
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

      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <th className={tableHeadClass}>Proveedor</th>
              <th className={tableHeadClass}>Contacto</th>
              <th className={tableHeadClass}>Telefono</th>
              <th className={tableHeadClass}>Email</th>
              <th className={tableHeadClass}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr className="odd:bg-neutral-surface even:bg-neutral-bg/60" key={supplier.id}>
                <td className={tableCellClass}>
                  <div className="font-semibold text-neutral-text-primary">{supplier.name}</div>
                  {supplier.address ? (
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
              </tr>
            ))}

            {!suppliersQuery.isLoading && suppliers.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-neutral-text-secondary" colSpan={5}>
                  <Building2 aria-hidden="true" className="mx-auto mb-2 text-neutral-text-secondary" size={32} />
                  Sin proveedores registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      {isModalOpen ? (
        <SupplierFormModal
          error={createMutation.error}
          isLoading={createMutation.isPending}
          onClose={() => {
            setIsModalOpen(false);
            createMutation.reset();
          }}
          onSubmit={createMutation.mutate}
        />
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
}: {
  error: Error | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (payload: SupplierCreatePayload) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  function setField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
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
      title="Nuevo proveedor"
    >
      <form className="grid gap-4" id="supplier-form" onSubmit={handleSubmit}>
        <Input label="Nombre" name="name" onChange={(e) => setField("name", e.target.value)} value={form.name} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Contacto"
            name="contact_name"
            onChange={(e) => setField("contact_name", e.target.value)}
            value={form.contact_name}
          />
          <Input
            label="Telefono"
            name="phone"
            onChange={(e) => setField("phone", e.target.value)}
            type="tel"
            value={form.phone}
          />
        </div>
        <Input label="Email" name="email" onChange={(e) => setField("email", e.target.value)} type="email" value={form.email} />
        <Input label="Direccion" name="address" onChange={(e) => setField("address", e.target.value)} value={form.address} />

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">{errorMessage}</div>
        ) : null}
      </form>
    </Modal>
  );
}
