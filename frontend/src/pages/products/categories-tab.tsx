import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Category } from "../../api/products";
import { createCategory, deactivateCategory, listCategories, updateCategory } from "../../api/products";
import { qk } from "../../api/query-keys";
import { useCan } from "../../components/auth/require-permission";
import { Badge, Button, EmptyState, ErrorState, Input, Modal, SkeletonTable, Table, Tooltip, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { textareaClass } from "./styles";

export function CategoriesTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);

  const categoriesQuery = useQuery({
    queryKey: qk.categories(),
    queryFn: listCategories,
  });

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      closeCategoryModal();
      toast.success("Categoría creada con éxito.");
    },
    onError: () => {
      toast.error("Error al crear la categoría.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name: string; description?: string } }) =>
      updateCategory(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      closeCategoryModal();
      toast.success("Categoría actualizada con éxito.");
    },
    onError: () => {
      toast.error("Error al actualizar la categoría.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      toast.success("Categoría desactivada con éxito.");
    },
    onError: () => {
      toast.error("Error al desactivar la categoría.");
    },
  });

  function openCreateModal() {
    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryDescription("");
    setIsCategoryModalOpen(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryDescription(category.description ?? "");
    setIsCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryDescription("");
    setIsCategoryModalOpen(false);
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl text-text">Categorías</h2>
          <p className="text-sm text-ink-2">Clasificación de productos</p>
        </div>
        {can("productos:crear") ? (
          <Button icon={<Plus size={16} />} onClick={openCreateModal}>
            Nueva categoría
          </Button>
        ) : null}
      </div>

      {categoriesQuery.isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : categoriesQuery.isError ? (
        <ErrorState onRetry={() => void categoriesQuery.refetch()} />
      ) : (
        <Table>
            <caption className="sr-only">Tabla de categorías</caption>
            <thead>
              <tr>
                <th className={tableHeadClass}>Categoría</th>
                <th className={tableHeadClass}>Descripción</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr className={tableRowClass} key={category.id}>
                  <td className={tableCellClass}>
                    <div className="font-semibold text-text">{category.name}</div>
                  </td>
                  <td className={tableCellClass}>
                    <span className="text-sm text-ink-2">{category.description ?? "—"}</span>
                  </td>
                  <td className={tableCellClass}>
                    <Badge dot tone={category.is_active ? "success" : "danger"}>
                      {category.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex gap-2">
                      {can("productos:editar") ? (
                        <Tooltip content="Editar">
                          <Button
                            aria-label={`Editar ${category.name}`}
                            className="h-11 w-11 px-0"
                            onClick={() => openEditModal(category)}
                            variant="secondary"
                          >
                            <Edit aria-hidden="true" size={17} />
                          </Button>
                        </Tooltip>
                      ) : null}
                      {can("productos:desactivar") ? (
                        <Tooltip content="Desactivar">
                          <Button
                            aria-label={`Desactivar ${category.name}`}
                            className="h-11 w-11 px-0 hover:text-bad"
                            disabled={!category.is_active}
                            onClick={() => setConfirmDeactivateId(category.id)}
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
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<Tag size={32} />}
                      message="Sin categorías registradas."
                      actionLabel="Nueva categoría"
                      onAction={openCreateModal}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
      )}

      {isCategoryModalOpen && (
        <Modal
          open={isCategoryModalOpen}
          onClose={closeCategoryModal}
          title={editingCategory ? "Editar categoría" : "Nueva categoría"}
          footer={
            <>
              <Button onClick={closeCategoryModal} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={!newCategoryName.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  if (editingCategory) {
                    updateMutation.mutate({
                      id: editingCategory.id,
                      payload: { name: newCategoryName.trim(), description: newCategoryDescription.trim() || undefined }
                    });
                  } else {
                    createMutation.mutate({
                      name: newCategoryName.trim(),
                      description: newCategoryDescription.trim() || undefined
                    });
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
              onChange={(e) => setNewCategoryName(e.target.value)}
              value={newCategoryName}
              required
            />
            <label className="grid gap-1.5 text-sm font-medium text-ink-2">
              <span>Descripción (Opcional)</span>
              <textarea
                className={textareaClass}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                value={newCategoryDescription}
              />
            </label>
          </div>
        </Modal>
      )}

      {confirmDeactivateId && (
        <Modal
          open={confirmDeactivateId !== null}
          onClose={() => setConfirmDeactivateId(null)}
          title="Confirmar desactivación"
          footer={
            <>
              <Button onClick={() => setConfirmDeactivateId(null)} variant="secondary">
                Cancelar
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  if (confirmDeactivateId) {
                    deactivateMutation.mutate(confirmDeactivateId, {
                      onSuccess: () => setConfirmDeactivateId(null),
                    });
                  }
                }}
                variant="danger"
              >
                Desactivar
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">
            La categoría será desactivada. Los productos existentes mantendrán su relación pero no aparecerá para nuevos registros.
          </p>
        </Modal>
      )}
    </div>
  );
}
