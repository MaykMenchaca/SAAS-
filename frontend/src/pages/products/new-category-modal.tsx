import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createCategory } from "../../api/products";
import { qk } from "../../api/query-keys";
import { Button, Input, Modal } from "../../components/ui";
import { alertClass, textareaClass } from "./styles";

type NewCategoryModalProps = {
  onClose: () => void;
  /** Se llama con el id de la categoría recién creada para seleccionarla en el formulario. */
  onCreated: (categoryId: number) => void;
};

/** Alta rápida de una categoría desde el formulario de producto. */
export function NewCategoryModal({ onClose, onCreated }: NewCategoryModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: qk.categories() });
      onCreated(category.id);
      onClose();
      toast.success("Categoría creada con éxito.");
    },
  });

  const canSubmit = Boolean(name.trim());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined });
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={!canSubmit || createMutation.isPending} form="category-create-form" type="submit">
            {createMutation.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Nueva categoría"
    >
      <form className="grid gap-4" id="category-create-form" onSubmit={handleSubmit}>
        <Input label="Nombre de la categoría" name="new-category-name" onChange={(e) => setName(e.target.value)} required value={name} />
        <label className="grid gap-1.5 text-sm font-medium text-ink-2">
          <span>Descripción (Opcional)</span>
          <textarea className={textareaClass} onChange={(e) => setDescription(e.target.value)} value={description} />
        </label>
        {createMutation.isError ? (
          <div className={alertClass} role="alert">
            Error al crear la categoría.
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
