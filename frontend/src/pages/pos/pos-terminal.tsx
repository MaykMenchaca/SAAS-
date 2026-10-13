import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { toast } from "sonner";

import type { Product } from "../../api/products";
import { fetchPosCatalog, getProductByCode } from "../../api/products";
import { qk } from "../../api/query-keys";
import type { Sale } from "../../api/sales";
import { Button, Kbd, Modal } from "../../components/ui";
import { useCan } from "../../components/auth/require-permission";
import { useCommandPalette } from "../../components/layout/command-palette-context";
import { useBarcodeScanner } from "../../hooks/useBarcodeScanner";
import { findByCodeOffline, loadCatalog, saveCatalog } from "../../lib/offline-catalog";
import { formatCurrency } from "../../lib/formatters";
import { useAuthStore } from "../../stores/auth-store";
import { useConnectionStore } from "../../stores/connection-store";
import { getCartTotals, usePosStore } from "../../stores/pos-store";
import { CatalogPanel } from "./catalog-panel";
import type { Feedback } from "./catalog-panel";
import { OfflineBanner } from "./offline-banner";
import type { PayMethod } from "./payment-math";
import { PaymentModal } from "./payment-modal";
import { TicketPanel } from "./ticket-panel";
import { TicketPreviewModal } from "./ticket-preview";
import { useCatalog } from "./use-catalog";

const IDLE_FEEDBACK: Feedback = { tone: "info", message: "Escanea con el lector o escribe y presiona Enter para agregar." };

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/** Búsqueda exacta por código de barras o SKU; sin servidor, en la copia local (OPS-14, OPS-23). */
async function findProductByCode(code: string): Promise<{ product: Product | null; offline: boolean; error?: string }> {
  try {
    // Sin servidor (según el ping a /api/health), directo a la copia local, sin esperar timeout (OPS-23)
    if (!useConnectionStore.getState().serverReachable) throw new Error("sin servidor");
    return { product: await getProductByCode(code), offline: false };
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      if (err.response.status !== 404) {
        return { product: null, offline: false, error: err.response.data?.error ?? "Error al procesar la lectura del código." };
      }
      return { product: null, offline: false };
    }
    return { product: findByCodeOffline(code), offline: true };
  }
}

/** Terminal de venta (diseño Industry): catálogo a la izquierda, ticket y cobro a la derecha. */
export function PosTerminal() {
  const sessionId = usePosStore((s) => s.sessionId)!;
  const sessionName = usePosStore((s) => s.sessionName);
  const cart = usePosStore((s) => s.cart);
  const addToCart = usePosStore((s) => s.addToCart);
  const clearSession = usePosStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const commandPalette = useCommandPalette();

  const [showPayment, setShowPayment] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [ticketSaleId, setTicketSaleId] = useState<number | null>(null);
  // "Crédito" está fuera del MVP: no se ofrece (H-53)
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>("efectivo");
  const [confirmClearCart, setConfirmClearCart] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [feedback, setFeedback] = useState<Feedback>(IDLE_FEEDBACK);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Marca de tiempo del último código leído por el lector: evita procesar dos veces el mismo Enter. */
  const scanHandledAt = useRef(0);

  const totals = getCartTotals(cart);
  const catalog = useCatalog(search, categoryId);
  const cartQty = Object.fromEntries(cart.map((c) => [c.product_id, c.quantity]));

  // Copia local del catálogo: se refresca cada 10 min mientras haya servidor (OPS-02)
  const catalogQuery = useQuery({
    queryKey: qk.posCatalog(),
    queryFn: fetchPosCatalog,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    void loadCatalog();
  }, []);
  useEffect(() => {
    if (catalogQuery.data) void saveCatalog(catalogQuery.data.generated_at, catalogQuery.data.items);
  }, [catalogQuery.data]);

  function addProduct(product: Product, message?: string) {
    addToCart({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      unit_price: product.sale_price,
      tax_rate: product.tax_rate,
      unit_abbreviation: product.unit?.abbreviation ?? "pz",
      allows_fractions: product.unit?.allows_fractions,
    });
    setLastSale(null);
    setFeedback({ tone: "ok", message: message ?? `Agregado: ${product.name} · ${formatCurrency(product.sale_price)}` });
  }

  function handleProductSelect(product: Product) {
    if (product.stock_qty !== undefined && product.stock_qty !== null && Number(product.stock_qty) <= 0) {
      setFeedback({ tone: "bad", message: `${product.name} está agotado.` });
      return;
    }
    addProduct(product);
  }

  // Lector de código de barras global: búsqueda exacta; sin servidor, en el catálogo local
  useBarcodeScanner(async (barcode) => {
    scanHandledAt.current = Date.now();
    setSearch("");
    const { product, offline, error } = await findProductByCode(barcode);
    if (error) {
      setFeedback({ tone: "bad", message: error });
      return;
    }
    if (!product) {
      setFeedback({ tone: "bad", message: `Producto no registrado: ${barcode}` });
      return;
    }
    addProduct(product, offline ? `Escaneado sin conexión: ${product.name}` : `Escaneado: ${product.name}`);
  });

  /** Enter en el buscador: código o SKU exacto, o la única coincidencia por nombre. */
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const query = search.trim();
    if (!query) return;
    // El lector de código también termina con Enter: si ya lo atendió, no se procesa otra vez
    window.setTimeout(async () => {
      if (Date.now() - scanHandledAt.current < 300) return;
      const { product, error } = await findProductByCode(query);
      if (error) {
        setFeedback({ tone: "bad", message: error });
        return;
      }
      const hit = product ?? (catalog.products.length === 1 ? catalog.products[0] : null);
      if (hit) {
        handleProductSelect(hit);
        setSearch("");
      } else {
        setFeedback({
          tone: "bad",
          message: catalog.products.length ? `${catalog.products.length} coincidencias: elige una en el catálogo.` : `Producto no registrado: ${query}`,
        });
      }
    }, 0);
  }

  /** Vaciar el ticket: con más de 3 artículos pide confirmación (H-30). */
  function requestClearCart() {
    if (cart.length > 3) {
      setConfirmClearCart(true);
    } else {
      usePosStore.getState().clearCart();
      setFeedback({ tone: "info", message: "Ticket vaciado." });
    }
  }

  // F2 = buscar, F5 = cobrar, F8 = último ticket, Esc = vaciar el ticket
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent | globalThis.KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F5" && cart.length > 0) {
        e.preventDefault();
        setShowPayment(true);
      } else if (e.key === "F8" && lastSale && lastSale.id > 0) {
        // Las ventas offline (id negativo) no existen en el servidor: no hay ticket que pedir.
        e.preventDefault();
        setTicketSaleId(lastSale.id);
      } else if (e.key === "Escape" && !showPayment && !confirmClearCart && cart.length > 0) {
        // Esc dentro de un campo o con la paleta abierta no vacía el ticket (H-30)
        if (commandPalette.open || isEditableElement(document.activeElement)) return;
        e.preventDefault();
        requestClearCart();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // requestClearCart solo depende de cart.length, ya incluido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, showPayment, lastSale, confirmClearCart, commandPalette.open]);

  return (
    <div className="grid md:h-[calc(100dvh-4rem)] md:grid-cols-[minmax(0,1fr)_clamp(340px,32vw,420px)]">
      <div className="flex min-h-0 min-w-0 flex-col max-md:max-h-[85dvh]">
        <OfflineBanner />
        <CatalogPanel
          cartQty={cartQty}
          catalog={catalog.catalog}
          categories={catalog.categories}
          categoryId={categoryId}
          feedback={feedback}
          inputRef={searchRef}
          isLoading={catalog.isLoading}
          onCategory={setCategoryId}
          onSearchChange={setSearch}
          onSearchKeyDown={handleSearchKeyDown}
          onSelect={handleProductSelect}
          products={catalog.products}
          search={search}
          serverDown={catalog.serverDown}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-x-[18px] gap-y-1 border-t border-divider px-4 py-2.5 text-[0.8125rem] text-ink-2 sm:px-6">
          {[
            ["F2", "Buscar"],
            ["F5", "Cobrar"],
            ["F8", "Último ticket"],
            ["Esc", "Vaciar"],
          ].map(([key, label]) => (
            <span className="flex items-center gap-1.5" key={key}>
              <Kbd aria-hidden="true" className="text-text">{key}</Kbd>
              {label}
            </span>
          ))}
          <Button className="ml-auto text-ink-2" onClick={clearSession} size="sm" variant="ghost">
            <LogOut aria-hidden="true" size={15} />
            Salir del POS
          </Button>
        </div>
      </div>

      <TicketPanel
        canDiscount={can("ventas:descuento")}
        cart={cart}
        cashierName={user?.full_name ?? user?.username ?? "Cajero"}
        lastSale={lastSale}
        method={paymentMethod}
        onClear={requestClearCart}
        onMethod={setPaymentMethod}
        onPay={() => setShowPayment(true)}
        onPrintLast={() => lastSale && lastSale.id > 0 && setTicketSaleId(lastSale.id)}
        sessionName={sessionName ?? "Caja"}
      />

      {showPayment ? (
        <PaymentModal
          defaultMethod={paymentMethod}
          onClose={() => setShowPayment(false)}
          onSuccess={(sale) => {
            setLastSale(sale);
            setShowPayment(false);
            setFeedback(IDLE_FEEDBACK);
            toast.success("Venta completada", {
              description: `Folio: ${sale.folio} — Total: ${formatCurrency(sale.total)}`,
            });
            searchRef.current?.focus();
          }}
          sessionId={sessionId}
          total={totals.total}
        />
      ) : null}

      {ticketSaleId ? <TicketPreviewModal onClose={() => setTicketSaleId(null)} saleId={ticketSaleId} /> : null}

      {confirmClearCart ? (
        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmClearCart(false)} variant="secondary">
                Conservar
              </Button>
              <Button
                onClick={() => {
                  usePosStore.getState().clearCart();
                  setConfirmClearCart(false);
                  setFeedback({ tone: "info", message: "Ticket vaciado." });
                }}
                variant="danger"
              >
                Vaciar ticket
              </Button>
            </>
          }
          onClose={() => setConfirmClearCart(false)}
          open
          title="¿Vaciar el ticket?"
        >
          <p className="text-ink-2">Se quitarán los {cart.length} artículos del ticket actual.</p>
        </Modal>
      ) : null}
    </div>
  );
}
