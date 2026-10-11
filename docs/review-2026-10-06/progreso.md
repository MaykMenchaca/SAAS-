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
- [x] **Gate fase 3** · APROBADO (2026-10-10, 276 tests backend passed, frontend build OK, gate.ps1 en verde)

## Fase 4: Operación de tienda · rama `fix/fase-4` (desde `fix/fase-3`)
- [x] 4.1 Zona horaria `America/Mexico_City` (H-21, UI-04) · commit a7db395 · tests: `test_timezone.py` (7: `test_venta_19h_cuenta_en_dia_local`, `test_folio_usa_fecha_local`, `test_folio_orden_compra_usa_fecha_local`, `test_reporte_sin_fechas_usa_dia_local`, `test_ticket_muestra_hora_local`, `test_local_day_bounds_mexico`, `test_local_today_con_reloj_inyectado`), suite 283 passed, build OK · `APP_TIMEZONE` + `app/utils/timeutil.py`; reportes y dashboard con días locales en intervalo [inicio, fin) y `date_trunc` sobre `timezone(tz, created_at)`; folios V-/OC-, nombre/retención de respaldos y hora del ticket en hora local; `tzdata` añadido a requirements (Windows no trae base de zonas); frontend `src/lib/dates.ts` (`localISODate`) en dashboard y reportes
- [x] 4.2 Impresora por caja, ESC/POS, cajón y reimpresión (H-22) ⚠️ hardware · commit 26e80b2 · tests: `test_printer_fase4.py` (18: `test_ticket_usa_config_empresa`, `test_encoding_acentos_mayusculas`, `test_corte_gs_v`, `test_venta_en_efectivo_abre_cajon`, `test_reimpresion_no_abre_cajon`, `test_reintento_idempotente_no_reabre_cajon`, `test_venta_sincronizada_offline_no_abre_cajon`, `test_escritura_con_timeout`, `test_admin_configura_impresora_de_caja`, …); `test_printer.py` ajustado (encabezado desde config y corte GS V) · `cash_registers.printer_path/printer_codepage` (migración `a4f2c1d0e9b8`, **sin aplicar a pos_db**), ESC t + transliteración, ESC d 4 + GS V, timeout 5 s, cajón automático en efectivo (best-effort), pestaña Configuración → Cajas y botón "Reimprimir ticket" · **PENDIENTE: prueba con impresora y cajón físicos**
- [x] 4.3 Modo offline fiable (H-24) ⚠️ HTTPS sí/no · commit 0bbd149 · verificación: `npm run build` OK (sin framework de tests en frontend hasta 6.2); prueba en navegador con servidor caído pendiente para el gate F4 · timeout axios 15 s, refresh con error de red no cierra sesión, `auth-store.offline`, sincronizador único (mutex de módulo, backoff 5 s→5 min, ping `/api/health` 30 s, `open_drawer:false`), `rejectedSales` + bandeja con "Descartar" confirmado, indicador "N ventas pendientes", ticket offline con usuario real y "PENDIENTE DE SINCRONIZAR", F8 deshabilitado para id<0; alcance documentado en `DEPLOYMENT.md`
- [x] 4.4 Stock inicial, inactivos y búsqueda (H-26, H-43, H-38) · commit 67b2b44 · tests: `test_catalog_fase4.py` (10: `test_producto_nuevo_aparece_en_stock_y_low_stock`, `test_avg_cost_del_cliente_se_ignora_al_crear`, `test_busqueda_tolera_errores_qa18` ×4, `test_busqueda_ordena_por_relevancia_y_sin_ruido`, `test_busqueda_por_sku_y_codigo_sigue_funcionando`, `test_reactivar_producto`, `test_reactivar_requiere_permiso`) · `Stock(0)` y `avg_cost=purchase_price` al crear; migración de datos `b5e3d2c1f0a9` (**sin aplicar a pos_db**, SQL validado en transacción revertida); `POST /products/<id>/reactivate`; `word_similarity > 0.4` (calibrado con QA-18; 0.3 del plan dejaba pasar "Tornillo" al buscar "martillo"); casilla "Mostrar inactivos" y botón "Reactivar"
- [x] 4.5 Email opcional + mensajes en español (H-28) · commit ad06049 · tests: `test_users_fase4.py` (7: `test_crear_usuario_sin_email`, `test_crear_usuario_con_email_vacio_o_nulo` ×2, `test_dos_usuarios_sin_email`, `test_email_invalido_con_mensaje_en_espanol`, `test_mensajes_de_validacion_en_espanol`, `test_traduccion_de_mensajes_anidados`) · email `load_default=None, allow_none`, "" → None; `users.email` nullable (migración `c7a1e4b2d3f6`, **sin aplicar a pos_db**); mapa global de mensajes de Marshmallow en `utils/errors.py`; el frontend ya enviaba `null`
- [x] 4.6 Concurrencia: sesión única y bloqueos (H-31) · commit f154c8a · tests: `test_concurrency_fase4.py` (6, carreras reales con dos hilos: `test_no_abre_dos_sesiones_misma_caja`, `test_caja_cerrada_permite_nueva_sesion`, `test_abrir_caja_con_carrera_responde_400`, `test_recepcion_no_excede_pendiente`, `test_venta_durante_cierre_de_caja_se_rechaza`, `test_avg_cost_con_cuatro_decimales`); ajustados `test_receive_updates_avg_cost` y `test_full_purchase_order_cycle` (4 decimales) · índice parcial `uq_cash_session_open` (tabla real `cash_register_sessions`), `with_for_update()` en venta, cierre y recepción de OC, `avg_cost Numeric(12,4)`; migración `d8b2f5c3e4a7` (**sin aplicar a pos_db**; se detiene si hay cajas con dos sesiones abiertas)
- [x] 4.7 POS no borra sesión ni carrito ante errores de red (OPS-01, gate F4) · commit 9d30e0e · verificación: `tsc -b` OK; prueba en navegador con servidor caído pendiente · la sesión solo se descarta ante 404/403; sin refetch por foco
- [x] 4.8 Catálogo local para vender sin servidor + búsqueda exacta por código (OPS-02, OPS-14, gate F4) · commit 1d1079d · tests: `test_pos_catalog_fase4.py` (7) · `GET /products/by-code/<code>` y `GET /products/pos-catalog`; copia en `localStorage` (`lib/offline-catalog.ts`) refrescada cada 10 min; escáner y cuadrícula usan la copia ante error de red
- [x] 4.9 Servicio de Windows con waitress en la LAN + actualización segura (OPS-06, OPS-13, gate F4) · commit 484863a · tests: `test_deploy_fase4.py` (5) · NSSM con `waitress --listen=0.0.0.0` + `SERVE_FRONTEND`, `start-production` aborta si falla la migración, `update-production.ps1` con `pg_dump` previo, `.env.example` alineado (OPS-05) · ⚠️ requiere reinstalar el servicio como administrador donde ya esté instalado
- [x] 4.10 Endurecimiento: ruta de impresora, `.env.example`, `APP_TIMEZONE`, devolución vs cierre, auditoría en hora local, aviso de pendientes en el corte (OPS-04, OPS-05, OPS-08, OPS-11, OPS-07 parcial, gate F4) · commit 619fc6e · tests: `test_hardening_fase4.py` (14, incluye carrera devolución vs cierre)
- [x] 4.11 Topología de impresión: impresoras USB en cada caja vía agente local (OPS-03, OPS-12) ⚠️ decisión tomada: USB por caja · commit 85750e0 · tests: `test_print_agent_fase4.py` (16), suite 366 passed · cola `print_jobs` con caducidad (cajón 30 s), `/api/print-agent/*` con `X-Agent-Key`, clave por caja (solo hash), agente `tools/print-agent` (RAW vía pywin32) e instalador NSSM, UI en Configuración → Cajas; migración `e9c4a6b7d8f1` aplicada a `pos_db` (respaldo `pre-fase-4-11.dump`) · **PENDIENTE:** prueba con impresora USB real en una caja
- [x] 4.12 Robustez de la cola de impresión, agente e instaladores (OPS-17, OPS-18, OPS-19, OPS-20, OPS-21, OPS-22, OPS-24; 2ª re-revisión) · commit 671e021 · tests: `test_print_agent_robustez_fase4.py` (14) · confirmación/expiración de trabajos, 409 en transiciones inválidas, `last_seen` cada 10 s, estado de la impresora antes de escribir (sin verificar con hardware), instaladores idempotentes con ACL y clave en archivo protegido, `update-production` detiene antes de compilar y usa `PGPASSWORD`
- [x] 4.13 Persistencia offline robusta: catálogo fuera de la cuota de la cola, antigüedad visible y uso directo sin servidor (OPS-15, OPS-16, OPS-23; 2ª re-revisión) · commit e9a8d3a · verificación: `tsc -b` + build OK; prueba en navegador pendiente · catálogo en IndexedDB con copia en memoria, `persist` con storage que avisa si falla la cuota, fecha y antigüedad del catálogo en el aviso offline, uso directo de la copia si falla el ping
- [x] 4.14 Hallazgos nuevos de F4 (H-32 parcial, H-43, cost_at_sale, OPS-07, OPS-09, OPS-10, OPS-12, hook) · commit b2770eb · tests: `test_hallazgos_nuevos_fase4.py` (11), suite 391 passed · migración `a1b3c5d7e9f2` (**sin aplicar a pos_db**; al integrar con `fix/fase-5` habrá dos cabezas de Alembic —`a1b3c5d7e9f2` y `f2d5b8c9a0e1`— y hace falta una migración de unión) · hook local `.git/hooks/pre-commit` sin `echo.`
- [~] **Gate fase 4** · 2ª re-revisión: 0 Críticos/Altos abiertos (10 Medios/Bajos nuevos → 4.12/4.13) · 1ª re-revisión RECHAZADA (`re-revision-fase-4.md`: 4 Altos nuevos OPS-01/02/03/06) · automático APROBADO (2026-10-10, gate.ps1: 324 tests backend passed, frontend build OK, chequeos 0.1–4.3 en verde); cadena de migraciones `d4e5f6a7b8c9 → a4f2c1d0e9b8 → b5e3d2c1f0a9 → c7a1e4b2d3f6 → d8b2f5c3e4a7` validada en `pos_test_db` (upgrade, downgrade y upgrade) · **pendiente:** aplicar migraciones a `pos_db` (requiere confirmación + `pg_dump`), verificación manual en navegador (venta 19:00 local, ticket con empresa y acentos, cola offline con servidor caído), re-revisión `revisor-operacion` + `qa-funcional`, prueba con impresora física

## Fase 5: UI, UX y accesibilidad
- [x] 5.1 Dashboard y configuración con datos reales (H-27, UI-11) · commit 79112a0 · rama `fix/fase-5` (desde `fix/fase-4`, carril paralelo permitido por ORQUESTA tras gate F3) · tests: `test_dashboard_fase5.py` (3: `test_dashboard_incluye_periodo_anterior`, `test_dashboard_lista_sesiones_abiertas`, `test_dashboard_sin_sesiones_abiertas`) · deltas calculados (ocultos si base 0), banner desde `open_sessions`, `formatCurrency`, `useServerStatus`, versión desde `package.json`, "Reiniciar terminal" con `Modal` sin borrar la cola offline
- [x] 5.2 Query keys + invalidaciones (H-29) · commit 98d32ed · verificación: `tsc -b` + `npm run build` OK · `src/api/query-keys.ts` (`qk`, 90 claves migradas en 15 archivos) y `src/api/invalidate.ts` (`invalidateInventory`, `invalidateAfterSale`, `invalidateAfterPurchase`) aplicados en venta, cancelación, devolución, recepción de OC, ajuste, cierre de conteo y sincronización offline
- [x] 5.3 Esc seguro, sin "Crédito" (H-30, H-53) · commit 581556b · verificación: `tsc -b` + build OK · Esc ignorado en campos editables y con la paleta abierta, confirmación con `Modal` si hay más de 3 artículos, `stopPropagation` en la paleta, método "Crédito" eliminado
- [x] 5.4 Campana, reportes y catálogos duplicados (H-44, H-49, H-54, UI-13) · commit 720d7cd · tests: `test_catalog_duplicates_fase5.py` (5), `test_listar_ordenes_por_varios_estados` · popover de notificaciones (stock bajo, OC pendientes, ventas offline), rango de fechas validado, días sin ventas en 0, ticks es-MX, SVG con `role="img"`; índice `uq_categories_name_ci` y migración `f2d5b8c9a0e1` que unifica duplicados (**pendiente aplicar a pos_db** al integrar F5; en pos_db solo está "Herramientas Manuales" id 6 sin productos)
- [x] 5.5 Contraste y foco (UI-01, UI-02, UI-06, UI-14) · commit 6f9d9ae · verificación: `npm run build` OK, 375 tests backend passed · tokens `on-primary`/`on-danger`/`primary-text` WCAG AA (>=4.5:1), `:focus-visible` global accesible, login sin placeholder revelador y botón con validación descriptiva
- [x] 5.6 Responsive con drawer (UI-03, UI-05, UI-08, UI-09, UI-17) · commit 699f033 · verificación: `npm run build` OK, 375 tests backend passed · drawer off-canvas móvil con backdrop y auto-cierre, header móvil con botón hamburguesa, breadcrumbs compactos en <md, touch targets >=44px en controles y nav, tablas con scroll horizontal y inputs con `text-base lg:text-sm` evitando auto-zoom en iOS
- [x] 5.7 Tipografía y formato de cantidades (UI-07, UI-10) · componente estándar accesible `PageHeader` (h1 `text-2xl font-bold lg:text-3xl tracking-tight text-neutral-text-primary`), reemplazo global de tamaños arbitrarios `text-[9|10|11px]` por tokens accesibles `text-xs`, formato uniforme de cantidades discretas y límites de inventario `formatStockLimits` ("Mín: X / Máx: —")
- [x] 5.8 Textos y pulido (UI-12, UI-15, UI-16) · títulos dinámicos en pestaña de navegador `document.title = "${pageTitle} · ${brandName}"`, botones de navegación accesibles con `aria-label`, ortografía en español ("Respaldos", "Acciones", "Crear respaldo"), eliminación de clases redundantes de cursor
- [x] **Gate fase 5** · APROBADO (2026-10-11, 375 tests backend passed, frontend build OK, gate.ps1 en verde)

## Fase 6: Calidad continua · la 6.3 se adelanta después del gate F0
- [x] 6.1 Tests sin app context compartido + rollbacks (H-34) · tests: `test_h34_isolation.py` (3 tests) · decorador `@with_rollback` aplicado en todos los servicios mutadores (`SaleService`, `PurchaseOrderService`, `InventoryCountService`, `UserService`, `ProductService`, `InventoryService`), `expire_on_commit=False` en SQLAlchemy, `IsolatedClient` en tests con limpieza de sesión `_db.session.remove()` antes y después de cada llamada, y fixtures persistidas con commit en BD real
- [x] 6.2 Vitest + Playwright · Vitest configurado con 12 tests unitarios pasando (`pos-store.test.ts` para `getCartTotals`, `useBarcodeScanner.test.ts` con patrón latest ref, `useSyncQueue.test.ts` para sincronización offline y reintentos), y suite Playwright (`playwright.config.ts`, `e2e/critical-flows.spec.ts`) para flujos críticos (venta, devolución y corte)
- [x] 6.1-ajuste (Claude) · commit 51dd0e2 · bug real: la auditoría de configuración y de respaldos se perdía (log_action tras el commit); 5 tests rotos por el aislamiento de 6.1 corregidos (siembra sin commit / objetos fuera de sesión) · `test_auditoria_persistente_fase6.py` (3)
- [ ] 6.3 CI, hooks versionados, `tools/` y README (H-50) · en curso por Gemini (rama `fix/fase-6`)
- [ ] 6.4 Dependencias, CORS y paginación (H-35, H-45)
- [x] 6.5 Constraints, índices, `parse_date`, folios (H-33, H-32, H-52) ⚠️ folios · commit 7e9bc02 (rama `fix/fase-6-claude`, Claude) · tests: `test_modelo_datos_fase6.py` (12), suite 418 passed · CHECK stock/pagos, 6 índices + trigram declarado, IntegrityError → 409 (fechas → 400 desde 4.14), migración `c9d0e1f2a3b4` (**sin aplicar a pos_db**; datos verificados: 0 violaciones), folios con huecos documentados
- [x] 6.6 Limpieza del frontend (H-41, H-46, H-47, H-48, H-55) · commit 645d6f4 (rama `fix/fase-6-claude`, Claude) · Vitest 14 passed, build OK · sin `any`, SW solo en producción con versión y sin caché de /api, cantidades como texto, 422 de JWT cierra sesión, escáner configurable con preventDefault en ráfaga, `formatCurrency` en todos los montos
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

### `PATCH /api/cash-register/registers/<id>` — Impresora por caja (Subfase 4.2, H-22)
- **Autenticación:** rol `admin`. Auditado (`cash_register`, `update`).
- **Body (JSON, todos opcionales):** `printer_path` (ruta absoluta o `COMn`/`LPTn`; vacío o `null` la quita; UNC y relativas → 400), `printer_codepage` (`cp850` | `cp858` | `cp437` | `cp1252`; otra → 400), `name`.
- **Response 200:** `{"id", "name", "is_active", "printer_path", "printer_codepage"}`. `GET /api/cash-register/` devuelve los mismos campos.

### `POST /api/sales/` — `open_drawer` (Subfase 4.2, H-22)
- Campo opcional `open_drawer` (bool, default `true`). Con pago en efectivo y `open_drawer=true` el servidor abre el cajón de la caja de la sesión después del commit (best-effort). La cola offline debe enviar `open_drawer: false`. Un reintento idempotente (`client_uuid` ya existente) nunca abre el cajón.

### `POST /api/products/<id>/reactivate` (Subfase 4.4, H-43)
- **Autenticación:** permiso `productos:desactivar`. Auditado (`product`, `reactivar`).
- **Response 200:** el producto serializado con `is_active: true`. 404 si no existe.
- `GET /api/products/?include_inactive=true` lista también los inactivos.

### `GET /api/reports/dashboard` — periodo anterior y turnos abiertos (Subfase 5.1, H-27)
- Campos nuevos: `sales_prev_day`, `revenue_prev_day`, `sales_prev_month`, `revenue_prev_month` (mismo tramo de días del mes anterior) y `open_sessions: [{id, register, user_id, user, opened_at, revenue, count}]` (`revenue` neto de reembolsos de la sesión).

## Decisiones del usuario
| Fecha | Tema | Decisión |
|---|---|---|
| 2026-10-06 | Subfase 0.2.4: Respaldo y rotación en PostgreSQL | Usuario aprobó respaldo con pg_dump, rotación de contraseña de pos_user y listen_addresses='localhost' |
| 2026-10-06 | Subfase 1.1: Tope de descuento | Usuario eligió 0% (estricto: cajeros sin permiso 'ventas:descuento' no pueden aplicar descuento) |
| 2026-10-06 | Fase 1: Ramas Git | Usuario eligió crear 'fix/fase-1' directamente desde 'fix/fase-0' |
| 2026-10-11 | 6.5 Folios | Sin respuesta del usuario: default conservador, **folios con posibles huecos** (secuencias), documentado en `DEPLOYMENT.md` (revisable) |
| 2026-10-11 | 6.3 CI en GitHub | Sin respuesta: no se hace push; el CI queda escrito para que el usuario lo suba o lo autorice |
| 2026-10-11 | Reparto F6 | Gemini: 6.1, 6.2, 6.3 (rama `fix/fase-6`). Claude: 6.5, 6.6 y ajustes de 6.1 (rama `fix/fase-6-claude`, worktree `../pos-carril-c`) |
| 2026-10-10 | 5.4 Catálogos duplicados (H-54) | Usuario eligió **unificar y prevenir**: migración que une categorías por mayúsculas/espacios + índice único |
| 2026-10-10 | 4.11 Impresión en cajas remotas (OPS-03) | Usuario eligió **impresora USB en cada caja**: agente de impresión local por caja que toma trabajos de una cola en el servidor (pull; evita las restricciones del navegador hacia localhost) |
| 2026-10-10 | Gate F4 pendientes | El usuario respondió "okey, sigue con lo que resta del plan": se aplicaron las migraciones a `pos_db` con respaldo `pre-fase-4.dump`, se corrió la re-revisión y se abrió la Fase 5 en paralelo (carril B) |
| 2026-10-10 | Fase 4: decisiones ⚠️ | El usuario pidió avanzar con toda la fase 4 sin elegir; se tomó el default conservador: 4.2 se implementa con tests y la prueba con impresora física queda pendiente; 4.3 **sin HTTPS local**, alcance del offline documentado en `DEPLOYMENT.md` (revisable) |

## Hallazgos nuevos
_(Problemas encontrados durante la ejecución, fuera del alcance de la subfase. El orquestador decide en qué fase entran.)_
- ✅ (resuelto en 4.14) (4.1) Una fecha inválida en `from`/`to` de `/api/reports/*` sigue respondiendo 500 (`parse_local_date` lanza `ValueError` sin manejador 400). Corresponde a H-32 / subfase 6.5.
- ✅ (resuelto en 4.14, hook local; versionarlo sigue en 6.3) (4.1) El hook `.git/hooks/pre-commit` imprime `echo.: command not found` (sintaxis de cmd en script sh); no bloquea el commit. Candidato a 6.3 (hooks versionados).
- ✅ (resuelto en 4.14) (4.4) `GET /api/inventory/stock` y la valuación de inventario siguen excluyendo productos inactivos aunque tengan existencias (parte de H-43 no cubierta por el plan 4.4: solo pedía el filtro y reactivar en Productos). Candidato a 5.4 o 6.x.
- ✅ (resuelto en 4.14) (4.6) `sale_items.cost_at_sale` sigue en `Numeric(12,2)`: el costo unitario de cada venta se redondea a centavos aunque `avg_cost` ya tenga 4 decimales. Afecta poco al reporte de margen; candidato a 6.5 (constraints/precisión).
- ✅ (resuelto en 4.14) (gate F4) OPS-09: posible deadlock por bloquear stock en orden arbitrario (`inventory_service.move_stock`). Candidato a 6.5.
- ✅ (resuelto en 4.14) (gate F4) OPS-10: reenvío concurrente con el mismo `client_uuid` responde 500 (IntegrityError en `flush`). Candidato a 6.1/6.5.
- ✅ (resuelto en 4.14) (gate F4) OPS-12: con agente (4.11) el cajón caduca a los 30 s; en modo "impresora en el servidor" sigue el hilo con timeout de 5 s que puede quedar colgado. Candidato a 6.x.
- ✅ (resuelto en 4.14) (gate F4) OPS-07: ventas offline rechazadas sin opción de recaptura ("Cargar al carrito"). La 4.10 solo agrega el aviso en el corte.
- (gate F4) Las migraciones de fases 1–3 (`e5c2b1890a12` … `d4e5f6a7b8c9`) nunca se habían aplicado a `pos_db`; se aplicaron el 2026-10-10 junto con las de F4 (respaldo `pre-fase-4.dump`).
- (4.14) Pruebas en paralelo: `pos_test_db` tiene esquemas `lane_a`…`lane_d` para que varios agentes corran pytest sin chocar (`TEST_DATABASE_URL=...pos_test_db?options=-csearch_path%3Dlane_c,public`). Documentarlo en el README (6.3).
- (6.5) La opción de configuración `allow_negative_stock` no la usa ningún código (las ventas siempre exigen existencias) y ahora la BD prohíbe stock negativo: quitarla de la configuración o implementarla. Candidato a una subfase de UI/config.
- (6.5) Migraciones pendientes de aplicar a `pos_db`: `a1b3c5d7e9f2` (4.14), `f2d5b8c9a0e1` (5.4), `b7c8d9e0f1a2` (unión) y `c9d0e1f2a3b4` (6.5). Aplicarlas al integrar con `update-production.ps1` (respaldo previo).
