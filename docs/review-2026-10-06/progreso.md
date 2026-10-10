# Progreso del plan de corrección

**Estado:** `[ ]` pendiente · `[~]` en curso · `[x]` hecha · `[!]` bloqueada
**Formato de cada línea al cerrarla:** `[x] N.M Título (H-xx) · commit <hash> · tests: <nombres> · notas`

Este archivo lo actualiza el orquestador (`/orquestador-correccion`). Es la fuente de verdad del avance.

## Fase 0: Contención inmediata · rama `fix/fase-0`
- [x] 0.1 Cerrar `printer_path` / escritura arbitraria (H-02) · commit b22b865 · tests: `test_printer_path_del_cliente_se_ignora`, `test_impresora_no_disponible_da_503`, `test_send_to_printer_rechaza_rutas_unc_y_relativas` · `printer_path` ignorado del cliente, rutas UNC y relativas bloqueadas, `OSError` -> 503
- [x] 0.2.1 Rotar secretos del `.env` local (H-10) · `.env` local actualizado · `SECRET_KEY` y `JWT_SECRET_KEY` de 64 bytes generados independientemente (sesiones previas invalidadas)
- [x] 0.2.2 `config.py` sin fallbacks + validación al arrancar (H-10) · commit 6e53927 · tests: `test_config_rechaza_secretos_debiles` · `validate_secrets` aborta si faltan secretos, si miden <32 caracteres, si son iguales o contienen "cambiar"
- [x] 0.2.3 Instaladores generan secretos y contraseña de BD (H-10) · commit dbfeaf7 · tests: `test_install_scripts_no_usan_credenciales_hardcodeadas` · `install-production` y `setup-db` generan secretos y pass de `pos_user`, autodetectan psql y verifican `$LASTEXITCODE`
- [x] 0.2.4 PostgreSQL: contraseña de `pos_user` y `listen_addresses` ⚠️ confirmar (H-10) · commit 0b39d5e · respaldo `pre-fase-0.dump` generado con `pg_dump`, `pos_user` con contraseña rotada, `listen_addresses='localhost'` configurado en `postgresql.conf`
- [x] 0.2.5 Seed sin `admin123` + `must_change_password` (H-11) · commit 3a800d8 · tests: `test_seed_no_recrea_admin_si_hay_usuarios`, `test_must_change_password_bloquea` · admin creado solo en base vacia, `must_change_password` bloquea con 403, `/change-password` implementado, `admin123` eliminado
- [x] 0.2.6 Rate limit del login (H-11) · commit d730f4b · tests: `test_login_rate_limit`, `test_login_user_lockout_tras_10_fallos` · rate limit en memoria (5/min por IP, bloqueo de 5 min tras 10 fallos por usuario)
- [x] 0.3 Respaldos fuera de git y `BACKUP_DIR` fuera del repo (H-14) · commit 840ae92 · tests: `test_backups_ignorados_por_git`, `test_backup_dir_default_outside_repo` · `.gitignore` actualizado, `BACKUP_DIR` por defecto en ProgramData fuera del repo
- [x] 0.4 `run.py` sin debug; `start.*` marcados como desarrollo (H-15) · commit 46cd40d · tests: `test_run_py_no_expone_debug_ni_red` · `FLASK_DEBUG` default `False`, host default `127.0.0.1`, scripts marcados como SOLO DESARROLLO
- [x] **Gate fase 0** · APROBADO (2026-10-06, 193 tests backend passed, frontend build OK, verificaciones automáticas de gate.ps1 en verde)

## Fase 1: Integridad de dinero e inventario · ramas `fix/fase-1-backend` (A) / `fix/fase-1-frontend` (B)
- [x] 1.1 Precio, IVA y descuento autoritativos; inactivos y fracciones (H-01) ⚠️ tope de descuento · commit af5ac3b · tests: `test_precio_del_cliente_se_ignora`, `test_descuento_sobre_tope_rechazado`, `test_producto_inactivo_rechazado`, `test_fraccion_en_unidad_entera_rechazada` · Precio e IVA tomados del catálogo del servidor, validación de `product.is_active` y fracciones para enteros, tope `max_discount_percent` (0% por defecto) exigiendo permiso `ventas:descuento` para superarlo, fixtures alineados a 100.00
- [x] 1.2.1 `POST /sales/quote` + `price_lines` compartido (H-04) · commit a12b25f · tests: `test_quote_igual_a_venta`, `test_redondeo_half_even_por_linea` · Cálculo de precios unificado en `SaleService.price_lines` compartido entre quote y venta, redondeo `HALF_EVEN` por línea
- [x] 1.2.2 `getCartTotals` en centavos HALF_EVEN + uso del quote (H-04) · commit 9455ab1 · build: `npm run build` OK · Aritmética en centavos y redondeo `HALF_EVEN` en pos-store; cotización oficial obtenida al abrir PaymentModal usando `quote.total` en 'Exacto' y monto prellenado
- [x] 1.3 Cambio calculado en el servidor; sesión propia (H-16) · commit 7e5c3e5 · tests: `test_cambio_calculado_en_servidor_ignora_cliente`, `test_sobrepago_tarjeta_rechazado`, `test_sobrepago_transferencia_rechazado`, `test_pago_mixto_cambio_solo_de_efectivo`, `test_cajero_no_puede_vender_en_sesion_ajena`, `test_cajero_no_puede_cerrar_caja_ajena`, `test_supervisor_o_admin_puede_cerrar_caja_ajena`, `test_cajero_no_puede_vender_en_sesion_ajena_api`, `test_sobrepago_tarjeta_rechazado_api` · Cambio calculado de forma autoritativa en servidor ignorando `change_amount` del cliente, sobrepago con métodos no-efectivo rechazado con 400/ValueError, IDOR prevenido en venta y cierre de caja exigiendo sesión propia o permiso `caja:supervisar` (403)
- [x] 1.4.1 `client_uuid` idempotente (H-05) · commit a860910 · tests: `test_client_uuid_idempotencia_en_servicio`, `test_client_uuid_idempotencia_en_api` · Columna `sales.client_uuid` (UNIQUE), migración `e5c2b1890a12`, `SaleService.create_sale` y API devuelven venta existente ante reintento previniendo duplicación de inventario y cobros
- [x] 1.4.2 Guard de doble clic en `handlePay` (H-05) · commit bc384d1 · build: `npm run build` OK · Guard síncrono con `isSubmittingRef` y `saleMutation.isPending` para ignorar segundo clic antes de re-renderizado; `clientUuidRef` generado por intento de cobro y enviado en `CreateSalePayload`
- [x] 1.4.3 Offline solo ante error de red (H-03) · commit aad070e · build: `npm run build` OK · Ante respuestas HTTP 4xx/5xx (`err.response`) el modal permanece abierto mostrando el error del servidor y conservando el carrito intacto; solo fallos de red reales (`!err.response` o timeout) activan la contingencia offline
- [x] 1.5.1 Devolución agrupa los items + bloqueo (H-06) · commit 56a697e · tests: `test_devolucion_duplicada_agrupada_rechazada` · Bloqueo pesimista con `with_for_update()` en `return_sale` y agrupación previa por `sale_item_id` previniendo sobre-devolución por líneas duplicadas
- [x] 1.5.2 No cancelar una venta con devolución (H-07) · commit c8bcdb1 · tests: `test_cancelar_venta_con_devolucion_rechazada` · Bloqueo pesimista con `with_for_update()` en `cancel_sale`, rechazo estricto si la venta no está en estado 'completada' o si tiene devoluciones registradas para evitar doble reingreso de inventario
- [x] 1.5.3 `SaleReturn.session_id` y `refund_method` (H-08) · commit 28abc0e · tests: `test_devolucion_con_sesion_y_metodo_reembolso`, `test_devolucion_api_valida_sesion_abierta_y_metodo` · Modelo `SaleReturn` y migración `8d492bbd291e` con `session_id` y `refund_method`
- [x] 1.5.4 Input de devolución según unidad + invalidación (H-25) · commit 8c9c73a · build: `npm run build` OK · `SaleItemSchema` expone `allows_fractions`, `returned_quantity`, `available_quantity`; `pages/returns.tsx` usa step/min dinámicos (0.001 vs 1), deshabilita ítems devueltos en su totalidad, sincroniza cantidades con `useEffect`, `refetchOnMount: 'always'` e invalida queries tras devolver
- [x] 1.6 Corte y reportes con devoluciones y reembolsos (H-08) · commit 87b0b02 · tests: `test_corte_caja_descuenta_reembolsos_efectivo_qa08`, `test_caja_summary_descuenta_reembolsos`, `test_reportes_y_dashboard_descuentan_devoluciones_y_reembolsos` · Corte de caja (`close_session`) y `/summary` calculan `expected_cash` sumando ventas en `('completada', 'devolucion_parcial', 'devolucion_total')` y restando reembolsos en efectivo; QA-08 da exactamente $0.00; reportes y dashboard deducen devoluciones
- [x] 1.7 Conteo físico por diferencia (H-20) · commit bbf7ee2 · tests: `test_close_adjusts_stock_by_difference_preserving_intermediate_sales`, `test_inventory_count_item_unique_constraint` · Ajuste por conteo físico aplicado como delta (`is_delta=True`) bajo bloqueo pesimista preservando ventas intermedias, UNIQUE constraint en `(inventory_count_id, product_id)` y migración `b193f48a0c21`
- [x] 1.8 Suite de regresión de dinero completa · commit 1b43cc6 · tests: `TestMoneyAndInventoryRegression` (7 tests: precio manipulado, devolución duplicada, cancelar tras devolución, corte QA-08 con devoluciones, sobrepago y cambio, idempotencia client_uuid, conteo con ventas intermedias) · Suite E2E consolidada en `tests/test_money_regression.py`
- [x] **Gate fase 1** · APROBADO (2026-10-08, 228 tests backend passed, frontend build OK, gate.ps1 en verde, commit ed358c8)

## Fase 2: Trazabilidad y acceso
- [x] 2.1 Auditoría persiste + cobertura completa (H-09, H-39) · commit 35caa02 · tests: `TestAuditPersistenceAndCoverage` (22 tests en `test_audit.py` y 238 en suite total) · `log_action` participa en la transacción del servicio antes de `db.session.commit()` (o commit inmediato con `commit=True` para login fallido), y registra valor anterior y nuevo en ventas, devoluciones, caja, ajustes, conteos físicos, usuarios, órdenes de compra, recepciones, proveedores, categorías, unidades y productos
- [x] 2.2 Revocación de tokens: blocklist y `token_version` (H-17) · commit 0c4a792 · tests: `TestTokenRevocationAndBlocklist` (19 tests en `test_auth.py` y 243 en suite total) · Tabla `TokenBlocklist` y migración `c28471e981aa`, `token_version` en `User` incrementado en desactivación, cambio de rol y contraseña; `token_in_blocklist_loader` y `user_lookup_loader` activos; `JWT_ACCESS_TOKEN_EXPIRES` ajustado a 30 min (1800s)
- [x] 2.3 Permisos en la UI + branding + `editar_precio` (H-19) · commit 9bc8fe8 · tests: `test_get_branding`, `test_update_product_price_requires_permission`, `test_update_product_avg_cost_is_ignored` · Endpoint público `GET /api/config/branding` (sin 403 para no-admin), `avg_cost` read-only en actualización de productos, permiso `productos:editar_precio` exigido en `PATCH /api/products/<id>`; frontend con `can()`, `useCan()`, `<RequirePermission>`, navegación en AppShell y CommandPalette filtradas por permisos, IndexRedirect para cajeros/operadores, y consulta de badges condicionada a permisos
- [x] 2.4 Aislamiento entre usuarios: caché y store del POS (H-18) · commit db24ae5 · tests: `test_get_session_by_id`, `test_get_active_session_returns_user_session` · `queryClient.clear()` y `usePosStore.clearSession()` ejecutados en logout/clearSession; no restaurar `state.from` ante cambio de usuario en login; endpoints `GET /api/cash-register/<id>` y `GET /api/cash-register/active`; validación al montar POS de sesión abierta y pertenencia al usuario; `clearSession()` al cerrar corte de caja; cola offline asociada a `userId` y sincronización filtrada por el usuario activo
- [x] 2.5 Confirmaciones + protección del último admin (H-40) · commit 601044a · tests: `test_admin_cannot_deactivate_self`, `test_cannot_deactivate_last_admin`, `test_cannot_demote_last_admin` · backend impide auto-desactivación y degradar/desactivar al único admin activo (400); frontend añade modal de confirmación antes de: desactivar usuario, cancelar OC, desactivar proveedor y cerrar turno de caja
- [x] **Gate fase 2** · APROBADO (2026-10-08, 251 tests backend passed, frontend build OK, gate.ps1 en verde, commit 601044a)

## Fase 3: Continuidad · carril C, puede ir en paralelo a F2
- [x] 3.1 Respaldos: `PG_BIN_DIR`, asíncrono, programado, retención, offsite (H-12, H-42) · commit ea4315b · tests: `test_backup_fase3.py` (11 tests) · PG_BIN_DIR con autodetección, formato .dump, retención 14d/8w, captura OSError USB, backup en hilo al cerrar caja, CLI `flask backup` y `/api/health` con db y last_backup_at
- [x] 3.2 Restauración segura + test real (H-13) · commit 4344183 · tests: `test_restore_fase3.py` (5 tests) · `restore-backup.ps1` con lectura de `.env`, `PG_BIN_DIR`, verificación de servicio, respaldo previo de seguridad, flags `--single-transaction --exit-on-error`, y protocolo en `docs/simulacro-restauracion.md`
- [x] 3.3 Servicio de Windows, instaladores, seed y `.env.example` (H-23, H-37, H-51) ⚠️ admin · commit bb893d5 · tests: `test_service_install_fase3.py` (5 tests) · `install-service.ps1` con NSSM y firewall, migración `d4e5f6a7b8c9` para `purchase_order_folio_seq`, `seed_roles` sincroniza permisos, `requirements-dev.txt` separado y scripts de build/instalación con verificación de Python y `$LASTEXITCODE`
- [x] 3.4 Logs, health y `error_id` (H-36) · commit d43029e · tests: `test_observability_fase3.py` (4 tests) · `RotatingFileHandler` en `logs/pos.log`, `/api/health` con espacio en disco, `error_id` correlacionado en 500 y aborto al arrancar si falla import de blueprint
- [ ] **Gate fase 3**

## Fase 4: Operación de tienda
- [ ] 4.1 Zona horaria `America/Mexico_City` (H-21, UI-04)
- [ ] 4.2 Impresora por caja, ESC/POS, cajón y reimpresión (H-22) ⚠️ hardware
- [ ] 4.3 Modo offline fiable (H-24) ⚠️ HTTPS sí/no
- [ ] 4.4 Stock inicial, inactivos y búsqueda (H-26, H-43, H-38)
- [ ] 4.5 Email opcional + mensajes en español (H-28)
- [ ] 4.6 Concurrencia: sesión única y bloqueos (H-31)
- [ ] **Gate fase 4**

## Fase 5: UI, UX y accesibilidad
- [ ] 5.1 Dashboard y configuración con datos reales (H-27, UI-11)
- [ ] 5.2 Query keys + invalidaciones (H-29)
- [ ] 5.3 Esc seguro, sin "Crédito" (H-30, H-53)
- [ ] 5.4 Campana, reportes y catálogos duplicados (H-44, H-49, H-54, UI-13)
- [ ] 5.5 Contraste y foco (UI-01, UI-02, UI-06, UI-14)
- [ ] 5.6 Responsive con drawer (UI-03, UI-05, UI-08, UI-09, UI-17)
- [ ] 5.7 Tipografía y formato de cantidades (UI-07, UI-10)
- [ ] 5.8 Textos y pulido (UI-12, UI-15, UI-16)
- [ ] **Gate fase 5**

## Fase 6: Calidad continua · la 6.3 se adelanta después del gate F0
- [ ] 6.1 Tests sin app context compartido + rollbacks (H-34)
- [ ] 6.2 Vitest + Playwright
- [ ] 6.3 CI, hooks versionados, `tools/` y README (H-50)
- [ ] 6.4 Dependencias, CORS y paginación (H-35, H-45)
- [ ] 6.5 Constraints, índices, `parse_date`, folios (H-33, H-32, H-52) ⚠️ folios
- [ ] 6.6 Limpieza del frontend (H-41, H-46, H-47, H-48, H-55)
- [ ] **Gate fase 6**
- [ ] **Re-revisión completa** (`/revision-agentes`, los 6 revisores)

## Contratos de API
_(El carril A documenta aquí cada endpoint o campo nuevo antes de que el carril B lo consuma.)_

### `POST /api/sales/quote` (Subfase 1.2.1, H-04)
- **Propósito:** Cotización y cálculo autoritativo en servidor de líneas, descuentos, IVA (redondeo `HALF_EVEN` por línea) y totales sin crear la venta ni alterar inventario.
- **Autenticación:** Requerida (`Bearer <token>`, permiso `ventas:crear`).
- **Request Body (JSON):**
  ```json
  {
    "items": [
      {
        "product_id": 1,
        "quantity": "2.000",
        "discount_percent": "5.00"
      }
    ],
    "session_id": 1
  }
  ```
  *(Nota: `session_id` y `discount_percent` son opcionales. `unit_price` y `tax_rate` se ignoran si se envían).*
- **Response (200 OK):**
  ```json
  {
    "lines": [
      {
        "product_id": 1,
        "product_name": "Martillo",
        "product_sku": "POS-001",
        "quantity": "2.000",
        "unit_price": "100.00",
        "discount_percent": "5.00",
        "discount_amount": "10.00",
        "tax_rate": "16.00",
        "tax_amount": "30.40",
        "subtotal": "190.00",
        "total": "220.40"
      }
    ],
    "subtotal": "190.00",
    "discount_total": "10.00",
    "tax_total": "30.40",
    "total": "220.40"
  }
  ```
- **Errores:**
  - `400 Bad Request`: `{"error": "<mensaje>"}` si el producto está inactivo, no existe, se envían fracciones en enteros, o el descuento excede el tope sin permiso.

### `POST /api/sales/` — Idempotencia con `client_uuid` (Subfase 1.4.1, H-05)
- **Propósito:** Creación atómica e idempotente de ventas. Si se envía `client_uuid` y ya existe una venta procesada con ese identificador, el servidor responde con la venta existente (200/201) sin duplicar deducción de stock ni pagos.
- **Autenticación:** Requerida (`Bearer <token>`, permiso `ventas:crear`).
- **Campo añadido en Request Body (JSON):**
  - `client_uuid`: string UUID v4 (ej. `"550e8400-e29b-41d4-a716-446655440000"`). Opcional para compatibilidad, requerido para el frontend POS.
### `POST /api/sales/<id>/return` — Devolución con sesión y método de reembolso (Subfase 1.5.3, H-08)
- **Propósito:** Registro de devolución trazable asociada a una sesión de caja específica y método de desembolso para que el corte de caja y los reportes puedan deducir los reembolsos en efectivo con exactitud.
- **Autenticación:** Requerida (`Bearer <token>`, permiso `ventas:cancelar`).
- **Campos añadidos en Request Body (JSON):**
  - `session_id`: integer opcional (id de `CashRegisterSession` abierta). Si se envía, debe estar en estado `'abierta'` y pertenecer al usuario (o requerir `caja:supervisar`).
  - `refund_method`: string (`"efectivo"`, `"tarjeta"`, `"transferencia"`). Por defecto `"efectivo"`.
  - `items`: array de objetos `{"sale_item_id": int, "quantity": string/number}` (requerido).
  - `reason`: string motivo de la devolución (requerido).
- **Campos añadidos en Response (200 OK):**
  - `session_id`: integer / null.
  - `refund_method`: string (`"efectivo"`, `"tarjeta"`, `"transferencia"`).

### `GET /api/sales/<id>` — Detalle con fracciones y disponibilidad devuelta (Subfase 1.5.4, H-25)
- **Propósito:** Informa para cada ítem de venta si permite fracciones (`allows_fractions`), la cantidad acumulada devuelta (`returned_quantity`) y la cantidad restante disponible para devolución (`available_quantity`).
- **Autenticación:** Requerida (`Bearer <token>`, permiso `ventas:ver`).
- **Campos añadidos en cada ítem de `items`:**
  - `allows_fractions`: boolean (`true` si la unidad de medida admite decimales, `false` si es entero).
  - `returned_quantity`: string decimal con 3 decimales (ej. `"1.000"`).
  - `available_quantity`: string decimal con 3 decimales (ej. `"2.000"`).

### Corte de caja y reportes con devoluciones y reembolsos (Subfase 1.6, H-08)
- **Corte de caja (`POST /api/cash-register/<id>/close`):**
  - `expected_cash = opening_amount + efectivo_ventas (completada, devolucion_parcial, devolucion_total) - reembolsos_efectivo_sesion`.
  - Escenario QA-08 probado y validado con sobrante exacto de `$0.00`.
- **Resumen de caja (`GET /api/cash-register/<id>/summary`):**
  - Incluye ventas en estados de devolución y deduce los reembolsos por método de pago y en `grand_total`.
### `GET /api/config/branding` — Información visual de marca pública (Subfase 2.3, H-19)
- **Propósito:** Permite a todos los operadores y clientes autenticados (incluso con roles sin permiso de administración como cajeros) consultar los datos visuales de la tienda (nombre, subtítulo, ícono y color del logo) sin provocar un 403 Forbidden.
- **Autenticación:** Requerida o accesible en la aplicación POS.
- **Response (200 OK):**
  ```json
  {
    "business_name": "Ferretería El Clavo",
    "company_name": "Ferretería El Clavo",
    "company_subtitle": "VRNTAS POS",
    "company_logo_icon": "ShoppingCart",
    "company_logo_color": "primary",
    "business_rfc": "XAXX010101000",
    "business_address": "Av. Principal #123",
    "business_phone": "555-123-4567",
    "logo_url": ""
  }
  ```

## Decisiones del usuario
| Fecha | Tema | Decisión |
|---|---|---|
| 2026-10-06 | Subfase 0.2.4: Respaldo y rotación en PostgreSQL | Usuario aprobó respaldo con pg_dump, rotación de contraseña de pos_user y listen_addresses='localhost' |
| 2026-10-06 | Subfase 1.1: Tope de descuento | Usuario eligió 0% (estricto: cajeros sin permiso 'ventas:descuento' no pueden aplicar descuento) |
| 2026-10-06 | Fase 1: Ramas Git | Usuario eligió crear 'fix/fase-1' directamente desde 'fix/fase-0' |

## Hallazgos nuevos
_(Problemas encontrados durante la ejecución, fuera del alcance de la subfase. El orquestador decide en qué fase entran.)_

