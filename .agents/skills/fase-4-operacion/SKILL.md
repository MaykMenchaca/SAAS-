---
name: fase-4-operacion
description: Ejecuta la Fase 4 (operación de tienda) del plan de corrección del POS. Zona horaria de México, impresión y cajón por caja, modo offline fiable, catálogo e inventario, validaciones de usuarios y concurrencia. Úsala desde el orquestador o cuando se pida la fase 4 o una subfase 4.x.
---

# Fase 4: Operación de tienda (H-21, H-22, H-24, H-25, H-26, H-28, H-31, H-38, H-43)

**Requisito:** fases 0-3 aprobadas.
**Carriles paralelos:**
- **A, backend:** 4.1 backend, 4.2, 4.4, 4.5, 4.6.
- **B, frontend:** 4.1 frontend, 4.3, la UI de 4.4.

## 4.1 Zona horaria (H-21)
- **Backend:**
  - `APP_TIMEZONE=America/Mexico_City` en `config.py`.
  - Helper `app/utils/timeutil.py` con `local_day_bounds(date) -> (utc_start, utc_end)` y `local_today()`.
  - Usarlo en `api/reports.py:21-24,117-126,271-279,347-355`, en `date_trunc('day', Sale.created_at.op('AT TIME ZONE')(tz))` y en `sale_service._generate_folio`, `purchase_order_service` (folio) y `backup_service` (nombre de archivo).
  - **Tests:** `test_venta_19h_cuenta_en_dia_local` (con freezegun o un `now` inyectado) y `test_folio_usa_fecha_local`.
- **Frontend:**
  - `src/lib/dates.ts` con `localISODate(d)` (`getFullYear/Month/Date`).
  - Reemplazar `toISOString().split("T")[0]` en `pages/dashboard.tsx:12-17,64-75` y `pages/reports.tsx:55-60`. Esto también cierra UI-04.

## 4.2 Impresión y cajón (H-22)
- **Migración:** `cash_registers.printer_path` y `cash_registers.printer_codepage` (default `cp850`). El admin los configura en Configuración → Cajas.
- **`printer_service.py`:**
  - Resolver la impresora por la caja de la venta (sesión → caja).
  - Enviar `ESC t n` según la página de códigos y transliterar los caracteres que no estén en ella.
  - Corte con `ESC d 4` + `GS V 66 0`.
  - Encabezado y pie desde `config_service` (`company_name`, `company_address`, RFC, `ticket_footer`).
  - Escritura con timeout (un hilo de 5 s).
  - **Tests:** `test_ticket_usa_config_empresa`, `test_encoding_acentos_mayusculas` y `test_corte_gs_v`.
- **Cajón:** abrirlo automáticamente al completar una venta con efectivo (`api/sales.py`, después del commit, con best-effort y log si falla).
- **Frontend:** botón "Reimprimir ticket" en el detalle de `pages/sales-history.tsx`.
- **Prueba con hardware real:** ⚠️ pide al usuario que confirme con la impresora física.

## 4.3 Modo offline fiable (H-24)
- `src/api/client.ts`: `timeout: 15000`.
- `src/hooks/useSyncQueue.ts`:
  - Reescribir como un sincronizador único: un mutex a nivel de módulo, cada venta con un id (el `client_uuid` de la fase 1.4), eliminación por id, backoff exponencial y ping a `/api/health` cada 30 s.
  - Una venta que recibe 4xx pasa a `rejectedSales` (no bloquea la cola).
- **UI:** indicador "N ventas pendientes" en el header y una bandeja de rechazadas con detalle y acción "Descartar" (con confirmación).
- `stores/auth-store.ts:73-86`: con un error de red en `loadCurrentUser`, conservar la sesión y marcar `offline=true`. Solo limpiar con 401 cuando el refresh también falla.
- El ticket offline (`pos.tsx:782-815`) usa el usuario real y la función de totales de la 1.2, y lleva la marca "PENDIENTE DE SINCRONIZAR". F8 se deshabilita si `id < 0`.
- ⚠️ **Decisión del usuario:** HTTPS local para tener un service worker real en las cajas de la LAN, o documentar que el modo offline solo cubre "no recargar".

## 4.4 Catálogo e inventario (H-26, H-43, H-38)
- `product_service.create_product`: crear `Stock(quantity=0)` y `avg_cost = purchase_price`.
  - Migración de datos para los productos existentes que no tienen `Stock`.
  - **Test:** `test_producto_nuevo_aparece_en_stock_y_low_stock`.
- **Productos inactivos:** toggle "Mostrar inactivos" en `pages/products.tsx` (`include_inactive=true`) y acción "Reactivar".
- **Búsqueda** en `product_service.py`: `func.word_similarity(search, Product.name) > 0.3` o el operador `%>`, más `ilike`.
  - **Test** con los casos de QA-18 ("martilo", "tornilo", "pintrua", "foko led").

## 4.5 Usuarios (H-28)
- `UserCreateSchema.email = fields.Email(load_default=None, allow_none=True)`.
- Traducir los mensajes de Marshmallow al español: un mapa global en `utils/errors.py`, o `error_messages` en los schemas.
- **Test:** `test_crear_usuario_sin_email`.

## 4.6 Concurrencia (H-31)
- Migración con un índice único parcial: `CREATE UNIQUE INDEX uq_session_open ON cash_sessions(cash_register_id) WHERE status='abierta'`. Verifica el nombre real de la tabla en `models/sale.py`.
- `with_for_update()` sobre la sesión en `create_sale` y `close_session`, y sobre `PurchaseOrder` en `purchase_order_service.receive` (`:196-245`).
- `avg_cost` con `Numeric(12,4)` mediante una migración.
- **Tests:** `test_no_abre_dos_sesiones_misma_caja` y `test_recepcion_no_excede_pendiente`.

## Cierre
Ejecuta `/gate-fase` con N=4.
