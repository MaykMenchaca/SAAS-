---
name: fase-1-dinero
description: Ejecuta la Fase 1 (integridad de dinero e inventario) del plan de corrección del POS. Precio autoritativo del servidor, total único (quote), cambio calculado en servidor, idempotencia de ventas, devoluciones y cancelaciones correctas, corte de caja con devoluciones y conteo físico por diferencia. Úsala desde el orquestador o cuando se pida la fase 1 o una subfase 1.x.
---

# Fase 1: Integridad del dinero y del inventario (H-01, H-03…H-08, H-16, H-20)

**Requisito:** gate de la Fase 0 aprobado.
**Carriles** (ver `ORQUESTA.md`):
- **A, backend** (`fix/fase-1-backend`): 1.1, 1.2.1, 1.3, 1.4.1, 1.5.1-1.5.3, 1.6, 1.7, 1.8.
- **B, frontend** (`fix/fase-1-frontend`): 1.2.2, 1.4.2, 1.4.3, 1.5.4. **B empieza cuando A publique el contrato** de `/sales/quote` y de `client_uuid`: debe estar documentado en `progreso.md`.

**Archivo central:** `backend/app/services/sale_service.py` (`create_sale` en la línea 17, `cancel_sale` en la 137, `return_sale` en la 175, `_generate_folio` en la 283).

## 1.1 Precio autoritativo (H-01)
- **Tests** (`tests/test_sales.py`):
  - `test_precio_del_cliente_se_ignora`: manda `unit_price=0.01` y la venta queda a `sale_price`.
  - `test_descuento_sobre_tope_rechazado`.
  - `test_producto_inactivo_rechazado`.
  - `test_fraccion_en_unidad_entera_rechazada`.
- **Cambio:**
  - En `create_sale`: `price = product.sale_price` y `tax_rate = product.tax_rate`.
  - Validar `product.is_active` y `product.unit.allows_fractions`.
  - Descuento ≤ `config.max_discount_percent` (default 0). Por encima de eso, exigir el permiso nuevo `ventas:descuento`, que se agrega en `seed.py` y `conftest.py`. ⚠️ **Pregunta al usuario el tope por defecto.**
- **Ajusta los fixtures** de `tests/conftest.py`, que hoy venden a 100.00 con `sale_price` 149.90, y explícalo en el commit.

## 1.2 Total único (H-04)
- **1.2.1 (A).** `POST /api/sales/quote` (`api/sales.py`), con el mismo payload que la venta sin pagos. Devuelve las líneas (subtotal, descuento, IVA, total por línea) y los totales.
  - Extraer `SaleService.price_lines(items)` y usarlo **tanto** en `quote` como en `create_sale`.
  - **Tests:** `test_quote_igual_a_venta` y `test_redondeo_half_even_por_linea` (2 × $12.85 al 16 % → 29.82).
- **1.2.2 (B).** `frontend/src/stores/pos-store.ts:getCartTotals`: aritmética en centavos y redondeo HALF_EVEN por línea.
  - En el modal de pago (`frontend/src/pages/pos.tsx`), pedir el quote al abrirlo y usar `quote.total` en "Exacto" y en el monto prellenado.
  - Si el quote y el cálculo local difieren, gana el quote.

## 1.3 Cambio y sesión (H-16)
- **Tests:**
  - `test_cambio_calculado_en_servidor`: sobrepago sin cambio declarado → el servidor calcula el cambio.
  - `test_sobrepago_tarjeta_rechazado`.
  - `test_cajero_no_cierra_caja_ajena`.
  - `test_no_vende_en_sesion_ajena`.
- **Cambio:** `change = efectivo − (total − no_efectivo)`. Se ignora `change_amount` del cliente.
  - `api/cash_register.py` (close) y `create_sale`: `session.user_id == current_user`, o el permiso nuevo `caja:supervisar`.

## 1.4 Idempotencia y doble envío (H-05, H-03)
- **1.4.1 (A).** Migración: `sales.client_uuid` (String 36, UNIQUE, nullable). En `create_sale`, si ya existe una venta con ese `client_uuid`, devolverla con 200 en lugar de 201.
  - **Test:** `test_venta_idempotente_por_client_uuid` (dos POST → una venta y el stock descontado una sola vez).
- **1.4.2 (B).** En `pos.tsx`, `handlePay` con `const paying = useRef(false)`: si ya está en `true`, retorna. Generar `crypto.randomUUID()` por intento de cobro y reutilizarlo en los reintentos.
- **1.4.3 (B).** Reemplazar el `catch` de `pos.tsx:771-778`:
  - `if (!axios.isAxiosError(err) || err.response)` → mostrar `err.response?.data?.error`, mantener el modal y el carrito, y **no encolar**.
  - Solo con un error de red se encola (con el mismo `client_uuid`).
- **Verificación en el navegador:** doble clic → 1 venta. Más cantidad que el stock → mensaje de error.

## 1.5 Devoluciones y cancelaciones (H-06, H-07, H-25)
- **1.5.1 (A).** En `return_sale`:
  - Bloquear la venta con `with_for_update()`.
  - Agrupar `items` por `sale_item_id` (sumar las cantidades) **antes** de validar contra `quantity − already_returned`.
  - **Test:** `test_devolucion_item_repetido_no_excede`.
- **1.5.2 (A).** `cancel_sale` solo se permite con `status == "completada"`.
  - **Test:** `test_no_cancela_venta_con_devolucion`.
- **1.5.3 (A).** Migración: `sale_returns.session_id` (FK, sesión abierta del usuario al devolver) y `refund_method` (efectivo o tarjeta, default efectivo).
- **1.5.4 (B).** `frontend/src/pages/returns.tsx:335-337`: `step` y `min` según `allows_fractions` (`1`/`1` para enteros, `0.001`/`any` para fraccionarios). Tras devolver, invalidar las queries de la venta, de stock y de historial.

## 1.6 Corte y reportes (H-08)
- **Estados válidos:** `VALID = ("completada", "devolucion_parcial", "devolucion_total")`.
- **`api/cash_register.py`** (cálculo del corte y `/summary`): `expected_cash = opening + Σ(efectivo − cambio de las ventas VALID de la sesión) − Σ(reembolsos en efectivo con session_id = sesión)`.
- **`api/reports.py`** (todas las consultas con `status == "completada"`): usar VALID y restar `SaleReturnItem.refund_amount` y la cantidad devuelta en ingresos, margen y top productos.
- **Test:** `test_corte_con_devoluciones_cuadra`, que reproduce QA-08 (efectivo, mixto, devolución parcial y total) → diferencia 0.

## 1.7 Conteo por diferencia (H-20)
- **Archivo:** `backend/app/services/inventory_count_service.py:143-152`.
- Al cerrar el conteo, aplicar un movimiento con `delta = counted − expected` (entrada o salida) en lugar de fijar el valor absoluto.
- Migración con UNIQUE `(inventory_count_id, product_id)`.
- **Test:** `test_conteo_con_venta_intermedia` (crear conteo, vender 2, contar, cerrar → las 2 ventas se respetan).

## 1.8 Cierre
La suite completa debe pasar. Ejecuta `/gate-fase` con N=1. El gate incluye la verificación en el navegador de los flujos 3, 4, 5 y 9 de QA.
