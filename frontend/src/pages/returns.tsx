import type { FormEvent } from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, ScanBarcode } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { SaleReturn } from "../api/sales";
import { findSaleByFolio, listSales } from "../api/sales";
import { Button, Card, ErrorState, PageHeader, SkeletonTable, Table, tableCellClass, tableHeadClass, tableNumClass, tableRowClass } from "../components/ui";
import { qk } from "../api/query-keys";
import { formatCurrency } from "../lib/formatters";
import { ReturnReceipt } from "./returns/receipt";
import { ReturnWorkspace } from "./returns/return-workspace";
import { StepBar } from "./returns/step-bar";

// ── Página: tres pasos (buscar venta → seleccionar artículos → confirmación) ─────────────

export function ReturnsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const presetId = Number(searchParams.get("venta"));
  const [searchFolio, setSearchFolio] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(Number.isInteger(presetId) && presetId > 0 ? presetId : null);
  const [receipt, setReceipt] = useState<SaleReturn | null>(null);

  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);

  // Ventas recientes que todavía admiten devolución (completadas o con devolución parcial)
  const recentQuery = useQuery({
    queryKey: qk.salesHistory("devolvibles"),
    queryFn: () => listSales(1, 20, { status: "completada,devolucion_parcial" }),
  });
  const recent = recentQuery.data?.items ?? [];

  const step: 1 | 2 | 3 = receipt ? 3 : selectedSaleId !== null ? 2 : 1;

  function clearPreset() {
    if (searchParams.has("venta")) setSearchParams({}, { replace: true });
  }

  function restart() {
    clearPreset();
    setReceipt(null);
    setSelectedSaleId(null);
    setSearchFolio("");
    setSearchError("");
    void queryClient.invalidateQueries({ queryKey: qk.salesHistory() });
  }

  /** Busca el folio en todo el historial del servidor, no solo en las últimas 20 (FE-102). */
  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folio = searchFolio.trim();
    if (!folio) return;
    setSearchError("");
    setSearching(true);
    try {
      const found = await findSaleByFolio(folio);
      if (!found) {
        setSearchError(`No se encontró ninguna venta con el folio ${folio}.`);
      } else if (found.status === "cancelada" || found.status === "devolucion_total") {
        setSearchError(
          `La venta ${found.folio} ya no admite devoluciones (${found.status === "cancelada" ? "cancelada" : "devuelta por completo"}).`,
        );
      } else {
        setSelectedSaleId(found.id);
      }
    } catch {
      setSearchError("No se pudo buscar la venta. Revisa la conexión e intenta de nuevo.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        className="mb-0"
        subtitle="Busca la venta, elige qué regresa el cliente y registra el reembolso."
        title="Devoluciones"
      />

      <StepBar step={step} />

      {step === 1 ? (
        <div className="grid max-w-5xl gap-5">
          <form className="flex flex-wrap items-stretch gap-2.5" onSubmit={handleSearch}>
            <label className="blueprint flex min-h-14 min-w-0 flex-1 basis-72 items-center gap-3 border border-accent bg-surface px-3.5">
              <i aria-hidden="true" className="corner tl" />
              <i aria-hidden="true" className="corner tr" />
              <i aria-hidden="true" className="corner bl" />
              <i aria-hidden="true" className="corner br" />
              <ScanBarcode aria-hidden="true" className="shrink-0 text-accent" size={22} />
              <span className="sr-only">Buscar por folio</span>
              <input
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-lg tabular-nums text-text placeholder:text-ink-2 focus-visible:outline-none"
                name="folio"
                onChange={(e) => setSearchFolio(e.target.value)}
                placeholder="V-20261011-0001 · escanea el código del ticket"
                value={searchFolio}
              />
            </label>
            <Button disabled={searching || !searchFolio.trim()} size="lg" type="submit">
              {searching ? "Buscando..." : "Buscar venta"}
            </Button>
          </form>
          {searchError ? (
            <p className="text-sm font-medium text-bad" role="alert">
              {searchError}
            </p>
          ) : null}

          <section className="grid gap-3">
            <h2 className="text-xl">Ventas recientes que admiten devolución</h2>
            {recentQuery.isLoading ? (
              <SkeletonTable cols={5} rows={6} />
            ) : recentQuery.isError ? (
              <ErrorState onRetry={() => void recentQuery.refetch()} />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <caption className="sr-only">Tabla de ventas recientes</caption>
                  <thead>
                    <tr>
                      <th className={tableHeadClass}>Folio</th>
                      <th className={tableHeadClass}>Fecha</th>
                      <th className={tableHeadClass}>Cajero</th>
                      <th className={`${tableHeadClass} ${tableNumClass}`}>Total</th>
                      <th className={tableHeadClass}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((sale) => (
                      <tr className={tableRowClass} key={sale.id}>
                        <td className={`${tableCellClass} whitespace-nowrap font-medium tabular-nums text-acc-text`}>{sale.folio}</td>
                        <td className={`${tableCellClass} whitespace-nowrap text-ink-2`}>
                          {new Date(sale.created_at).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className={tableCellClass}>{sale.username}</td>
                        <td className={`${tableCellClass} ${tableNumClass} font-medium`}>{formatCurrency(sale.total)}</td>
                        <td className={`${tableCellClass} text-right`}>
                          <Button aria-label={`Devolver ${sale.folio}`} onClick={() => setSelectedSaleId(sale.id)} size="sm" variant="secondary">
                            Seleccionar
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {recent.length === 0 ? (
                      <tr>
                        <td className="px-3 py-10 text-center text-sm text-ink-2" colSpan={5}>
                          <CornerDownLeft aria-hidden="true" className="mx-auto mb-2 text-ink-2" size={32} />
                          Sin ventas completadas recientes.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </Table>
              </Card>
            )}
          </section>
        </div>
      ) : null}

      {step === 2 && selectedSaleId !== null ? (
        <ReturnWorkspace
          onBack={() => {
            clearPreset();
            setSelectedSaleId(null);
          }}
          onDone={(result) => {
            clearPreset();
            setReceipt(result);
          }}
          saleId={selectedSaleId}
        />
      ) : null}

      {step === 3 && receipt ? <ReturnReceipt onRestart={restart} result={receipt} /> : null}
    </div>
  );
}
