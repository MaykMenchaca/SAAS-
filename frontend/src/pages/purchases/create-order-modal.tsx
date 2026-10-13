import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";

import type { Product } from "../../api/products";
import { listProducts } from "../../api/products";
import type { CreateOrderPayload } from "../../api/purchases";
import { createOrder, listSuppliers } from "../../api/purchases";
import { qk } from "../../api/query-keys";
import { Button, Input, Modal, Select, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatCurrency } from "../../lib/formatters";
import { apiErrorMessage, cellInputClass } from "./helpers";

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

/** Nueva orden de compra. El proveedor es opcional (orden sin proveedor). */
export function CreateOrderModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const suppliersQuery = useQuery({ queryKey: qk.suppliers(), queryFn: () => listSuppliers() });
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [lines, setLines] = useState<OrderLineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // La búsqueda de productos espera 300 ms tras la última tecla
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(productSearch), 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const productsQuery = useQuery({
    queryKey: qk.orderProducts(debouncedSearch),
    queryFn: () => listProducts({ page: 1, perPage: 30, search: debouncedSearch }),
    enabled: debouncedSearch.length > 0,
  });

  function addProduct(product: Product) {
    if (lines.some((l) => l.product_id === product.id)) return;
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

  // Vista previa: el servidor calcula y manda sobre el subtotal, el IVA y el total finales
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost), 0);
  const taxTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) * Number(l.unit_cost) * Number(l.tax_rate)) / 100, 0);
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

  const errorMessage = apiErrorMessage(orderMutation.error, "No se pudo crear la orden.");
  const suppliers = suppliersQuery.data?.items.filter((s) => s.is_active) ?? [];
  const searchResults = productsQuery.data?.items ?? [];

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">Cancelar</Button>
          <Button disabled={lines.length === 0 || orderMutation.isPending} form="create-order-form" type="submit">
            {orderMutation.isPending ? "Creando..." : "Crear orden"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title="Nueva orden de compra"
    >
      <form className="grid gap-4" id="create-order-form" onSubmit={handleSubmit}>
        <Select
          label="Proveedor"
          name="supplier_id"
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Ninguno / Sin proveedor"
          value={supplierId}
        />

        <div className="grid gap-1.5">
          <Input
            icon={<Search aria-hidden="true" size={16} />}
            label="Agregar productos"
            name="product_search"
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            type="text"
            value={productSearch}
          />
          {debouncedSearch.length > 0 && searchResults.length > 0 ? (
            <div className="max-h-40 overflow-auto border border-divider bg-bg">
              {searchResults.map((product) => (
                <button
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-line-soft px-3 py-2 text-left text-sm last:border-b-0 hover:bg-acc-tint"
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

        {lines.length > 0 ? (
          <div className="max-h-56 overflow-auto">
            <Table>
              <caption className="sr-only">Partidas de la orden</caption>
              <thead>
                <tr>
                  <th className={tableHeadClass}>Producto</th>
                  <th className={cn(tableHeadClass, tableNumClass)}>Cant.</th>
                  <th className={cn(tableHeadClass, tableNumClass)}>Costo u.</th>
                  <th className={cn(tableHeadClass, tableNumClass)}>IVA %</th>
                  <th className={cn(tableHeadClass, tableNumClass)}>Subtotal</th>
                  <th className={tableHeadClass}>
                    <span className="sr-only">Quitar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr className={tableRowClass} key={line.id}>
                    <td className={tableCellClass}>
                      <div className="text-sm font-medium">{line.product_name}</div>
                      <div className="font-mono text-xs text-ink-2">{line.product_sku}</div>
                    </td>
                    <td className={cn(tableCellClass, tableNumClass)}>
                      <input
                        aria-label={`Cantidad de ${line.product_name}`}
                        className={cellInputClass}
                        min="0.001"
                        onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                        step="any"
                        type="number"
                        value={line.quantity}
                      />
                    </td>
                    <td className={cn(tableCellClass, tableNumClass)}>
                      <input
                        aria-label={`Costo unitario de ${line.product_name}`}
                        className={cellInputClass}
                        min="0.01"
                        onChange={(e) => updateLine(line.id, "unit_cost", e.target.value)}
                        step="0.01"
                        type="number"
                        value={line.unit_cost}
                      />
                    </td>
                    <td className={cn(tableCellClass, tableNumClass)}>
                      <input
                        aria-label={`IVA de ${line.product_name}`}
                        className={cellInputClass}
                        min="0"
                        onChange={(e) => updateLine(line.id, "tax_rate", e.target.value)}
                        step="0.01"
                        type="number"
                        value={line.tax_rate}
                      />
                    </td>
                    <td className={cn(tableCellClass, tableNumClass, "font-medium")}>
                      {formatCurrency(Number(line.quantity) * Number(line.unit_cost))}
                    </td>
                    <td className={tableCellClass}>
                      <Button
                        aria-label={`Quitar ${line.product_name}`}
                        onClick={() => removeLine(line.id)}
                        variant="icon"
                      >
                        <X aria-hidden="true" size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="border border-dashed border-field-border p-4 text-center text-sm text-ink-2">
            Busca y agrega productos a la orden
          </div>
        )}

        {lines.length > 0 ? (
          <dl className="grid gap-1 border border-divider px-3 py-2 text-sm">
            <div className="flex justify-between text-ink-2"><dt>Subtotal</dt><dd className="tabular-nums">{formatCurrency(subtotal)}</dd></div>
            <div className="flex justify-between text-ink-2"><dt>IVA</dt><dd className="tabular-nums">{formatCurrency(taxTotal)}</dd></div>
            <div className="flex items-baseline justify-between">
              <dt className="font-heading text-lg font-semibold">Total</dt>
              <dd className="font-heading text-2xl font-semibold tabular-nums">{formatCurrency(grandTotal)}</dd>
            </div>
          </dl>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha esperada" name="expected_date" onChange={(e) => setExpectedDate(e.target.value)} type="date" value={expectedDate} />
          <Input label="Notas" name="notes" onChange={(e) => setNotes(e.target.value)} value={notes} />
        </div>

        {errorMessage ? (
          <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">{errorMessage}</div>
        ) : null}
      </form>
    </Modal>
  );
}
