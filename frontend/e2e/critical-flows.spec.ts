import { expect, test } from "@playwright/test";
import type { Page, Request, Route } from "@playwright/test";

import type { AuthUser } from "../src/api/auth";
import type { BrandingInfo } from "../src/api/config";
import type { Category, PaginatedResponse, PosCatalogItem, Product } from "../src/api/products";
import type {
  CashRegisterInfo,
  CashRegisterSession,
  Sale,
  SaleListItem,
  SaleQuoteResponse,
  SaleReturn,
  SessionSummary,
} from "../src/api/sales";

/**
 * Flujos críticos del POS contra los endpoints REALES del backend (RF-48): las respuestas se simulan con
 * `page.route`, pero las rutas y las formas son las de `src/api/*.ts` (los tipos las verifican al compilar).
 * Cualquier llamada a un endpoint no simulado responde 404 y hace fallar la prueba: si el frontend cambia
 * de rutas, este archivo debe cambiar con él.
 */

// ── Datos coherentes con los esquemas del servidor (backend/app/schemas/sale.py) ─────────────────

const USER: AuthUser = {
  id: 3,
  username: "lmendez",
  full_name: "Laura Méndez",
  role: "supervisor",
  // Lo justo para vender, devolver y hacer el corte (sin reportes ni inventario: menos ruido del marco)
  permissions: ["ventas:crear", "ventas:ver", "ventas:cancelar", "caja:ver", "caja:abrir", "caja:cerrar", "caja:supervisar"],
  must_change_password: false,
};

const BRANDING: BrandingInfo = {
  business_name: "Ferretería Modelo",
  company_name: "Ferretería Modelo",
  company_subtitle: "VRNTAS POS",
  company_logo_icon: "ShoppingCart",
  company_logo_color: "primary",
  business_rfc: "",
  business_address: "",
  business_phone: "",
  logo_url: "",
};

const REGISTER: CashRegisterInfo = {
  id: 1,
  name: "Caja 1",
  is_active: true,
  printer_path: null,
  printer_codepage: "cp850",
  print_via_agent: false,
  agent_configured: false,
  agent_last_seen_at: null,
};

const OPENED_AT = "2026-10-17T14:00:00+00:00";

function openSession(): CashRegisterSession {
  return {
    id: 12,
    cash_register_id: REGISTER.id,
    cash_register_name: REGISTER.name,
    user_id: USER.id,
    username: USER.username,
    opening_amount: "1000.00",
    closing_amount: null,
    expected_cash: null,
    difference: null,
    status: "abierta",
    opened_at: OPENED_AT,
    closed_at: null,
    close_notes: null,
  };
}

const PIEZA = { id: 1, name: "Pieza", abbreviation: "pz", allows_fractions: false };
const HERRAMIENTA: Category = { id: 4, name: "Herramienta", description: null, is_active: true };

const MARTILLO: Product = {
  id: 101,
  sku: "HER-001",
  barcode: "7501234567890",
  name: "Martillo de uña 16 oz",
  description: null,
  category_id: HERRAMIENTA.id,
  unit_id: PIEZA.id,
  purchase_price: "95.00",
  avg_cost: "95.00",
  sale_price: "150.00",
  tax_rate: "16.00",
  min_stock: "5.000",
  max_stock: "50.000",
  is_active: true,
  category: HERRAMIENTA,
  unit: PIEZA,
  stock_qty: "25.000",
};

function paginated<T>(items: T[]): PaginatedResponse<T> {
  return { items, page: 1, pages: 1, per_page: Math.max(20, items.length), total: items.length };
}

// ── Servidor simulado ────────────────────────────────────────────────────────────────────────────

type Reply = { status?: number; body: unknown };
type Handler = (req: Request, url: URL, params: string[]) => Reply | Promise<Reply>;

/** Rutas `MÉTODO /api/...`; los grupos de la expresión se pasan como `params`. */
class MockApi {
  private routes: Array<{ method: string; path: RegExp; handler: Handler }> = [];
  /** Peticiones recibidas (para revisar cuerpos). */
  readonly calls: Array<{ method: string; path: string; body: unknown }> = [];
  /** Endpoints que el frontend llamó y no están simulados. */
  readonly unhandled: string[] = [];

  on(method: string, path: RegExp, handler: Handler) {
    this.routes.unshift({ method, path, handler });
    return this;
  }

  lastBody(method: string, path: string) {
    return [...this.calls].reverse().find((c) => c.method === method && c.path === path)?.body;
  }

  async install(page: Page) {
    await page.route(
      (url) => url.pathname.startsWith("/api/"),
      async (route: Route) => {
        const req = route.request();
        const url = new URL(req.url());
        const method = req.method();
        let body: unknown = null;
        try {
          body = req.postDataJSON();
        } catch {
          body = req.postData();
        }
        this.calls.push({ method, path: url.pathname, body });
        for (const r of this.routes) {
          const match = r.method === method ? r.path.exec(url.pathname) : null;
          if (match) {
            const reply = await r.handler(req, url, match.slice(1));
            await route.fulfill({ status: reply.status ?? 200, contentType: "application/json", body: JSON.stringify(reply.body) });
            return;
          }
        }
        this.unhandled.push(`${method} ${url.pathname}${url.search}`);
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No simulado" }) });
      },
    );
  }
}

/** Endpoints que el marco de la aplicación consulta en cualquier pantalla. */
function baseApi(activeSession: () => CashRegisterSession | null) {
  return new MockApi()
    .on("GET", /^\/api\/health$/, () => ({ body: { status: "ok", database: "ok" } }))
    .on("GET", /^\/api\/auth\/me$/, () => ({ body: USER }))
    .on("GET", /^\/api\/config\/branding$/, () => ({ body: BRANDING }))
    .on("GET", /^\/api\/cash-register\/active$/, () => ({ body: { session: activeSession() } }));
}

let api: MockApi;

test.beforeEach(async ({ page }) => {
  // Sesión iniciada: el frontend lee los tokens y el usuario de localStorage antes de montar
  await page.addInitScript((user) => {
    window.localStorage.setItem("pos_access_token", "token-e2e");
    window.localStorage.setItem("pos_refresh_token", "refresh-e2e");
    window.localStorage.setItem("pos_auth_user", JSON.stringify(user));
  }, USER);
});

test.afterEach(() => {
  expect(api.unhandled, "endpoints llamados que no existen en la simulación").toEqual([]);
});

test.describe("Flujos críticos del punto de venta (E2E)", () => {
  test("Flujo 1: abrir caja, vender en efectivo y entregar cambio", async ({ page }) => {
    let session: CashRegisterSession | null = null;
    api = baseApi(() => session)
      .on("GET", /^\/api\/cash-register\/sessions$/, () => ({ body: paginated(session ? [session] : []) }))
      .on("GET", /^\/api\/cash-register\/$/, () => ({ body: [REGISTER] }))
      .on("POST", /^\/api\/cash-register\/open$/, () => {
        session = openSession();
        return { status: 201, body: session };
      })
      .on("GET", /^\/api\/cash-register\/(\d+)$/, () => (session ? { body: session } : { status: 404, body: { error: "Sesión no encontrada" } }))
      .on("GET", /^\/api\/categories\/$/, () => ({ body: paginated([HERRAMIENTA]) }))
      .on("GET", /^\/api\/products\/$/, () => ({ body: paginated([MARTILLO]) }))
      .on("GET", /^\/api\/products\/pos-catalog$/, () => {
        const item: PosCatalogItem = {
          id: MARTILLO.id,
          sku: MARTILLO.sku,
          barcode: MARTILLO.barcode,
          name: MARTILLO.name,
          sale_price: MARTILLO.sale_price,
          tax_rate: MARTILLO.tax_rate,
          category_id: MARTILLO.category_id,
          unit: { abbreviation: PIEZA.abbreviation, allows_fractions: false },
        };
        return { body: { generated_at: "2026-10-17T14:00:00+00:00", items: [item] } };
      })
      .on("POST", /^\/api\/sales\/quote$/, () => {
        const quote: SaleQuoteResponse = {
          lines: [
            {
              product_id: MARTILLO.id,
              product_name: MARTILLO.name,
              product_sku: MARTILLO.sku,
              quantity: "1.000",
              unit_price: "150.00",
              discount_percent: "0.00",
              discount_amount: "0.00",
              tax_rate: "16.00",
              tax_amount: "24.00",
              subtotal: "150.00",
              total: "174.00",
            },
          ],
          subtotal: "150.00",
          discount_total: "0.00",
          tax_total: "24.00",
          total: "174.00",
        };
        return { body: quote };
      })
      .on("POST", /^\/api\/sales\/$/, () => {
        const sale: Sale = {
          id: 501,
          folio: "V-20261017-0001",
          session_id: 12,
          user_id: USER.id,
          username: USER.username,
          subtotal: "150.00",
          discount_total: "0.00",
          tax_total: "24.00",
          total: "174.00",
          status: "completada",
          cancel_reason: null,
          created_at: "2026-10-17T15:10:00+00:00",
          items: [
            {
              id: 901,
              product_id: MARTILLO.id,
              product_name: MARTILLO.name,
              product_sku: MARTILLO.sku,
              quantity: "1.000",
              unit_price: "150.00",
              discount_percent: "0.00",
              discount_amount: "0.00",
              tax_rate: "16.00",
              subtotal: "150.00",
              cost_at_sale: "95.00",
              allows_fractions: false,
              returned_quantity: "0",
              available_quantity: "1.000",
            },
          ],
          payments: [{ id: 1, method: "efectivo", amount: "200.00", reference: null, change_amount: "26.00" }],
        };
        return { status: 201, body: sale };
      });
    await api.install(page);

    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "Abre una caja para vender" })).toBeVisible();
    await page.getByLabel("Fondo de apertura").fill("1000");
    await page.getByRole("button", { name: "Abrir caja" }).click();

    await page.getByRole("button", { name: /Martillo de uña 16 oz/ }).click();
    expect(api.lastBody("POST", "/api/cash-register/open")).toEqual({ cash_register_id: 1, opening_amount: "1000" });
    const ticket = page.getByRole("complementary", { name: "Venta en curso" });
    await expect(ticket.getByText("Martillo de uña 16 oz")).toBeVisible();
    await ticket.getByRole("button", { name: /Cobrar/ }).click();

    const dialog = page.getByRole("dialog", { name: "Cobrar venta" });
    // El total oficial es la cotización del servidor
    await expect(dialog.getByRole("button", { name: "Completar cobro $174.00" })).toBeVisible();
    await dialog.getByLabel("Monto recibido").fill("200");
    await expect(dialog.getByRole("status")).toContainText("Cambio a entregar");
    await expect(dialog.getByRole("status")).toContainText("$26.00");
    await dialog.getByRole("button", { name: "Completar cobro $174.00" }).click();

    await expect(ticket.getByText("V-20261017-0001 · Total $174.00")).toBeVisible();
    await expect(ticket.getByText("Cambio $26.00")).toBeVisible();
    expect(api.lastBody("POST", "/api/sales/")).toMatchObject({
      session_id: 12,
      items: [{ product_id: MARTILLO.id, quantity: "1.000", unit_price: "150.00", tax_rate: "16.00" }],
      payments: [{ method: "efectivo", amount: "200", change_amount: "26.00" }],
    });
  });

  test("Flujo 2: devolución parcial con efectivo y tarjeta (reembolso HALF_EVEN)", async ({ page }) => {
    const session = openSession();
    const item = {
      discount_percent: "0.00",
      discount_amount: "0.00",
      tax_rate: "16.00",
      returned_quantity: "0",
    };
    const sale: Sale = {
      id: 502,
      folio: "V-20261017-0002",
      session_id: session.id,
      user_id: USER.id,
      username: USER.username,
      subtotal: "59.25",
      discount_total: "0.00",
      tax_total: "9.48",
      total: "68.73",
      status: "completada",
      cancel_reason: null,
      created_at: "2026-10-17T15:20:00+00:00",
      items: [
        { ...item, id: 911, product_id: 201, product_name: "Cinta aislante", product_sku: "ELE-010", quantity: "1.000", unit_price: "18.00", subtotal: "18.00", cost_at_sale: "9.00", allows_fractions: false, available_quantity: "1.000" },
        { ...item, id: 912, product_id: 202, product_name: "Cable calibre 12", product_sku: "ELE-120", quantity: "2.500", unit_price: "16.50", subtotal: "41.25", cost_at_sale: "10.00", allows_fractions: true, available_quantity: "2.500" },
      ],
      payments: [
        { id: 2, method: "efectivo", amount: "50.00", reference: null, change_amount: "0.00" },
        { id: 3, method: "tarjeta", amount: "18.73", reference: "4821", change_amount: "0.00" },
      ],
    };
    const listItem: SaleListItem = {
      id: sale.id,
      folio: sale.folio,
      total: sale.total,
      status: sale.status,
      created_at: sale.created_at,
      username: sale.username,
      user_id: sale.user_id,
      items_count: "3.500",
      payment_methods: ["efectivo", "tarjeta"],
    };

    api = baseApi(() => session)
      .on("GET", /^\/api\/sales\/$/, () => ({ body: paginated([listItem]) }))
      .on("GET", /^\/api\/sales\/(\d+)$/, (_req, _url, [id]) =>
        Number(id) === sale.id ? { body: sale } : { status: 404, body: { error: "Venta no encontrada" } },
      )
      .on("POST", /^\/api\/sales\/(\d+)\/return$/, () => {
        const result: SaleReturn = {
          id: 3,
          folio: "D-20261017-0003",
          sale_id: sale.id,
          refund_method: "efectivo",
          restocked: true,
          status: "devolucion_parcial",
          reason: "Le sobró cable",
          // 47.85 × 1.25 / 2.5 = 23.925 → 23.92 (HALF_EVEN, RF-49)
          refund_total: "23.92",
          created_at: "2026-10-17T15:30:00+00:00",
          returned_items: [{ id: 7, sale_item_id: 912, product_id: 202, quantity: "1.250", refund_amount: "23.92" }],
        };
        return { status: 201, body: result };
      });
    await api.install(page);

    await page.goto("/devoluciones");
    await expect(page.getByRole("heading", { level: 1, name: "Devoluciones" })).toBeVisible();
    expect(api.calls.find((c) => c.path === "/api/sales/")).toBeTruthy();
    await page.getByRole("button", { name: "Devolver V-20261017-0002" }).click();

    await expect(page.getByRole("heading", { name: "V-20261017-0002" })).toBeVisible();
    // Todos los métodos de la venta, no solo el primero (RF-51)
    await expect(page.getByText("Método de pago original: Efectivo + Tarjeta.")).toBeVisible();

    await page.getByRole("checkbox", { name: "Incluir Cable calibre 12 en la devolución" }).click();
    await page.getByLabel("Cantidad a devolver de Cable calibre 12").fill("1.25");
    await page.getByPlaceholder("Producto defectuoso, error en cantidad...").fill("Le sobró cable");
    // El estimado coincide con el reembolso del servidor (RF-49)
    await expect(page.getByText("$23.92").first()).toBeVisible();
    await page.getByRole("button", { name: "Registrar devolución" }).click();

    await expect(page.getByRole("heading", { name: "Devolución registrada" })).toBeVisible();
    await expect(page.getByText("D-20261017-0003")).toBeVisible();
    expect(api.lastBody("POST", "/api/sales/502/return")).toEqual({
      reason: "Le sobró cable",
      items: [{ sale_item_id: 912, quantity: "1.25" }],
      session_id: session.id,
      refund_method: "efectivo",
      restock: true,
    });
  });

  test("Flujo 3: corte de caja con faltante y cierre del turno", async ({ page }) => {
    let session = openSession();
    // Venta de $174 en efectivo y reembolso de $23.92 en efectivo: el cajón debe tener 1000 + 150.08
    const summary = (): SessionSummary => ({
      session_id: session.id,
      opening_amount: session.opening_amount,
      closing_amount: session.closing_amount,
      expected_cash: session.expected_cash,
      difference: session.difference,
      status: session.status,
      sales_completed: 2,
      sales_cancelled: 0,
      grand_total: "218.81",
      payment_methods: { efectivo: "150.08", tarjeta: "18.73" },
    });

    api = baseApi(() => (session.status === "abierta" ? session : null))
      .on("GET", /^\/api\/cash-register\/sessions$/, () => ({ body: paginated([session]) }))
      .on("GET", /^\/api\/cash-register\/(\d+)\/summary$/, () => ({ body: summary() }))
      .on("POST", /^\/api\/cash-register\/(\d+)\/close$/, (req) => {
        const data = req.postDataJSON() as { closing_amount: string; close_notes: string | null };
        session = {
          ...session,
          status: "cerrada",
          closing_amount: Number(data.closing_amount).toFixed(2),
          expected_cash: "1150.08",
          difference: (Number(data.closing_amount) - 1150.08).toFixed(2),
          closed_at: "2026-10-17T22:15:00+00:00",
          close_notes: data.close_notes,
        };
        return { body: session };
      });
    await api.install(page);

    await page.goto("/corte-caja");
    await expect(page.getByRole("heading", { level: 1, name: "Corte de caja" })).toBeVisible();
    await page.getByRole("button", { name: "Realizar arqueo" }).click();

    await expect(page.getByText("Total vendido en turno")).toBeVisible();
    await expect(page.getByText("$1,150.08").first()).toBeVisible();
    await page.getByLabel("Total contado en caja").fill("1145.08");
    const box = page.getByTestId("difference-box");
    await expect(box).toContainText("Faltante");
    await expect(box).toContainText("−$5.00");
    await page.getByLabel("Observaciones").fill("Faltan 5 pesos");

    await page.getByRole("button", { name: "Cerrar turno e imprimir corte" }).click();
    const dialog = page.getByRole("dialog", { name: "Cerrar turno y bloquear caja" });
    await expect(dialog).toContainText("Faltante de $5.00");
    await dialog.getByRole("button", { name: "Sí, cerrar turno" }).click();

    await expect(page.getByText("Turno cerrado. Ya puedes imprimir el corte.")).toBeVisible();
    expect(api.lastBody("POST", "/api/cash-register/12/close")).toEqual({ closing_amount: "1145.08", close_notes: "Faltan 5 pesos" });
    // Tras cerrar, el detalle muestra la hora de cierre y las observaciones guardadas (RF-50)
    await expect(page.getByText(/Caja 1 · Turno de lmendez · cerrado \d{2}/)).toBeVisible();
    await expect(page.getByText("cerrado —")).toHaveCount(0);
    await expect(page.getByLabel("Observaciones")).toHaveValue("Faltan 5 pesos");
    await expect(page.getByRole("button", { name: "Imprimir comprobante de corte" })).toBeVisible();
  });
});
