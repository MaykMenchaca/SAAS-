import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { PurchaseOrder } from "../../api/purchases";
import { formatCurrency, formatStock } from "../../lib/formatters";
import { formatShortDate, statusLabel } from "./helpers";

// Vista imprimible: se monta fuera de #root (en <body>) y, al imprimir, es lo único visible.
// Siempre en negro sobre blanco, sin importar el tema. Sin dependencias.
const printCss = `
@media screen { [data-print-root] { display: none; } }
@media print {
  body > *:not([data-print-root]) { display: none !important; }
  [data-print-root] { display: block; color: black; background: white; padding: 24px; font-family: sans-serif; font-size: 12px; }
  [data-print-root] h1 { font-size: 22px; margin: 0 0 4px; }
  [data-print-root] table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  [data-print-root] th, [data-print-root] td { border-bottom: 1px solid black; padding: 6px 4px; text-align: left; }
  [data-print-root] .num { text-align: right; font-variant-numeric: tabular-nums; }
  [data-print-root] .totals { margin: 16px 0 0 auto; width: 260px; }
  [data-print-root] .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
}
`;

/** Abre el diálogo de impresión del navegador con la orden de compra y avisa al terminar. */
export function PrintOrder({ onDone, order }: { onDone: () => void; order: PurchaseOrder }) {
  // El callback puede cambiar en cada render: se guarda en un ref para imprimir solo una vez
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    function handleAfterPrint() {
      doneRef.current();
    }
    window.addEventListener("afterprint", handleAfterPrint);
    // Un tick para que el portal ya esté en el DOM antes de abrir el diálogo
    const timer = setTimeout(() => {
      if (typeof window.print === "function") window.print();
      // Algunos navegadores no emiten afterprint: desmontamos de todos modos al volver del diálogo
      doneRef.current();
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  return createPortal(
    <div data-print-root="">
      <style>{printCss}</style>
      <h1>Orden de compra {order.folio}</h1>
      <p>
        Proveedor: {order.supplier_name} · Estado: {statusLabel(order.status)}
      </p>
      <p>
        Creada: {formatShortDate(order.created_at)} · Esperada: {formatShortDate(order.expected_date)} · Elaboró: {order.username}
      </p>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU</th>
            <th className="num">Pedido</th>
            <th className="num">Recibido</th>
            <th className="num">Costo u.</th>
            <th className="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>{item.product_name}</td>
              <td>{item.product_sku}</td>
              <td className="num">{formatStock(item.quantity)}</td>
              <td className="num">{formatStock(item.received_quantity)}</td>
              <td className="num">{formatCurrency(item.unit_cost)}</td>
              <td className="num">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totals">
        <div>
          <span>Subtotal</span>
          <span>{formatCurrency(order.subtotal)}</span>
        </div>
        <div>
          <span>IVA</span>
          <span>{formatCurrency(order.tax_total)}</span>
        </div>
        <div>
          <strong>Total</strong>
          <strong>{formatCurrency(order.total)}</strong>
        </div>
      </div>
      {order.notes ? <p>Notas: {order.notes}</p> : null}
    </div>,
    document.body,
  );
}
