# Progreso del plan de corrección

**Estado:** `[ ]` pendiente · `[~]` en curso · `[x]` hecha · `[!]` bloqueada
**Formato de cada línea al cerrarla:** `[x] N.M Título (H-xx) · commit <hash> · tests: <nombres> · notas`

Este archivo lo actualiza el orquestador (`/orquestador-correccion`). Es la fuente de verdad del avance.

## Fase 0: Contención inmediata · rama `fix/fase-0`
- [ ] 0.1 Cerrar `printer_path` / escritura arbitraria (H-02)
- [ ] 0.2.1 Rotar secretos del `.env` local (H-10)
- [ ] 0.2.2 `config.py` sin fallbacks + validación al arrancar (H-10)
- [ ] 0.2.3 Instaladores generan secretos y contraseña de BD (H-10)
- [ ] 0.2.4 PostgreSQL: contraseña de `pos_user` y `listen_addresses` ⚠️ confirmar (H-10)
- [ ] 0.2.5 Seed sin `admin123` + `must_change_password` (H-11)
- [ ] 0.2.6 Rate limit del login (H-11)
- [ ] 0.3 Respaldos fuera de git y `BACKUP_DIR` fuera del repo (H-14)
- [ ] 0.4 `run.py` sin debug; `start.*` marcados como desarrollo (H-15)
- [ ] **Gate fase 0**

## Fase 1: Integridad de dinero e inventario · ramas `fix/fase-1-backend` (A) / `fix/fase-1-frontend` (B)
- [ ] 1.1 Precio, IVA y descuento autoritativos; inactivos y fracciones (H-01) ⚠️ tope de descuento · A
- [ ] 1.2.1 `POST /sales/quote` + `price_lines` compartido (H-04) · A
- [ ] 1.2.2 `getCartTotals` en centavos HALF_EVEN + uso del quote (H-04) · B
- [ ] 1.3 Cambio calculado en el servidor; sesión propia (H-16) · A
- [ ] 1.4.1 `client_uuid` idempotente (H-05) · A
- [ ] 1.4.2 Guard de doble clic en `handlePay` (H-05) · B
- [ ] 1.4.3 Offline solo ante error de red (H-03) · B
- [ ] 1.5.1 Devolución agrupa los items + bloqueo (H-06) · A
- [ ] 1.5.2 No cancelar una venta con devolución (H-07) · A
- [ ] 1.5.3 `SaleReturn.session_id` y `refund_method` (H-08) · A
- [ ] 1.5.4 Input de devolución según unidad + invalidación (H-25) · B
- [ ] 1.6 Corte y reportes con devoluciones y reembolsos (H-08) · A
- [ ] 1.7 Conteo físico por diferencia (H-20) · A
- [ ] 1.8 Suite de regresión de dinero completa · A
- [ ] **Gate fase 1**

## Fase 2: Trazabilidad y acceso
- [ ] 2.1 Auditoría persiste + cobertura completa (H-09, H-39) · A
- [ ] 2.2 Revocación de tokens: blocklist y `token_version` (H-17) · A
- [ ] 2.3 Permisos en la UI + branding + `editar_precio` (H-19) · A+B
- [ ] 2.4 Aislamiento entre usuarios: caché y store del POS (H-18) · B
- [ ] 2.5 Confirmaciones + protección del último admin (H-40) · A+B
- [ ] **Gate fase 2**

## Fase 3: Continuidad · carril C, puede ir en paralelo a F2
- [ ] 3.1 Respaldos: `PG_BIN_DIR`, asíncrono, programado, retención, offsite (H-12, H-42)
- [ ] 3.2 Restauración segura + test real (H-13)
- [ ] 3.3 Servicio de Windows, instaladores, seed y `.env.example` (H-23, H-37, H-51) ⚠️ admin
- [ ] 3.4 Logs, health y `error_id` (H-36)
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

## Decisiones del usuario
| Fecha | Tema | Decisión |
|---|---|---|

## Hallazgos nuevos
_(Problemas encontrados durante la ejecución, fuera del alcance de la subfase. El orquestador decide en qué fase entran.)_
