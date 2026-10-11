import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Banknote, Barcode, CreditCard, Delete, Droplet, Hammer, Landmark, Minus, Nut, Paintbrush, Plus, Printer, Search, ShoppingCart, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import type { Product } from "../api/products";
import { fetchPosCatalog, getProductByCode, listCategories, listProducts } from "../api/products";
import { previewSaleTicket, printResultMessage, printSaleTicket } from "../api/printing";
import type { Sale } from "../api/sales";
import type { CreateSalePayload, PaymentInput, SaleItemInput } from "../api/sales";
import { createSale, getSession, listCashRegisters, listSessions, openCashRegister, quoteSale } from "../api/sales";
import { Badge, Button, Card, Input, Modal } from "../components/ui";
import { useAuthStore } from "../stores/auth-store";
import type { CartItem } from "../stores/pos-store";
import { calcLineTotal, getCartTotals, usePosStore, sumPaymentsCents, toCents } from "../stores/pos-store";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { qk } from "../api/query-keys";
import { useCommandPalette } from "../components/layout/command-palette-context";
import { invalidateAfterSale } from "../api/invalidate";
import { catalogInfo, findByCodeOffline, loadCatalog, saveCatalog, searchOffline } from "../lib/offline-catalog";
import { useConnectionStore } from "../stores/connection-store";
import type { LucideProps } from "lucide-react";
import { formatCurrency } from "../lib/formatters";

// ── Main POS Page ──────────────────────────────────────────────────

export function PosPage() {
  const sessionId = usePosStore((s) => s.sessionId);
  const clearSession = usePosStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);

  // Validar al montar que la sesión de caja siga abierta y sea del usuario (H-18)
  const sessionQuery = useQuery({
    queryKey: qk.activePosSession(sessionId),
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
    staleTime: 10_000,
    // Sin reintentos por foco: con el servidor caído no debe interrumpir la venta en curso
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!sessionId || sessionQuery.isLoading || !sessionQuery.data) return;

    const session = sessionQuery.data;
    const isOwner = session.user_id === user?.id;
    const canSupervise = user?.role === "admin" || user?.permissions?.includes("caja:supervisar");

    if (session.status !== "abierta" || (!isOwner && !canSupervise)) {
      clearSession();
      toast.warning("La sesión de caja ya no está abierta o pertenece a otro usuario.");
    }
  }, [sessionId, sessionQuery.data, sessionQuery.isLoading, user?.id, user?.role, user?.permissions, clearSession]);

  useEffect(() => {
    // Solo se descarta la sesión si el servidor la rechazó (no existe o no es accesible).
    // Con la red caída, un timeout o un 5xx se conservan la sesión y el carrito (OPS-01, H-24).
    const status = sessionQuery.error instanceof AxiosError ? sessionQuery.error.response?.status : undefined;
    if (status === 404 || status === 403) {
      clearSession();
      toast.warning("La sesión de caja ya no existe o no tienes acceso a ella.");
    }
  }, [sessionQuery.error, clearSession]);

  if (!sessionId || (sessionId && sessionQuery.isLoading)) {
    if (sessionId && sessionQuery.isLoading) {
      return (
        <div className="flex h-full min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }
    return <SessionSelector />;
  }

  return <PosTerminal />;
}

// ── Session Selector ───────────────────────────────────────────────

function SessionSelector() {
  const user = useAuthStore((s) => s.user);
  const setSession = usePosStore((s) => s.setSession);
  const [openingAmount, setOpeningAmount] = useState("0.00");
  const [selectedRegisterId, setSelectedRegisterId] = useState<number | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState("");

  const sessionsQuery = useQuery({
    queryKey: qk.cashSessions("abierta"),
    // Solo las abiertas: la paginación no debe esconder la sesión del cajero
    queryFn: () => listSessions({ status: "abierta" }),
  });

  const registersQuery = useQuery({
    queryKey: qk.cashRegisters(),
    queryFn: listCashRegisters,
  });

  const canSupervise = user?.role === "admin" || user?.permissions?.includes("caja:supervisar");
  const openSessions = (sessionsQuery.data?.items ?? []).filter((s) => {
    if (s.status !== "abierta") return false;
    if (canSupervise) return true;
    return s.user_id === user?.id;
  });
  const registers = registersQuery.data ?? [];

  // Auto-select the first register when data loads
  useEffect(() => {
    if (registers.length > 0 && selectedRegisterId === null) {
      setSelectedRegisterId(registers[0].id);
    }
  }, [registers, selectedRegisterId]);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRegisterId) return;
    setError("");
    setIsOpening(true);
    try {
      const session = await openCashRegister(selectedRegisterId, openingAmount);
      setSession(session.id, session.cash_register_name);
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.error ?? "No se pudo abrir la caja.");
      } else {
        setError("No se pudo abrir la caja.");
      }
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-lg gap-6 py-12">
      <div className="text-center">
        <ShoppingCart aria-hidden="true" className="mx-auto mb-3 text-primary-text" size={48} />
        <h1 className="text-2xl font-bold text-neutral-text-primary">Punto de Venta</h1>
        <p className="text-sm text-neutral-text-secondary">Selecciona o abre una sesión de caja para comenzar</p>
      </div>

      {/* Existing open sessions */}
      {openSessions.length > 0 ? (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-neutral-text-primary">Sesiones abiertas</h2>
          <div className="grid gap-2">
            {openSessions.map((session) => (
              <button
                className="flex items-center justify-between rounded-md border border-neutral-border px-4 py-3 text-left transition-colors hover:bg-primary/5"
                key={session.id}
                onClick={() => setSession(session.id, session.cash_register_name)}
                type="button"
              >
                <div>
                  <div className="font-semibold text-neutral-text-primary">{session.cash_register_name}</div>
                  <div className="text-xs text-neutral-text-secondary">
                    {session.username} — Apertura: ${session.opening_amount}
                  </div>
                </div>
                <Badge tone="success">Abierta</Badge>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Open new session */}
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-neutral-text-primary">Abrir nueva sesión</h2>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary-text">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-text-primary">{user?.full_name ?? "Operador"}</p>
            <p className="text-xs text-neutral-text-secondary">{user?.role ?? "rol"}</p>
          </div>
        </div>
        <form className="grid gap-3" onSubmit={handleOpen}>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-text-primary" htmlFor="register-select">
              Caja registradora
            </label>
            <select
              className="w-full rounded-md border border-neutral-border bg-neutral-surface px-3 py-2 text-sm text-neutral-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={registersQuery.isLoading}
              id="register-select"
              onChange={(e) => setSelectedRegisterId(Number(e.target.value))}
              value={selectedRegisterId ?? ""}
            >
              {registersQuery.isLoading ? (
                <option value="">Cargando cajas...</option>
              ) : registers.length === 0 ? (
                <option value="">No hay cajas disponibles</option>
              ) : (
                registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <Input
            label="Monto de apertura"
            name="opening_amount"
            onChange={(e) => setOpeningAmount(e.target.value)}
            type="number"
            value={openingAmount}
          />
          <Button disabled={isOpening || !selectedRegisterId} type="submit">
            {isOpening ? "Abriendo..." : "Abrir caja"}
          </Button>
          {error ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</div>
          ) : null}
        </form>
      </Card>
    </div>
  );
}

// ── POS Terminal ───────────────────────────────────────────────────

function getCategoryIcon(categoryName: string) {
  const name = categoryName.toLowerCase();
  if (name.includes("plomer") || name.includes("agua") || name.includes("tubo")) return Droplet;
  if (name.includes("electr") || name.includes("cable") || name.includes("foco") || name.includes("ilumin")) return Landmark; // or Zap
  if (name.includes("herramient") || name.includes("martillo") || name.includes("llave") || name.includes("desarmador")) return Wrench;
  if (name.includes("pint") || name.includes("brocha") || name.includes("sellador") || name.includes("acril")) return Paintbrush;
  if (name.includes("construc") || name.includes("cemento")) return Hammer;
  if (name.includes("fijac") || name.includes("tornillo") || name.includes("clavo") || name.includes("taquete")) return Nut;
  return PackageIcon;
}

// Simple fallback icon wrapper
function PackageIcon(props: LucideProps) {
  return <ShoppingCart {...props} />;
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

function PosTerminal() {
  const sessionId = usePosStore((s) => s.sessionId)!;
  const sessionName = usePosStore((s) => s.sessionName);
  const cart = usePosStore((s) => s.cart);
  const addToCart = usePosStore((s) => s.addToCart);
  const clearSession = usePosStore((s) => s.clearSession);
  const [showPayment, setShowPayment] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [ticketSaleId, setTicketSaleId] = useState<number | null>(null);
  // "Crédito" está fuera del MVP: no se ofrece (H-53)
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [confirmClearCart, setConfirmClearCart] = useState(false);
  const commandPalette = useCommandPalette();
  const searchRef = useRef<HTMLInputElement>(null);

  const totals = getCartTotals(cart);

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

  // Lector de código de barras global: búsqueda exacta; sin servidor, en el catálogo local
  useBarcodeScanner(async (barcode) => {
    let product: Product | null = null;
    let offline = false;
    try {
      // Sin servidor (según el ping a /api/health), directo a la copia local, sin esperar timeout (OPS-23)
      if (!useConnectionStore.getState().serverReachable) throw new Error("sin servidor");
      product = await getProductByCode(barcode);
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        if (err.response.status !== 404) {
          toast.error(err.response.data?.error ?? "Error al procesar la lectura del código.");
          return;
        }
      } else {
        offline = true;
        product = findByCodeOffline(barcode);
      }
    }
    if (!product) {
      toast.error(`Producto no registrado: ${barcode}`);
      return;
    }
    addToCart({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      unit_price: product.sale_price,
      tax_rate: product.tax_rate,
      unit_abbreviation: product.unit?.abbreviation ?? "pz",
    });
    toast.success(offline ? `Escaneado sin conexión: ${product.name}` : `Escaneado: ${product.name}`);
  });

  // F2 = focus search, F5 = pay, Esc = clear cart
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
        // Esc dentro de un campo o con la paleta abierta no vacía el carrito (H-30)
        if (commandPalette.open || isEditableElement(document.activeElement)) return;
        e.preventDefault();
        if (cart.length > 3) {
          setConfirmClearCart(true);
        } else {
          usePosStore.getState().clearCart();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.length, showPayment, lastSale, confirmClearCart, commandPalette.open]);

  function handleProductSelect(product: Product) {
    addToCart({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      unit_price: product.sale_price,
      tax_rate: product.tax_rate,
      unit_abbreviation: product.unit?.abbreviation ?? "pz",
    });
  }

  function handlePayClick() {
    setShowPayment(true);
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4">
      {/* Top status shortcuts bar */}
      <div className="flex items-center justify-between border border-neutral-border bg-neutral-surface px-4 py-2.5 rounded-lg shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">{sessionName ?? "Caja"}</Badge>
          <div className="flex flex-wrap items-center gap-2">
            <kbd className="rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-xs text-neutral-text-secondary">F2</kbd>
            <span className="text-xs text-neutral-text-secondary">Buscar</span>
            <kbd className="rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-xs text-neutral-text-secondary">F5</kbd>
            <span className="text-xs text-neutral-text-secondary">Cobrar</span>
            <kbd className="rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-xs text-neutral-text-secondary">F8</kbd>
            <span className="text-xs text-neutral-text-secondary">Último Ticket</span>
            <kbd className="rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-xs text-neutral-text-secondary">Esc</kbd>
            <span className="text-xs text-neutral-text-secondary">Vaciar</span>
          </div>
        </div>
        <Button onClick={clearSession} className="min-h-0 h-8 py-1 px-3 text-xs" variant="secondary">
          Salir del POS
        </Button>
      </div>

      {/* Main split grid */}
      <div className="grid flex-1 overflow-hidden lg:grid-cols-[1fr_380px] gap-4">
        {/* Left: Product search & catalog */}
        <div className="flex flex-col overflow-hidden border border-neutral-border bg-neutral-surface rounded-lg">
          <ProductSearch inputRef={searchRef} onSelect={handleProductSelect} />
        </div>

        {/* Right: Cart and totals */}
        <div className="flex flex-col overflow-hidden border border-neutral-border bg-neutral-surface rounded-lg">
          <CartPanel />

          {/* Totals, fast payment selection and pay button */}
          <div className="border-t border-neutral-border p-4 bg-neutral-surface-raised shrink-0">
            <div className="mb-4 grid gap-1.5 text-xs text-neutral-text-secondary">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono font-medium">${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.discountTotal > 0 ? (
                <div className="flex justify-between text-danger">
                  <span>Descuento</span>
                  <span className="font-mono font-semibold">-${totals.discountTotal.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>IVA (16%)</span>
                <span className="font-mono font-medium">${totals.taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-border-strong pt-2 text-xl font-bold text-neutral-text-primary">
                <span>Total</span>
                <span className="font-mono text-2xl text-primary-text">${totals.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Quick payment selector */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(["efectivo", "tarjeta", "transferencia"] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  type="button"
                  className={`py-2 rounded-md text-xs font-bold border transition-colors outline-none text-center ${
                    paymentMethod === method
                      ? "bg-primary/10 border-primary text-primary-text"
                      : "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:border-primary/50"
                  }`}
                >
                  {method === "efectivo" ? "Efectivo" : method === "tarjeta" ? "Tarjeta" : "Transferencia"}
                </button>
              ))}
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary-hover font-bold text-sm min-h-11 py-2.5 shadow-sm"
              disabled={cart.length === 0}
              onClick={handlePayClick}
            >
              Cobrar (F5)
            </Button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment ? (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onSuccess={(sale) => {
            setLastSale(sale);
            setShowPayment(false);
            toast.success("Venta completada", {
              description: `Folio: ${sale.folio} — Total: ${formatCurrency(sale.total)}`,
            });
          }}
          sessionId={sessionId}
          total={totals.total}
          defaultMethod={paymentMethod}
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
                }}
                variant="danger"
              >
                Vaciar carrito
              </Button>
            </>
          }
          onClose={() => setConfirmClearCart(false)}
          open
          title="¿Vaciar el carrito?"
        >
          <p className="text-sm text-neutral-text-secondary">
            Se quitarán los {cart.length} artículos del carrito actual.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

// ── Product Search & Dynamic Catalog ───────────────────────────────

function ProductSearch({
  onSelect,
  inputRef,
}: {
  onSelect: (product: Product) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Categories for tabs
  const categoriesQuery = useQuery({
    queryKey: qk.posCategories(),
    queryFn: listCategories,
  });

  const serverReachable = useConnectionStore((s) => s.serverReachable);
  // Redibuja cuando la copia local termina de cargarse desde IndexedDB
  const [, setCatalogLoaded] = useState(0);
  useEffect(() => {
    void loadCatalog().then(() => setCatalogLoaded((n) => n + 1));
  }, []);
  const productsQuery = useQuery({
    queryKey: qk.posProducts(debouncedSearch, selectedCategoryId),
    queryFn: () =>
      listProducts({
        page: 1,
        perPage: 50,
        search: debouncedSearch,
        category_id: selectedCategoryId,
      }),
    // Sin reintento ni consulta si ya se sabe que no hay servidor (OPS-23)
    retry: 0,
    enabled: serverReachable,
  });

  // Sin servidor (ping fallido o error de red, no un 4xx/5xx), se busca en la copia local (OPS-02)
  const serverDown =
    !serverReachable ||
    (productsQuery.isError && productsQuery.error instanceof AxiosError && !productsQuery.error.response);
  const catalog = catalogInfo();
  const categories = categoriesQuery.data ?? [];
  const products = serverDown
    ? searchOffline(debouncedSearch, selectedCategoryId)
    : (productsQuery.data?.items ?? []);

  return (
    <div className="flex flex-col h-full">
      {/* Search Input Bar */}
      <div className="p-4 border-b border-neutral-border shrink-0 bg-neutral-surface">
        <div className="relative flex items-center">
          <Search className="absolute left-3 text-neutral-text-muted" size={16} />
          <input
            autoFocus
            className="min-h-10 w-full rounded-md border border-neutral-border bg-neutral-surface py-2 pl-9 pr-24 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-neutral-text-muted"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto por nombre, SKU o código..."
            ref={inputRef}
            type="text"
            value={search}
          />
          <span className="absolute right-3 text-xs font-bold text-primary-text cursor-pointer hover:underline flex items-center gap-1 select-none" onClick={() => inputRef.current?.focus()}>
            <Barcode size={14} /> Escanear
          </span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-neutral-border bg-neutral-surface overflow-x-auto shrink-0 scrollbar-none">
        <button
          onClick={() => setSelectedCategoryId(undefined)}
          type="button"
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors outline-none whitespace-nowrap ${
            selectedCategoryId === undefined
              ? "bg-primary text-on-primary border-transparent"
              : "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:border-primary hover:text-primary-text"
          }`}
        >
          Todos
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategoryId(category.id)}
            type="button"
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors outline-none whitespace-nowrap ${
              selectedCategoryId === category.id
                ? "bg-primary text-on-primary border-transparent"
                : "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:border-primary hover:text-primary-text"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Products Grid list */}
      <div className="flex-1 overflow-y-auto p-4">
        {serverDown ? (
          <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning" role="status">
            {catalog
              ? `Sin conexión con el servidor: mostrando el catálogo guardado el ${catalog.generatedAt.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}.`
              : "Sin conexión con el servidor y sin catálogo guardado en este equipo."}{" "}
            {catalog?.stale
              ? "Tiene más de 24 horas: los precios pueden haber cambiado; confírmalos antes de cobrar con tarjeta o transferencia."
              : "Precios sujetos a confirmación al sincronizar."}
          </div>
        ) : null}
        {productsQuery.isLoading && !serverDown ? (
          <div className="py-12 text-center text-xs text-neutral-text-secondary">Cargando catálogo...</div>
        ) : products.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-text-secondary">Sin productos disponibles</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {products.map((product) => {
              // Los productos del catálogo local no traen existencias: no se marcan como agotados
              const stockKnown = product.stock_qty !== undefined && product.stock_qty !== null;
              const stock = Number(product.stock_qty ?? "0.000");
              const min = Number(product.min_stock ?? "0.000");
              const isOut = stockKnown && stock === 0;
              const isLow = min > 0 && stock < min;

              const CategoryIcon = getCategoryIcon(product.category?.name ?? "");

              return (
                <button
                  key={product.id}
                  onClick={() => onSelect(product)}
                  disabled={isOut}
                  type="button"
                  className={`flex flex-col bg-neutral-surface border border-neutral-border rounded-xl p-3 text-left transition-[transform,border-color,box-shadow] duration-150 ease-[var(--ease-out-strong)] hover:border-primary hover:shadow-sm active:scale-[0.98] outline-none group ${
                    isOut && "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="w-full aspect-square bg-neutral-bg rounded-lg flex items-center justify-center mb-2.5 text-neutral-text-muted group-hover:text-primary-text transition-colors">
                    <CategoryIcon size={28} strokeWidth={1.5} />
                  </div>
                  <div className="text-xs font-bold text-neutral-text-primary mb-0.5 line-clamp-2 leading-tight">
                    {product.name}
                  </div>
                  <div className="font-mono text-xs text-neutral-text-muted mb-2 uppercase">
                    {product.sku}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-1 w-full">
                    <div className="font-mono text-xs font-bold text-neutral-text-primary leading-none">
                      ${Number(product.sale_price).toFixed(2)}
                    </div>
                    <div
                      className={`text-xs font-bold leading-none ${
                        isOut ? "text-danger" : isLow ? "text-warning" : "text-success"
                      }`}
                    >
                      {!stockKnown ? "" : isOut ? "Agotado" : isLow ? `${stock} u.` : "Stock"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cart Panel ─────────────────────────────────────────────────────

function CartPanel() {
  const cart = usePosStore((s) => s.cart);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const clearCart = usePosStore((s) => s.clearCart);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cart title header */}
      <div className="flex items-center justify-between border-b border-neutral-border px-4 py-3 bg-neutral-surface shrink-0">
        <div>
          <div className="text-xs font-bold text-neutral-text-primary">Carrito de venta</div>
          <div className="text-xs font-mono text-neutral-text-muted">Detalle de transacción</div>
        </div>
        <button
          onClick={clearCart}
          disabled={cart.length === 0}
          className="p-1.5 text-neutral-text-muted hover:text-danger disabled:opacity-30 transition-colors"
          title="Vaciar carrito"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Cart items list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-neutral-text-secondary text-center py-12">
            <ShoppingCart className="mb-2 text-neutral-text-muted opacity-40" size={32} />
            <p className="text-xs font-medium">El carrito está vacío</p>
            <p className="text-xs text-neutral-text-muted mt-0.5">Selecciona productos para comenzar</p>
          </div>
        ) : (
          cart.map((item: CartItem) => {
            const lineTotal = calcLineTotal(item);
            return (
              <div
                className="rounded-lg border border-neutral-border bg-neutral-surface p-3 flex flex-col gap-2 shadow-xs"
                key={item.product_id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-neutral-text-primary truncate">{item.product_name}</div>
                    <div className="text-xs text-neutral-text-muted font-mono mt-0.5">
                      ${item.unit_price} × {item.quantity} {item.unit_abbreviation}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-bold text-neutral-text-primary">${lineTotal.toFixed(2)}</div>
                    <button
                      className="text-xs text-danger hover:underline font-semibold mt-0.5"
                      onClick={() => removeFromCart(item.product_id)}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                {/* Amount inputs controls */}
                <div className="flex items-center gap-1">
                  <button
                    className="relative flex h-8 w-8 before:absolute before:inset-[-6px] before:content-[''] items-center justify-center rounded border border-neutral-border bg-neutral-bg hover:bg-neutral-border-strong text-neutral-text-primary outline-none transition-colors"
                    onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    type="button"
                  >
                    <Minus size={12} />
                  </button>
                  <input
                    className="h-8 w-14 rounded border border-neutral-border bg-neutral-surface text-center font-mono text-xs font-bold outline-none focus:border-primary"
                    min="0.001"
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val > 0) updateQuantity(item.product_id, val);
                    }}
                    step="1"
                    type="number"
                    value={item.quantity}
                  />
                  <button
                    className="relative flex h-8 w-8 before:absolute before:inset-[-6px] before:content-[''] items-center justify-center rounded border border-neutral-border bg-neutral-bg hover:bg-neutral-border-strong text-neutral-text-primary outline-none transition-colors"
                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                    type="button"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Payment Modal (Checkout Dialog) ───────────────────────────────

type PaymentEntry = {
  id: number;
  method: "efectivo" | "tarjeta" | "transferencia";
  amount: string;
  reference: string;
};

let paymentIdCounter = 0;

const paymentMethods = [
  { icon: Banknote, label: "Efectivo", value: "efectivo" },
  { icon: CreditCard, label: "Tarjeta", value: "tarjeta" },
  { icon: Landmark, label: "Transferencia", value: "transferencia" },
] as const;

const keypadKeys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0"] as const;

/** Denominaciones de billetes para los atajos de pago rápido.
   Hoy es MX (peso mexicano). Para internacionalizar, abstraer por locale. */
export const MXN_BILL_DENOMINATIONS = [50, 100, 200, 500, 1000] as const;

function PaymentModal({
  sessionId,
  total: initialTotal,
  onClose,
  onSuccess,
  defaultMethod,
}: {
  sessionId: number;
  total: number;
  onClose: () => void;
  onSuccess: (sale: Sale) => void;
  defaultMethod: "efectivo" | "tarjeta" | "transferencia";
}) {
  const cart = usePosStore((s) => s.cart);
  const clearCart = usePosStore((s) => s.clearCart);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [total, setTotal] = useState(initialTotal);
  const [initialPaymentId] = useState(() => ++paymentIdCounter);
  const [payments, setPayments] = useState<PaymentEntry[]>(() => [
    { id: initialPaymentId, method: defaultMethod, amount: initialTotal.toFixed(2), reference: "" },
  ]);
  const [activePaymentId, setActivePaymentId] = useState(initialPaymentId);
  const isSubmittingRef = useRef(false);
  const clientUuidRef = useRef<string>(crypto.randomUUID());

  // Pedir cotización oficial al backend al abrir el modal (H-04: si difiere del cálculo local, gana el quote)
  useEffect(() => {
    let isMounted = true;
    async function fetchQuote() {
      try {
        const quote = await quoteSale({
          session_id: sessionId,
          items: cart.map((c) => ({
            product_id: c.product_id,
            quantity: c.quantity.toFixed(3),
            discount_percent: c.discount_percent || "0",
          })),
        });
        if (!isMounted) return;
        const officialTotal = Number(quote.total);
        if (!isNaN(officialTotal)) {
          setTotal(officialTotal);
          // Si el usuario aún no ha modificado los pagos, actualizar el monto prellenado
          setPayments((prev) => {
            if (prev.length === 1 && prev[0].id === initialPaymentId) {
              return [{ ...prev[0], amount: officialTotal.toFixed(2) }];
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn("No se pudo obtener quote del servidor, usando total local:", err);
      }
    }

    if (cart.length > 0) {
      fetchQuote();
    }

    return () => {
      isMounted = false;
    };
  }, [sessionId, cart, initialPaymentId]);

  // Calculate totals
  // Sumas y comparaciones en centavos enteros: 10 + 1.13 en flotantes da 11.129999… y dejaba
  // deshabilitado "Completar cobro" con el pago exacto (FE-104)
  const paidCents = sumPaymentsCents(payments);
  const totalCents = toCents(total);
  const paidTotal = paidCents / 100;
  const remaining = (totalCents - paidCents) / 100;

  // For the last cash payment, calculate change
  const lastCashPayment = [...payments].reverse().find((p) => p.method === "efectivo");
  const cashChange =
    lastCashPayment && remaining <= 0
      ? Math.max(0, (paidCents - totalCents) / 100)
      : 0;

  const isPaymentSufficient = paidCents >= totalCents;

  function addPayment() {
    const nextId = ++paymentIdCounter;
    const amountToAdd = Math.max(0, remaining);
    setPayments((current) => [
      ...current,
      {
        id: nextId,
        method: "efectivo",
        amount: amountToAdd > 0 ? amountToAdd.toFixed(2) : "0.00",
        reference: "",
      },
    ]);
    setActivePaymentId(nextId);
  }

  function removePayment(id: number) {
    if (payments.length <= 1) return;
    const nextPayments = payments.filter((p) => p.id !== id);
    setPayments(nextPayments);
    if (activePaymentId === id) {
      setActivePaymentId(nextPayments[0]?.id ?? initialPaymentId);
    }
  }

  function updatePayment(id: number, patch: Partial<Omit<PaymentEntry, "id">>) {
    setActivePaymentId(id);
    setPayments(
      payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  function setActiveAmount(amount: string) {
    updatePayment(activePaymentId, { amount });
  }

  function pressKey(key: string) {
    const activePayment = payments.find((p) => p.id === activePaymentId);
    if (!activePayment) return;

    const current = activePayment.amount || "";
    if (key === "clear") {
      setActiveAmount("");
      return;
    }
    if (key === "backspace") {
      setActiveAmount(current.slice(0, -1));
      return;
    }
    if (key === "." && current.includes(".")) {
      return;
    }
    if ((current === "0" || current === "0.00") && key !== ".") {
      setActiveAmount(key);
      return;
    }

    setActiveAmount(`${current}${key}`);
  }

  const saleMutation = useMutation({
    mutationFn: (payload: CreateSalePayload) => createSale(payload),
    onSuccess: async (sale) => {
      clearCart();
      await invalidateAfterSale(queryClient);
      onSuccess(sale);
    },
  });

  async function handlePay() {
    if (isSubmittingRef.current || saleMutation.isPending) {
      return;
    }
    isSubmittingRef.current = true;

    try {
      const items: SaleItemInput[] = cart.map((c) => ({
        product_id: c.product_id,
        quantity: c.quantity.toFixed(3),
        unit_price: c.unit_price,
        tax_rate: c.tax_rate,
        discount_percent: c.discount_percent,
      }));

      const paymentInputs: PaymentInput[] = payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.method !== "efectivo" && p.reference ? p.reference : undefined,
        change_amount:
          p === lastCashPayment && cashChange > 0 ? cashChange.toFixed(2) : "0.00",
      }));

      const payload: CreateSalePayload = {
        session_id: sessionId,
        client_uuid: clientUuidRef.current,
        items,
        payments: paymentInputs,
      };

      if (navigator.onLine) {
        try {
          await saleMutation.mutateAsync(payload);
          return;
        } catch (err) {
          // H-03: Solo pasar a offline ante errores de red reales (!err.response o timeout).
          // Si el servidor respondió con 4xx o 5xx, NO pasar a offline:
          // mantener modal abierto, mostrar error del servidor y conservar el carrito.
          const isHttpError = err instanceof AxiosError && Boolean(err.response);
          if (isHttpError) {
            const serverMsg =
              err.response?.data?.error ?? "Error al procesar la venta en el servidor.";
            toast.error(serverMsg);
            return;
          }

          console.warn("Fallo de red o timeout al enviar online; activando contingencia offline:", err);
        }
      }

    // Proceso Offline: ticket provisional con el usuario real y los totales de getCartTotals (1.2)
    const totals = getCartTotals(cart);
    const mockSale: Sale = {
      id: -Date.now(),
      folio: "PENDIENTE DE SINCRONIZAR",
      session_id: sessionId,
      user_id: user?.id ?? 0,
      username: user?.full_name || user?.username || "",
      subtotal: totals.subtotal.toFixed(2),
      discount_total: totals.discountTotal.toFixed(2),
      tax_total: totals.taxTotal.toFixed(2),
      total: totals.total.toFixed(2),
      status: "completada",
      cancel_reason: null,
      created_at: new Date().toISOString(),
      items: cart.map((c, i) => {
        const line = getCartTotals([c]);
        return {
          id: -i,
          product_id: c.product_id,
          product_name: c.product_name,
          product_sku: c.product_sku,
          quantity: c.quantity.toString(),
          unit_price: c.unit_price,
          discount_percent: c.discount_percent,
          discount_amount: line.discountTotal.toFixed(2),
          tax_rate: c.tax_rate,
          subtotal: line.subtotal.toFixed(2),
          cost_at_sale: c.unit_price,
        };
      }),
      payments: payments.map((p, i) => ({
        id: -i,
        method: p.method,
        amount: p.amount,
        reference: p.reference || null,
        change_amount: p === lastCashPayment && cashChange > 0 ? cashChange.toFixed(2) : "0.00",
      })),
    };

    // Guardar en cola asociada al usuario (H-18)
    usePosStore.getState().addOfflineSale(payload, user?.id, mockSale.total, cart);

      // Limpiar carrito y disparar éxito
      clearCart();
      toast.warning("Sin conexión. Venta guardada en este equipo: PENDIENTE DE SINCRONIZAR.");
      onSuccess(mockSale);
    } finally {
      isSubmittingRef.current = false;
    }
  }

  const errorMessage = saleMutation.error
    ? saleMutation.error instanceof AxiosError
      ? saleMutation.error.response?.data?.error ?? "Error al procesar la venta."
      : "Error al procesar la venta."
    : "";
  const activePayment = payments.find((p) => p.id === activePaymentId) ?? payments[0];
  const quickCashAmounts = Array.from(new Set([total, ...MXN_BILL_DENOMINATIONS]))
    .filter((amount) => amount >= total || amount === total)
    .slice(0, 5);

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="ghost" className="h-10 text-neutral-text-secondary hover:text-neutral-text-primary">
            Cancelar
          </Button>
          <Button
            disabled={!isPaymentSufficient || saleMutation.isPending || isSubmittingRef.current || cart.length === 0}
            onClick={handlePay}
            className="h-10 px-6 font-bold"
          >
            {saleMutation.isPending ? "Procesando..." : `Completar cobro ${formatCurrency(total)}`}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="lg"
      title="Cobrar Venta"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
        {/* LEFT COLUMN: Summary, amount inputs and change info */}
        <div className="space-y-4">
          {/* Main Total Card */}
          <div className="bg-neutral-bg border border-neutral-border rounded-lg p-5 text-center">
            <div className="text-xs font-bold text-neutral-text-secondary uppercase tracking-widest mb-1">
              Total a Pagar
            </div>
            <div className="font-mono text-3xl font-extrabold text-primary-text">
              ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Amount input fields for active payment (Cash method only) */}
          {activePayment.method === "efectivo" && (
            <div>
              <label className="block text-xs font-bold text-neutral-text-secondary uppercase tracking-wider mb-2">
                Monto Recibido
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-neutral-text-muted font-mono">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={activePayment.amount}
                  onChange={(e) => updatePayment(activePayment.id, { amount: e.target.value })}
                  className="w-full bg-neutral-bg border border-neutral-border focus:border-primary focus:bg-neutral-surface rounded-lg py-3 pl-8 pr-5 text-2xl font-bold font-mono text-neutral-text-primary outline-none transition-colors duration-150 ease-[var(--ease-out-strong)]"
                />
              </div>

              {/* Quick Cash bills list shortcuts */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                {quickCashAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => updatePayment(activePayment.id, { amount: amount.toFixed(2) })}
                    className="h-10 text-xs font-mono font-bold rounded-lg border border-neutral-border bg-neutral-bg hover:border-primary hover:bg-primary/5 active:scale-[0.97] transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out-strong)] text-neutral-text-primary"
                  >
                    {amount === total ? "Exacto" : formatCurrency(amount)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Change & status banner */}
          <div className={`p-4 rounded-lg border text-center transition-colors ${
            remaining > 0
              ? "border-danger/20 bg-danger/10 text-danger"
              : "border-success/20 bg-success/10 text-success"
          }`}>
            <div className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">
              {remaining > 0 ? "Falta por cobrar" : cashChange > 0 ? "Cambio a entregar" : "Cobro completo"}
            </div>
            <div className="font-mono text-2xl font-extrabold">
              ${remaining > 0 ? remaining.toFixed(2) : cashChange.toFixed(2)}
            </div>
          </div>

          {/* Payments list (only if multi-payment is active) */}
          {payments.length > 1 && (
            <div className="grid gap-2 border border-neutral-border rounded-lg bg-neutral-bg p-3 max-h-[140px] overflow-y-auto">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-text-secondary">
                  Estructura de Pagos Divididos
                </span>
              </div>
              <div className="space-y-1.5">
                {payments.map((p, idx) => (
                  <div
                    key={p.id}
                    onClick={() => setActivePaymentId(p.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-md border text-xs cursor-pointer transition-colors ${
                      p.id === activePaymentId
                        ? "border-primary bg-primary/5 font-semibold text-neutral-text-primary"
                        : "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:bg-neutral-bg"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="capitalize">{p.method}</span>
                      <span className="text-xs text-neutral-text-muted">({idx + 1})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">${Number(p.amount || 0).toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePayment(p.id);
                        }}
                        className="text-neutral-text-muted hover:text-danger p-0.5"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add split payment trigger */}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={addPayment}
              className="text-xs font-bold text-primary-text hover:text-primary-hover flex items-center gap-1 outline-none"
            >
              <Plus size={14} /> Registrar otro pago (Dividir cuenta)
            </button>
            {payments.length > 1 && (
              <span className="text-xs font-semibold text-neutral-text-secondary">
                Suma de pagos: <span className="font-mono font-bold">${paidTotal.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Method selectors & entry details */}
        <div>
          {/* Method tabs */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const isActive = activePayment.method === method.value;
              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => updatePayment(activePayment.id, { method: method.value, reference: "" })}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg border text-xs font-bold transition-[border-color,background-color,color,box-shadow] duration-150 ease-[var(--ease-out-strong)] ${
                    isActive
                      ? "border-primary bg-primary/10 text-primary-text ring-2 ring-primary/15 font-semibold"
                      : "border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:border-primary/50 hover:text-neutral-text-primary"
                  }`}
                >
                  <Icon size={16} />
                  <span>{method.label}</span>
                </button>
              );
            })}
          </div>

          {/* Conditional inputs depending on method selection */}
          {activePayment.method !== "efectivo" ? (
            <div className="space-y-4 rounded-lg border border-neutral-border p-4 bg-neutral-bg/30">
              <div>
                <label className="block text-xs font-bold text-neutral-text-secondary uppercase tracking-wider mb-2">
                  Monto Recibido
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-neutral-text-muted font-mono">
                    $
                  </span>
                  <input
                    type="number"
                    value={activePayment.amount}
                    onChange={(e) => updatePayment(activePayment.id, { amount: e.target.value })}
                    className="w-full bg-neutral-surface border border-neutral-border focus:border-primary rounded-lg py-2 pl-8 pr-4 text-sm font-mono text-neutral-text-primary outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-text-secondary uppercase tracking-wider mb-2">
                  Referencia de Pago
                </label>
                <input
                  type="text"
                  placeholder="Últimos 4 dígitos del ticket"
                  value={activePayment.reference}
                  onChange={(e) => updatePayment(activePayment.id, { reference: e.target.value })}
                  className="w-full bg-neutral-surface border border-neutral-border focus:border-primary rounded-lg py-2 px-3 text-sm text-neutral-text-primary outline-none transition-colors"
                />
              </div>
            </div>
          ) : (
            /* Touch numeric keypad */
            <div className="rounded-lg border border-neutral-border p-4 bg-neutral-bg/30">
              <div className="grid grid-cols-3 gap-2">
                {keypadKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pressKey(key)}
                    className="h-11 rounded-lg border border-neutral-border bg-neutral-surface font-mono text-sm font-bold text-neutral-text-primary hover:border-primary hover:bg-primary/5 active:scale-[0.95] transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out-strong)]"
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => pressKey("backspace")}
                  className="h-11 rounded-lg border border-neutral-border bg-neutral-surface text-neutral-text-secondary hover:border-danger hover:bg-danger/5 active:scale-[0.95] transition-[transform,border-color,background-color,color] duration-150 ease-[var(--ease-out-strong)] flex items-center justify-center"
                >
                  <Delete size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setActiveAmount(total.toFixed(2))}
                  className="h-9 rounded-lg border border-neutral-border bg-neutral-surface text-xs font-bold text-neutral-text-primary hover:border-primary hover:bg-primary/5 transition-colors duration-150 ease-[var(--ease-out-strong)]"
                >
                  Exacto
                </button>
                <button
                  type="button"
                  onClick={() => pressKey("clear")}
                  className="h-9 rounded-lg border border-transparent bg-transparent text-xs font-semibold text-neutral-text-muted hover:text-danger transition-colors duration-150 ease-[var(--ease-out-strong)]"
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger" role="alert">
          {errorMessage}
        </div>
      )}
    </Modal>
  );
}

function TicketPreviewModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const [printError, setPrintError] = useState("");
  const ticketQuery = useQuery({
    queryKey: qk.saleTicket(saleId),
    queryFn: () => previewSaleTicket(saleId),
  });

  const printMutation = useMutation({
    mutationFn: () => printSaleTicket(saleId),
    onMutate: () => setPrintError(""),
    onError: (error) => {
      if (error instanceof AxiosError) {
        setPrintError(error.response?.data?.error ?? "No se pudo imprimir el ticket.");
      } else {
        setPrintError("No se pudo imprimir el ticket.");
      }
    },
  });

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cerrar
          </Button>
          <Button
            disabled={ticketQuery.isLoading || printMutation.isPending}
            icon={<Printer aria-hidden="true" size={17} />}
            onClick={() => printMutation.mutate()}
          >
            {printMutation.isPending ? "Enviando" : "Imprimir"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Ticket de venta"
    >
      <div className="grid gap-3">
        {ticketQuery.isLoading ? (
          <p className="py-6 text-center text-xs text-neutral-text-secondary">Cargando ticket...</p>
        ) : ticketQuery.error ? (
          <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger" role="alert">
            No se pudo cargar el ticket.
          </div>
        ) : (
          <pre className="max-h-96 overflow-auto rounded border border-neutral-border bg-neutral-bg p-3 font-mono text-xs leading-relaxed text-neutral-text-primary">
            {ticketQuery.data?.content}
          </pre>
        )}

        {printMutation.data?.sent ? (
          (() => {
            const message = printResultMessage(printMutation.data);
            return (
              <div
                className={
                  message.tone === "warning"
                    ? "rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning"
                    : "rounded border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success"
                }
                role="status"
              >
                {message.text}
              </div>
            );
          })()
        ) : null}

        {printError ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
            {printError}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
