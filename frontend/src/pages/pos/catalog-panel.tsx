import { CircleAlert, CircleCheck, Info, ScanBarcode, X } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

import type { Category, Product } from "../../api/products";
import { Badge, Button, Corners, EmptyState, FilterChip, Kbd, Toast } from "../../components/ui";
import { formatCurrency } from "../../lib/formatters";
import { cn } from "../../lib/cn";
import { formatQty } from "./cart-helpers";

export type Feedback = { tone: "ok" | "bad" | "info"; message: string };

/** Tinte de acento apoyado sobre el fondo opaco de la página. Las clases van COMPLETAS (Tailwind no ve las que se arman con plantillas). */
const TINT_ON_BG = "[background:linear-gradient(var(--color-acc-tint),var(--color-acc-tint)),var(--color-bg)]";
const TINT_ON_BG_HOVER = "bg-bg hover:[background:linear-gradient(var(--color-acc-tint),var(--color-acc-tint)),var(--color-bg)]";

const FEEDBACK_STYLES = {
  ok: { icon: CircleCheck, className: "text-ok" },
  bad: { icon: CircleAlert, className: "text-bad" },
  info: { icon: Info, className: "text-ink-2" },
} as const;

type CatalogPanelProps = {
  catalog: { generatedAt: Date; stale: boolean } | null;
  categories: Category[];
  categoryId: number | undefined;
  /** Cantidad de cada producto que ya está en el ticket (product_id → cantidad). */
  cartQty: Record<number, number>;
  feedback: Feedback;
  inputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  onCategory: (id: number | undefined) => void;
  onSearchChange: (value: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (product: Product) => void;
  products: Product[];
  search: string;
  serverDown: boolean;
};

/** Lado izquierdo del POS: escanear o buscar, categorías y catálogo (diseño Industry, subfases 4.2 a 4.4). */
export function CatalogPanel({
  catalog,
  categories,
  categoryId,
  cartQty,
  feedback,
  inputRef,
  isLoading,
  onCategory,
  onSearchChange,
  onSearchKeyDown,
  onSelect,
  products,
  search,
  serverDown,
}: CatalogPanelProps) {
  const FeedbackIcon = FEEDBACK_STYLES[feedback.tone].icon;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/* Escanear o buscar */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-divider px-4 pb-4 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-heading text-sm font-semibold uppercase tracking-[0.1em] text-ink-2">Escanear o buscar</span>
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[0.8125rem] text-ink-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok" />
            Lector de código activo
          </span>
        </div>

        <label className="blueprint flex h-16 cursor-text items-center gap-3.5 border-accent bg-surface px-4">
          <Corners />
          <ScanBarcode aria-hidden="true" className="shrink-0 text-accent" size={26} />
          <input
            aria-label="Buscar producto por nombre, SKU o código de barras"
            autoComplete="off"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[1.375rem] text-text outline-none placeholder:text-ink-2"
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Escanea el código o escribe nombre, SKU…"
            ref={inputRef}
            type="text"
            value={search}
          />
          {search ? (
            <Button aria-label="Limpiar búsqueda" className="h-9 min-h-0 w-9 px-0 text-ink-2" onClick={() => onSearchChange("")} variant="ghost">
              <X aria-hidden="true" size={18} />
            </Button>
          ) : null}
          <Kbd aria-hidden="true" className="hidden sm:inline-flex">F2</Kbd>
        </label>

        <div aria-live="polite" className={cn("flex min-h-5 items-center gap-2 text-sm", FEEDBACK_STYLES[feedback.tone].className)} role="status">
          <FeedbackIcon aria-hidden="true" className="shrink-0" size={15} />
          <span className="min-w-0 truncate">{feedback.message}</span>
        </div>
      </div>

      {/* Categorías */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-divider px-4 py-3 sm:px-6">
        <FilterChip active={categoryId === undefined} label="Todos" onClick={() => onCategory(undefined)} />
        {categories.map((category) => (
          <FilterChip active={categoryId === category.id} key={category.id} label={category.name} onClick={() => onCategory(category.id)} />
        ))}
      </div>

      {/* Catálogo */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {serverDown ? (
          <Toast className="mb-3 text-xs" tone="warning">
            {catalog
              ? `Sin conexión con el servidor: mostrando el catálogo guardado el ${catalog.generatedAt.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}.`
              : "Sin conexión con el servidor y sin catálogo guardado en este equipo."}{" "}
            {catalog?.stale
              ? "Tiene más de 24 horas: los precios pueden haber cambiado; confírmalos antes de cobrar con tarjeta o transferencia."
              : "Precios sujetos a confirmación al sincronizar."}
          </Toast>
        ) : null}

        {isLoading ? (
          <div className="py-12 text-center text-sm text-ink-2" role="status">Cargando catálogo…</div>
        ) : products.length === 0 ? (
          <EmptyState message={search.trim() ? `Sin productos para “${search.trim()}”. Revisa el código o busca por nombre.` : "Sin productos disponibles."} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-px border border-divider bg-divider">
            {products.map((product) => {
              // Los productos del catálogo local no traen existencias: no se marcan como agotados
              const stockKnown = product.stock_qty !== undefined && product.stock_qty !== null;
              const stock = Number(product.stock_qty ?? "0");
              const min = Number(product.min_stock ?? "0");
              const isOut = stockKnown && stock === 0;
              const isLow = stockKnown && !isOut && min > 0 && stock < min;
              const unit = product.unit?.abbreviation ?? "pz";
              const frac = Boolean(product.unit?.allows_fractions);
              const inCart = cartQty[product.id];

              return (
                <button
                  className={cn(
                    "flex min-h-[148px] flex-col gap-2 p-3.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                    // El tinte es translúcido y la cuadrícula tiene de fondo la línea divisoria: se apoya sobre el
                    // fondo opaco para que el contraste del texto sea el calculado (4.5:1)
                    inCart ? TINT_ON_BG : TINT_ON_BG_HOVER,
                  )}
                  disabled={isOut}
                  key={product.id}
                  onClick={() => onSelect(product)}
                  type="button"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-xs tracking-wide text-ink-2">{product.sku}</span>
                    {stockKnown ? (
                      <Badge className="min-h-6 shrink-0 px-2" tone={isOut ? "danger" : isLow ? "warning" : "neutral"}>
                        {isOut ? "Agotado" : `${formatQty(stock, frac)} ${unit}`}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-[0.9375rem] font-medium leading-snug [text-wrap:pretty]">{product.name}</div>
                  <div className="mt-auto flex w-full items-baseline justify-between">
                    <span className="font-heading text-2xl font-semibold tabular-nums">{formatCurrency(product.sale_price)}</span>
                    <span className="text-xs text-ink-2">/ {unit}</span>
                  </div>
                  {inCart ? <div className="text-xs font-medium text-acc-text">En ticket: {formatQty(inCart, frac)} {unit}</div> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
