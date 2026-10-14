import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Trash2 } from "lucide-react";

import type { Supplier, SupplierUpdatePayload } from "../../api/purchases";
import { createSupplier, deactivateSupplier, listSuppliers, updateSupplier } from "../../api/purchases";
import { qk } from "../../api/query-keys";
import { useCan } from "../../components/auth/require-permission";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { apiErrorMessage } from "./helpers";
import { SupplierFormModal } from "./supplier-form-modal";

type SuppliersTabProps = {
  /** El botón "Nuevo proveedor" vive en el encabezado de la página. */
  onCloseCreate: () => void;
  onRequestCreate: () => void;
  showCreate: boolean;
};

/** Proveedores: contacto, teléfono, email y condiciones de pago. */
export function SuppliersTab({ onCloseCreate, onRequestCreate, showCreate }: SuppliersTabProps) {
  const queryClient = useQueryClient();
  const can = useCan();
  const canEdit = can("compras:editar");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [confirmDeactivateSupplierId, setConfirmDeactivateSupplierId] = useState<number | null>(null);

  const suppliersQuery = useQuery({
    queryKey: qk.suppliers(),
    queryFn: () => listSuppliers(),
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.suppliers() });
      onCloseCreate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SupplierUpdatePayload }) => updateSupplier(id, payload),
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

  const suppliers: Supplier[] = suppliersQuery.data?.items ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {suppliersQuery.isLoading ? (
        <SkeletonTable cols={6} rows={6} />
      ) : suppliersQuery.isError ? (
        <ErrorState message="No se pudieron cargar los proveedores." onRetry={() => void suppliersQuery.refetch()} />
      ) : suppliers.length === 0 ? (
        <EmptyState
          actionLabel={can("compras:crear") ? "Nuevo proveedor" : undefined}
          icon={<Building2 size={32} />}
          message="Aún no hay proveedores registrados."
          onAction={onRequestCreate}
        />
      ) : (
        <Card frame>
          <div className="p-2">
            <Table>
              <caption className="sr-only">Tabla de proveedores</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Proveedor</th>
                  <th className={tableHeadClass}>Contacto</th>
                  <th className={tableHeadClass}>Teléfono</th>
                  <th className={tableHeadClass}>Email</th>
                  <th className={tableHeadClass}>Condiciones</th>
                  <th className={tableHeadClass}>Estado</th>
                  {canEdit ? (
                    <th className={tableHeadClass}>
                      <span className="sr-only">Acciones</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr className={tableRowClass} key={supplier.id}>
                    <td className={tableCellClass}>
                      <div className="font-medium">{supplier.name}</div>
                      {supplier.rfc ? (
                        <div className="font-mono text-xs tracking-wide text-ink-2">{supplier.rfc}</div>
                      ) : supplier.address ? (
                        <div className="text-xs text-ink-2">{supplier.address}</div>
                      ) : null}
                    </td>
                    <td className={tableCellClass}>{supplier.contact_name ?? "—"}</td>
                    <td className={`${tableCellClass} whitespace-nowrap tabular-nums text-ink-2`}>{supplier.phone ?? "—"}</td>
                    <td className={`${tableCellClass} text-ink-2`}>{supplier.email ?? "—"}</td>
                    <td className={tableCellClass}>{supplier.payment_terms ?? "—"}</td>
                    <td className={tableCellClass}>
                      <Badge tone={supplier.is_active ? "success" : "danger"}>
                        {supplier.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    {canEdit ? (
                      <td className={tableCellClass}>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Tooltip content="Editar">
                            <Button
                              aria-label={`Editar ${supplier.name}`}
                              onClick={() => setEditingSupplier(supplier)}
                              variant="icon"
                            >
                              <Pencil aria-hidden="true" size={16} />
                            </Button>
                          </Tooltip>
                          {supplier.is_active ? (
                            <Tooltip content="Desactivar">
                              <Button
                                aria-label={`Desactivar ${supplier.name}`}
                                className="hover:text-bad"
                                disabled={deactivateMutation.isPending}
                                onClick={() => {
                                  deactivateMutation.reset();
                                  setConfirmDeactivateSupplierId(supplier.id);
                                }}
                                variant="icon"
                              >
                                <Trash2 aria-hidden="true" size={16} />
                              </Button>
                            </Tooltip>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {showCreate ? (
        <SupplierFormModal
          error={createMutation.error}
          isLoading={createMutation.isPending}
          onClose={() => {
            onCloseCreate();
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
          <p className="text-sm text-ink-2">
            El proveedor será desactivado y ya no aparecerá en las órdenes de compra nuevas.
          </p>
          {deactivateMutation.error ? (
            <div className="mt-3 border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
              {apiErrorMessage(deactivateMutation.error, "No se pudo desactivar el proveedor.")}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
