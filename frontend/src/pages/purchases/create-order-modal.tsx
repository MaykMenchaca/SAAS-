import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Search, X } from "lucide-react";

import type { Product } from "../../api/products";
import { listProducts } from "../../api/products";
import type { CreateOrderPayload } from "../../api/purchases";
import { createOrder, listSuppliers } from "../../api/purchases";
import { Button, Input, Modal, Select, Table, tableCellClass, tableHeadClass, tableRowClass } from "../../components/ui";
import { qk } from "../../api/query-keys";

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

export function CreateOrderModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const suppliersQuery = useQuery({ queryKey: qk.suppliers(), queryFn: () => listSuppliers() });
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

  const suppliers = suppliersQuery.data?.items.filter((s) => s.is_active) ?? [];
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
          <span className="text-sm font-medium text-text">Agregar productos</span>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 text-ink-2" size={16} />
            <input
              className="w-full border border-divider bg-bg py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              type="text"
              value={productSearch}
            />
          </div>
          {debouncedSearch.length > 0 && searchResults.length > 0 ? (
            <div className="max-h-40 overflow-auto border border-divider bg-bg">
              {searchResults.map((product) => (
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/5"
                  key={product.id}
                  onClick={() => addProduct(product)}
                  type="button"
                >
                  <span className="font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-ink-2">{product.sku}</span>
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
                        <div className="font-mono text-xs text-ink-2">{line.product_sku}</div>
                      </td>
                      <td className={tableCellClass}>
                        <input
                          className="w-16 border border-divider bg-bg px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                          min="0.001"
                          onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                          step="any"
                          type="number"
                          value={line.quantity}
                        />
                      </td>
                      <td className={tableCellClass}>
                        <input
                          className="w-20 border border-divider bg-bg px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                          min="0.01"
                          onChange={(e) => updateLine(line.id, "unit_cost", e.target.value)}
                          step="0.01"
                          type="number"
                          value={line.unit_cost}
                        />
                      </td>
                      <td className={tableCellClass}>
                        <input
                          className="w-16 border border-divider bg-bg px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                          min="0"
                          onChange={(e) => updateLine(line.id, "tax_rate", e.target.value)}
                          step="0.01"
                          type="number"
                          value={line.tax_rate}
                        />
                      </td>
                      <td className={`${tableCellClass} text-right font-mono font-semibold`}>${lineSub}</td>
                      <td className={tableCellClass}>
                        <button className="text-ink-2 hover:text-bad" onClick={() => removeLine(line.id)} type="button">
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
          <div className="border border-dashed border-divider p-4 text-center text-sm text-ink-2">
            Busca y agrega productos a la orden
          </div>
        )}

        {/* Totals */}
        {lines.length > 0 ? (
          <div className="border border-divider bg-bg px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-2">Subtotal</span><span className="font-mono">${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-ink-2">IVA</span><span className="font-mono">${taxTotal.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-divider pt-1 font-bold"><span>Total</span><span className="font-mono">${grandTotal.toFixed(2)}</span></div>
          </div>
        ) : null}

        {/* Optional fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha esperada" name="expected_date" onChange={(e) => setExpectedDate(e.target.value)} type="date" value={expectedDate} />
          <Input label="Notas" name="notes" onChange={(e) => setNotes(e.target.value)} value={notes} />
        </div>

        {errorMessage ? (
          <div className="border border-bad/30 bg-bad/10 px-3 py-2 text-sm font-medium text-bad" role="alert">{errorMessage}</div>
        ) : null}
      </form>
    </Modal>
  );
}
