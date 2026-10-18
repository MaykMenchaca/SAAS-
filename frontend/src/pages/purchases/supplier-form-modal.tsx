import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

import type { Supplier, SupplierCreatePayload } from "../../api/purchases";
import { Button, Input, Modal } from "../../components/ui";
import { apiErrorMessage } from "./helpers";

export function SupplierFormModal({
  error,
  errorAction,
  isLoading,
  onClose,
  onSubmit,
  supplier,
}: {
  error: Error | null;
  /** Acción junto al error (p. ej. "Reactivar proveedor" si el RFC es de uno inactivo, RF-21). */
  errorAction?: ReactNode;
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

  const errorMessage = apiErrorMessage(error, "No se pudo guardar.");

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={!form.name.trim() || isLoading} form="supplier-form" type="submit">
            {isLoading ? "Guardando..." : "Guardar"}
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
        <Input
          label="Condiciones de pago"
          name="payment_terms"
          onChange={(e) => setField("payment_terms", e.target.value)}
          placeholder="Ej. Crédito 30 días, Contado"
          value={form.payment_terms}
        />

        {errorMessage ? (
          <div className="grid gap-2 border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
            <span>{errorMessage}</span>
            {errorAction ? <div>{errorAction}</div> : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
