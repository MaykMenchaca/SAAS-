import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";

import type { Supplier, SupplierUpdatePayload } from "../../api/purchases";
import { createSupplier, deactivateSupplier, listSuppliers, updateSupplier } from "../../api/purchases";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { qk } from "../../api/query-keys";
import { SupplierFormModal } from "./supplier-form-modal";

export function SuppliersTab() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const suppliers: Supplier[] = suppliersQuery.data?.items ?? [];

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
                    <div className="font-semibold text-text">{supplier.name}</div>
                    {supplier.rfc ? (
                      <div className="font-mono text-xs text-ink-2">RFC: {supplier.rfc}</div>
                    ) : supplier.address ? (
                      <div className="text-xs text-ink-2">{supplier.address}</div>
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
                            className="h-11 w-11 px-0 hover:text-bad hover:bg-bad/10"
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
          <p className="text-sm text-ink-2">
            El proveedor será desactivado y ya no aparecerá en las órdenes de compra nuevas.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
