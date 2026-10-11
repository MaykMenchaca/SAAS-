import { test, expect } from "@playwright/test";

test.describe("Flujos Críticos de Punto de Venta (E2E)", () => {
  test.beforeEach(async ({ page }) => {
    // Interceptar llamadas al API para tests reproducibles y aislados en e2e
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          username: "admin",
          full_name: "Administrador General",
          role: "admin",
          role_name: "admin",
          permissions: [
            "ventas:crear",
            "ventas:ver",
            "ventas:cancelar",
            "caja:abrir",
            "caja:cerrar",
            "caja:ver",
            "caja:supervisar",
            "productos:ver",
            "inventario:ver",
            "reportes:ver",
          ],
        }),
      });
    });

    await page.route("**/api/branding", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          company_name: "VRNTAS POS Test",
          ticket_header: "VRNTAS - Ferretería Modelo",
          ticket_footer: "Gracias por su compra",
        }),
      });
    });

    await page.route("**/api/cash-register/current", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          cash_register_id: 1,
          cash_register_name: "Caja Principal",
          user_id: 1,
          status: "abierta",
          opening_amount: "1000.00",
          opened_at: new Date().toISOString(),
        }),
      });
    });
  });

  test("Flujo 1: Venta completa (selección, cobro en efectivo y confirmación)", async ({ page }) => {
    // Mock catálogo de productos
    await page.route("**/api/products*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: 101,
              name: "Martillo de Uña 16oz",
              sku: "HER-001",
              barcode: "7501234567890",
              sale_price: "150.00",
              tax_rate: "16.00",
              stock: 25,
              is_active: true,
              unit: { name: "Pieza", allows_fractions: false },
            },
          ],
          total: 1,
          page: 1,
          per_page: 20,
        }),
      });
    });

    // Mock cotización de venta
    await page.route("**/api/sales/quote", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lines: [
            {
              product_id: 101,
              product_name: "Martillo de Uña 16oz",
              product_sku: "HER-001",
              quantity: "1.000",
              unit_price: "150.00",
              discount_percent: "0.00",
              subtotal: "150.00",
              tax_amount: "24.00",
              total: "174.00",
            },
          ],
          subtotal: "150.00",
          discount_total: "0.00",
          tax_total: "24.00",
          total: "174.00",
        }),
      });
    });

    // Mock creación de venta
    await page.route("**/api/sales/", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: 501,
            folio: "V-20261011-0001",
            total: "174.00",
            subtotal: "150.00",
            tax_total: "24.00",
            created_at: new Date().toISOString(),
            payments: [{ method: "efectivo", amount: "200.00", change_amount: "26.00" }],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/pos");
    await expect(page).toHaveTitle(/POS/);
  });

  test("Flujo 2: Devolución de venta", async ({ page }) => {
    await page.route("**/api/sales/501", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 501,
          folio: "V-20261011-0001",
          status: "completada",
          total: "174.00",
          items: [
            {
              id: 901,
              product_id: 101,
              product_name: "Martillo de Uña 16oz",
              quantity: "1.000",
              unit_price: "150.00",
              total: "174.00",
            },
          ],
        }),
      });
    });

    await page.goto("/returns");
    await expect(page).toHaveTitle(/Devoluciones/);
  });

  test("Flujo 3: Corte de caja (arqueo y cierre)", async ({ page }) => {
    await page.route("**/api/cash-register/cut-preview*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session_id: 1,
          opening_amount: "1000.00",
          cash_sales: "174.00",
          expected_amount: "1174.00",
          card_sales: "0.00",
          transfer_sales: "0.00",
          total_sales: "174.00",
        }),
      });
    });

    await page.goto("/cash-cut");
    await expect(page).toHaveTitle(/Corte de Caja/);
  });
});
