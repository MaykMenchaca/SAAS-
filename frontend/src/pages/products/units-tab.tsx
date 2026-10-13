import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Edit, Plus, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { UnitOfMeasure } from "../../api/products";
import { createUnit, deleteUnit, listUnits, updateUnit } from "../../api/products";
import { qk } from "../../api/query-keys";
import { useCan } from "../../components/auth/require-permission";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, SkeletonTable, Table, Tooltip, Toggle, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";

export function UnitsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasure | null>(null);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [unitName, setUnitName] = useState("");
  const [unitAbbreviation, setUnitAbbreviation] = useState("");
  const [unitAllowsFractions, setUnitAllowsFractions] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const unitsQuery = useQuery({
    queryKey: qk.units(),
    queryFn: listUnits,
  });

  const createMutation = useMutation({
    mutationFn: createUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.units() });
      closeUnitModal();
      toast.success("Unidad de medida creada con éxito.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof AxiosError ? err.response?.data?.error ?? "Error al crear la unidad." : "Error al crear la unidad.";
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; abbreviation: string; allows_fractions: boolean } }) =>
      updateUnit(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.units() });
      closeUnitModal();
      toast.success("Unidad de medida actualizada con éxito.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof AxiosError ? err.response?.data?.error ?? "Error al actualizar la unidad." : "Error al actualizar la unidad.";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUnit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.units() });
      toast.success("Unidad de medida eliminada con éxito.");
      setConfirmDeleteId(null);
    },
    onError: (err: unknown) => {
      const details = err instanceof AxiosError ? err.response?.data?.details?.error?.[0] || err.response?.data?.error : null;
      toast.error(details ?? "No se puede eliminar la unidad porque está asociada a productos.");
      setConfirmDeleteId(null);
    },
  });

  function openCreateModal() {
    setEditingUnit(null);
    setUnitName("");
    setUnitAbbreviation("");
    setUnitAllowsFractions(false);
    setIsUnitModalOpen(true);
  }

  function openEditModal(unit: UnitOfMeasure) {
    setEditingUnit(unit);
    setUnitName(unit.name);
    setUnitAbbreviation(unit.abbreviation);
    setUnitAllowsFractions(unit.allows_fractions);
    setIsUnitModalOpen(true);
  }

  function closeUnitModal() {
    setEditingUnit(null);
    setUnitName("");
    setUnitAbbreviation("");
    setUnitAllowsFractions(false);
    setIsUnitModalOpen(false);
  }

  const units = unitsQuery.data ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl text-text">Unidades de medida</h2>
          <p className="text-sm text-ink-2">Unidades para control de stock</p>
        </div>
        {can("productos:crear") ? (
          <Button icon={<Plus size={16} />} onClick={openCreateModal}>
            Nueva unidad
          </Button>
        ) : null}
      </div>

      {unitsQuery.isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : unitsQuery.isError ? (
        <ErrorState onRetry={() => void unitsQuery.refetch()} />
      ) : (
        <Table>
            <caption className="sr-only">Tabla de unidades de medida</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Nombre</th>
                <th className={tableHeadClass}>Abreviatura</th>
                <th className={tableHeadClass}>Permite fracciones</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr className={tableRowClass} key={unit.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-text">{unit.name}</div>
                  </td>
                  <td className={tableCellClass}>
                    <span className="font-mono text-sm text-ink-2">{unit.abbreviation}</span>
                  </td>
                  <td className={tableCellClass}>
                    <Badge dot tone={unit.allows_fractions ? "success" : "neutral"}>
                      {unit.allows_fractions ? "Sí" : "No"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex gap-2">
                      {can("productos:editar") ? (
                        <Tooltip content="Editar">
                          <Button
                            aria-label={`Editar ${unit.name}`}
                            className="h-11 w-11 px-0"
                            onClick={() => openEditModal(unit)}
                            variant="secondary"
                          >
                            <Edit aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                      ) : null}
                      {can("productos:desactivar") ? (
                        <Tooltip content="Eliminar">
                          <Button
                            aria-label={`Eliminar ${unit.name}`}
                            className="h-11 w-11 px-0 hover:text-bad"
                            onClick={() => setConfirmDeleteId(unit.id)}
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
              {units.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      actionLabel={can("productos:crear") ? "Nueva unidad" : undefined}
                      icon={<Scale size={32} />}
                      message="Sin unidades de medida registradas."
                      onAction={can("productos:crear") ? openCreateModal : undefined}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
      )}

      {isUnitModalOpen && (
        <Modal
          open={isUnitModalOpen}
          onClose={closeUnitModal}
          title={editingUnit ? "Editar unidad de medida" : "Nueva unidad de Medida"}
          footer={
            <>
              <Button onClick={closeUnitModal} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={!unitName.trim() || !unitAbbreviation.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  const payload = {
                    name: unitName.trim(),
                    abbreviation: unitAbbreviation.trim(),
                    allows_fractions: unitAllowsFractions,
                  };
                  if (editingUnit) {
                    updateMutation.mutate({ id: editingUnit.id, payload });
                  } else {
                    createMutation.mutate(payload);
                  }
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <Input
              label="Nombre"
              onChange={(e) => setUnitName(e.target.value)}
              value={unitName}
              required
            />
            <Input
              label="Abreviatura"
              onChange={(e) => setUnitAbbreviation(e.target.value)}
              value={unitAbbreviation}
              required
            />
            <Toggle checked={unitAllowsFractions} label="Permite fracciones (Ej. 1.5 kg)" onChange={setUnitAllowsFractions} />
          </div>
        </Modal>
      )}

      {confirmDeleteId && (
        <Modal
          open={confirmDeleteId !== null}
          onClose={() => setConfirmDeleteId(null)}
          title="Confirmar eliminación"
          footer={
            <>
              <Button onClick={() => setConfirmDeleteId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirmDeleteId) {
                    deleteMutation.mutate(confirmDeleteId);
                  }
                }}
                variant="danger"
              >
                Eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">
            ¿Estás seguro de eliminar esta unidad de medida? Esta acción no se puede deshacer y fallará si hay productos asociados a ella.
          </p>
        </Modal>
      )}
    </div>
  );
}
