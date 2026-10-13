import type { ConfigMap } from "../../api/config";
import { Card } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { PREVIEW_SUBTOTAL_CENTS, previewTaxCents } from "./format";

const SAMPLE_LINES = [
  { qty: 1, name: "Cemento gris 50 kg", cents: 25900 },
  { qty: 1, name: 'Brocha 3" cerda natural', cents: 5400 },
  { qty: 1, name: "Cinta de aislar 19 mm", cents: 1800 },
];

/** Vista previa del ticket que se actualiza al escribir (los importes son de ejemplo). */
export function TicketPreview({ config }: { config: ConfigMap }) {
  const taxCents = previewTaxCents(config.default_tax_rate ?? "");
  const rate = config.default_tax_rate?.trim() || "0";
  const contact = [
    config.company_phone ? `Tel. ${config.company_phone}` : "",
    config.company_rfc ? `RFC ${config.company_rfc}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-2.5">
      <h2 className="font-heading text-sm font-semibold uppercase tracking-widest text-ink-2">Vista previa del ticket</h2>
      <Card aria-label="Vista previa del ticket" className="grid gap-2.5 p-5 text-sm leading-snug [font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]" frame>
        <div className="text-center">
          <div className="font-heading text-xl font-semibold" data-testid="preview-name">{config.company_name || "Mi Negocio"}</div>
          {config.company_address ? <div className="text-ink-2">{config.company_address}</div> : null}
          {contact ? <div className="text-ink-2">{contact}</div> : null}
        </div>
        <div className="flex justify-between border-t border-dashed border-divider pt-2 text-ink-2">
          <span>V-20261011-0048</span>
          <span>11/10/2026 14:52</span>
        </div>
        <div className="grid gap-1 border-t border-dashed border-divider pt-2 tabular-nums">
          {SAMPLE_LINES.map((line) => (
            <div className="flex justify-between gap-3" key={line.name}>
              <span>{line.qty} {line.name}</span>
              <span>{formatCurrency(line.cents / 100)}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-0.5 border-t border-dashed border-divider pt-2 tabular-nums">
          <div className="flex justify-between text-ink-2">
            <span>Subtotal</span>
            <span>{formatCurrency(PREVIEW_SUBTOTAL_CENTS / 100)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>IVA {rate}%</span>
            <span data-testid="preview-tax">{formatCurrency(taxCents / 100)}</span>
          </div>
          <div className="flex justify-between font-heading text-lg font-semibold">
            <span>TOTAL</span>
            <span data-testid="preview-total">{formatCurrency((PREVIEW_SUBTOTAL_CENTS + taxCents) / 100)}</span>
          </div>
        </div>
        {config.ticket_footer ? (
          <div className="border-t border-dashed border-divider pt-2 text-center text-ink-2">{config.ticket_footer}</div>
        ) : null}
      </Card>
    </div>
  );
}
