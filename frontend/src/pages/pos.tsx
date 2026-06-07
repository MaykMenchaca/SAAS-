import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Minus, Plus, Printer, ReceiptText, Search, ShoppingCart, X } from "lucide-react";

import type { Product } from "../api/products";
import { listProducts } from "../api/products";
import { previewSaleTicket, printSaleTicket } from "../api/printing";
import type { Sale } from "../api/sales";
import type { CreateSalePayload, PaymentInput, SaleItemInput } from "../api/sales";
import { createSale, listSessions, openCashRegister } from "../api/sales";
import { Badge, Button, Card, Input, Modal } from "../components/ui";
import type { CartItem } from "../stores/pos-store";
import { calcLineTotal, getCartTotals, usePosStore } from "../stores/pos-store";

// ── Main POS Page ──────────────────────────────────────────────────

export function PosPage() {
  const sessionId = usePosStore((s) => s.sessionId);

  if (!sessionId) {
    return <SessionSelector />;
  }

  return <PosTerminal />;
}

// ── Session Selector ───────────────────────────────────────────────

function SessionSelector() {
  const setSession = usePosStore((s) => s.setSession);
  const [openingAmount, setOpeningAmount] = useState("0.00");
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState("");

  const sessionsQuery = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: listSessions,
  });

  const openSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "abierta");

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsOpening(true);
    try {
      // Use cash register ID 1 (default). A proper implementation would let the user pick.
      const session = await openCashRegister(1, openingAmount);
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
        <ShoppingCart aria-hidden="true" className="mx-auto mb-3 text-primary" size={48} />
        <h1 className="text-2xl font-bold text-neutral-text-primary">Punto de Venta</h1>
        <p className="text-sm text-neutral-text-secondary">Selecciona o abre una sesion de caja para comenzar</p>
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
        <h2 className="mb-3 font-semibold text-neutral-text-primary">Abrir nueva sesion</h2>
        <form className="grid gap-3" onSubmit={handleOpen}>
          <Input
            label="Monto de apertura"
            name="opening_amount"
            onChange={(e) => setOpeningAmount(e.target.value)}
            type="number"
            value={openingAmount}
          />
          <Button disabled={isOpening} type="submit">
            {isOpening ? "Abriendo..." : "Abrir caja"}
          </Button>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">{error}</div>
          ) : null}
        </form>
      </Card>
    </div>
  );
}

// ── POS Terminal ───────────────────────────────────────────────────

function PosTerminal() {
  const sessionId = usePosStore((s) => s.sessionId)!;
  const sessionName = usePosStore((s) => s.sessionName);
  const cart = usePosStore((s) => s.cart);
  const addToCart = usePosStore((s) => s.addToCart);
  const clearSession = usePosStore((s) => s.clearSession);
  const [showPayment, setShowPayment] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [ticketSaleId, setTicketSaleId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const totals = getCartTotals(cart);

  // F2 = focus search, F5 = pay, Esc = close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F5" && cart.length > 0) {
        e.preventDefault();
        setShowPayment(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.length]);

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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-border bg-neutral-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <Badge tone="success">{sessionName ?? "Caja"}</Badge>
          <span className="text-xs text-neutral-text-secondary">F2: Buscar · F5: Cobrar</span>
        </div>
        <Button onClick={clearSession} variant="secondary">
          Salir del POS
        </Button>
      </div>

      {/* Main content: split layout */}
      <div className="grid flex-1 overflow-hidden lg:grid-cols-[1fr_400px]">
        {/* Left: Product search */}
        <div className="flex flex-col overflow-auto border-r border-neutral-border p-4">
          <ProductSearch inputRef={searchRef} onSelect={handleProductSelect} />
        </div>

        {/* Right: Cart */}
        <div className="flex flex-col overflow-hidden bg-neutral-bg">
          <CartPanel />
          {/* Totals + Pay */}
          <div className="border-t border-neutral-border bg-neutral-surface p-4">
            <div className="mb-3 grid gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-text-secondary">Subtotal</span>
                <span className="font-mono">${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.discountTotal > 0 ? (
                <div className="flex justify-between text-danger">
                  <span>Descuento</span>
                  <span className="font-mono">-${totals.discountTotal.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-neutral-text-secondary">IVA</span>
                <span className="font-mono">${totals.taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-border pt-1 text-lg font-bold">
                <span>Total</span>
                <span className="font-mono text-primary">${totals.total.toFixed(2)}</span>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}
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
          }}
          sessionId={sessionId}
          total={totals.total}
        />
      ) : null}

      {/* Sale Success Toast */}
      {lastSale ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-green-200 bg-green-50 px-5 py-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-semibold text-green-800">Venta completada</div>
              <div className="text-sm text-green-700">
                Folio: {lastSale.folio} — Total: ${lastSale.total}
              </div>
            </div>
            <Button
              aria-label={`Ver ticket ${lastSale.folio}`}
              className="h-11 w-11 border-green-300 bg-white px-0 text-green-800 hover:bg-green-100"
              onClick={() => setTicketSaleId(lastSale.id)}
              variant="secondary"
            >
              <ReceiptText aria-hidden="true" size={17} />
            </Button>
            <button
              className="text-green-600 hover:text-green-800"
              onClick={() => setLastSale(null)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {ticketSaleId ? <TicketPreviewModal onClose={() => setTicketSaleId(null)} saleId={ticketSaleId} /> : null}
    </div>
  );
}

// ── Product Search ─────────────────────────────────────────────────

function ProductSearch({
  onSelect,
  inputRef,
}: {
  onSelect: (product: Product) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const productsQuery = useQuery({
    queryKey: ["pos-products", debouncedSearch],
    queryFn: () => listProducts({ page: 1, perPage: 50, search: debouncedSearch }),
    enabled: debouncedSearch.length > 0,
  });

  const products = productsQuery.data?.items ?? [];

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-3 text-neutral-text-secondary" size={18} />
        <input
          autoFocus
          className="w-full rounded-md border border-neutral-border bg-neutral-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto por nombre, SKU o codigo..."
          ref={inputRef}
          type="text"
          value={search}
        />
      </div>

      {debouncedSearch.length === 0 ? (
        <div className="py-12 text-center text-sm text-neutral-text-secondary">
          Escribe para buscar productos
        </div>
      ) : productsQuery.isLoading ? (
        <div className="py-8 text-center text-sm text-neutral-text-secondary">Buscando...</div>
      ) : products.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-text-secondary">Sin resultados</div>
      ) : (
        <div className="grid gap-2">
          {products.map((product) => (
            <button
              className="flex items-center justify-between rounded-md border border-neutral-border bg-neutral-surface px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 active:scale-[0.99]"
              key={product.id}
              onClick={() => onSelect(product)}
              type="button"
            >
              <div>
                <div className="font-semibold text-neutral-text-primary">{product.name}</div>
                <div className="text-xs text-neutral-text-secondary">
                  {product.sku}
                  {product.category ? ` · ${product.category.name}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-primary">${product.sale_price}</div>
                <div className="text-xs text-neutral-text-secondary">{product.unit?.abbreviation ?? "pz"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cart Panel ─────────────────────────────────────────────────────

function CartPanel() {
  const cart = usePosStore((s) => s.cart);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const removeFromCart = usePosStore((s) => s.removeFromCart);

  if (cart.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-neutral-text-secondary">
        <ShoppingCart aria-hidden="true" className="mb-2" size={40} />
        <p className="text-sm">Carrito vacio</p>
        <p className="text-xs">Busca un producto para agregarlo</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="grid gap-2">
        {cart.map((item: CartItem) => {
          const lineTotal = calcLineTotal(item);
          return (
            <div
              className="rounded-md border border-neutral-border bg-neutral-surface p-3"
              key={item.product_id}
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-neutral-text-primary">{item.product_name}</div>
                  <div className="text-xs text-neutral-text-secondary">
                    ${item.unit_price} × {item.quantity} {item.unit_abbreviation}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold">${lineTotal.toFixed(2)}</div>
                  <button
                    className="text-xs text-danger hover:underline"
                    onClick={() => removeFromCart(item.product_id)}
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded border border-neutral-border hover:bg-neutral-bg"
                  onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                  type="button"
                >
                  <Minus aria-hidden="true" size={14} />
                </button>
                <input
                  className="h-8 w-16 rounded border border-neutral-border bg-neutral-surface text-center text-sm font-mono outline-none focus:border-primary"
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
                  className="flex h-8 w-8 items-center justify-center rounded border border-neutral-border hover:bg-neutral-bg"
                  onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────

function PaymentModal({
  sessionId,
  total,
  onClose,
  onSuccess,
}: {
  sessionId: number;
  total: number;
  onClose: () => void;
  onSuccess: (sale: Sale) => void;
}) {
  const cart = usePosStore((s) => s.cart);
  const clearCart = usePosStore((s) => s.clearCart);
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [cashReceived, setCashReceived] = useState(total.toFixed(2));
  const [reference, setReference] = useState("");

  const cashReceivedNum = Number(cashReceived) || 0;
  const change = method === "efectivo" ? Math.max(0, Math.round((cashReceivedNum - total) * 100) / 100) : 0;
  const isPaymentSufficient = method === "efectivo" ? cashReceivedNum >= total : true;

  const saleMutation = useMutation({
    mutationFn: (payload: CreateSalePayload) => createSale(payload),
    onSuccess: async (sale) => {
      clearCart();
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      onSuccess(sale);
    },
  });

  function handlePay() {
    const items: SaleItemInput[] = cart.map((c) => ({
      product_id: c.product_id,
      quantity: c.quantity,
      unit_price: c.unit_price,
      tax_rate: c.tax_rate,
      discount_percent: c.discount_percent,
    }));

    const payments: PaymentInput[] = [
      {
        method,
        amount: method === "efectivo" ? cashReceived : total.toFixed(2),
        reference: method !== "efectivo" ? reference || undefined : undefined,
        change_amount: change > 0 ? change.toFixed(2) : "0.00",
      },
    ];

    saleMutation.mutate({ session_id: sessionId, items, payments });
  }

  const errorMessage = saleMutation.error
    ? saleMutation.error instanceof AxiosError
      ? saleMutation.error.response?.data?.error ?? "Error al procesar la venta."
      : "Error al procesar la venta."
    : "";

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={!isPaymentSufficient || saleMutation.isPending || cart.length === 0}
            onClick={handlePay}
          >
            {saleMutation.isPending ? "Procesando..." : `Cobrar $${total.toFixed(2)}`}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Cobrar venta"
    >
      <div className="grid gap-4">
        {/* Total */}
        <div className="rounded-lg bg-primary/5 px-4 py-3 text-center">
          <div className="text-sm text-neutral-text-secondary">Total a cobrar</div>
          <div className="text-3xl font-bold text-primary">${total.toFixed(2)}</div>
        </div>

        {/* Payment method */}
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-neutral-text-primary">Forma de pago</span>
          <div className="flex gap-2">
            {(["efectivo", "tarjeta", "transferencia"] as const).map((m) => (
              <button
                className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                  method === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-neutral-border text-neutral-text-secondary hover:border-primary/50"
                }`}
                key={m}
                onClick={() => setMethod(m)}
                type="button"
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Cash input */}
        {method === "efectivo" ? (
          <div className="grid gap-3">
            <Input
              label="Efectivo recibido"
              name="cash_received"
              onChange={(e) => setCashReceived(e.target.value)}
              type="number"
              value={cashReceived}
            />
            {change > 0 ? (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-center">
                <span className="text-sm text-green-700">Cambio: </span>
                <span className="font-mono text-lg font-bold text-green-800">${change.toFixed(2)}</span>
              </div>
            ) : null}
            {!isPaymentSufficient ? (
              <div className="text-center text-sm font-medium text-danger">
                Monto insuficiente (faltan ${(total - cashReceivedNum).toFixed(2)})
              </div>
            ) : null}
          </div>
        ) : (
          <Input
            label="Referencia (opcional)"
            name="reference"
            onChange={(e) => setReference(e.target.value)}
            placeholder="No. de autorizacion / referencia"
            value={reference}
          />
        )}

        {/* Quick cash buttons */}
        {method === "efectivo" ? (
          <div className="grid grid-cols-4 gap-2">
            {[50, 100, 200, 500].map((amount) => (
              <button
                className="rounded-md border border-neutral-border py-2 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5"
                key={amount}
                onClick={() => setCashReceived(String(amount))}
                type="button"
              >
                ${amount}
              </button>
            ))}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">{errorMessage}</div>
        ) : null}
      </div>
    </Modal>
  );
}

function TicketPreviewModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const [printError, setPrintError] = useState("");
  const ticketQuery = useQuery({
    queryKey: ["sale-ticket", saleId],
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
          <p className="py-6 text-center text-sm text-neutral-text-secondary">Cargando ticket...</p>
        ) : ticketQuery.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
            No se pudo cargar el ticket.
          </div>
        ) : (
          <pre className="max-h-96 overflow-auto rounded-md border border-neutral-border bg-neutral-bg p-3 font-mono text-xs leading-relaxed text-neutral-text-primary">
            {ticketQuery.data?.content}
          </pre>
        )}

        {printMutation.data?.sent ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
            Ticket enviado a impresora.
          </div>
        ) : null}

        {printError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
            {printError}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
