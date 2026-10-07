# Plan de corrección: POS Retail VRNTAS

**Base:** [hallazgos.md](hallazgos.md) (revisión del 2026-10-06)
**Principio rector:** primero lo que expone el sistema o hace perder dinero o datos, después lo que rompe la operación diaria y al final la calidad y la experiencia.
**Regla para cada subfase:** cada corrección de lógica entra **con su test de regresión**, que debe fallar antes y pasar después. Al cerrar cada fase hay que pasar `pytest`, `npm run build` y el checklist de QA de esa fase.

**Esfuerzo:** S = menos de medio día · M = 1 a 2 días · L = más de 2 días

| Fase | Objetivo | Hallazgos | Esfuerzo | ¿Bloquea la puesta en tienda? |
|---|---|---|---|---|
| 0 | Contención inmediata | H-02, H-10, H-11, H-14, H-15 | S | Sí |
| 1 | Integridad del dinero y del inventario | H-01, H-04…H-08, H-16, H-20, H-03, H-05 | L | Sí |
| 2 | Trazabilidad y control de acceso | H-09, H-17, H-18, H-19, H-39, H-40 | M | Sí |
| 3 | Continuidad: respaldos y despliegue | H-12, H-13, H-23, H-36, H-37, H-42, H-51 | M | Sí |
| 4 | Operación de tienda | H-21, H-22, H-24, H-25, H-26, H-28, H-31, H-38, H-43 | L | Parcial |
| 5 | Interfaz, UX visual y accesibilidad | H-27, H-29, H-30, H-44, H-49, H-53, H-54, UI-01…17 | L | Parcial (UI-03: tablet en caja) |
| 6 | Calidad continua y deuda técnica | H-32…H-35, H-41, H-45…H-48, H-50, H-52, H-55 | M | No |

---

## Fase 0: Contención inmediata (hoy, antes de cualquier otra cosa)

Objetivo: cerrar lo que alguien podría explotar hoy mismo, sobre todo porque el repo es público.

### 0.1 Cerrar la escritura arbitraria de archivos (H-02)
- Eliminar `printer_path` del body en `backend/app/api/printing.py` (`_print_options`). `PrinterService.send_to_printer` debe usar solo `PRINTER_DEVICE_PATH` o un ID de impresora de una lista blanca.
- Rechazar rutas UNC y relativas, y capturar `OSError` → 503 "Impresora no disponible".
- **Test:** un cajero que manda `printer_path` recibe 400 o el campo se ignora, y no se crea ningún archivo.

### 0.2 Secretos y credenciales (H-10, H-11)
- **0.2.1** Regenerar ahora en el `.env` local un `SECRET_KEY` y un `JWT_SECRET_KEY` distintos, de 64 bytes, con `secrets.token_urlsafe`.
- **0.2.2** Quitar los fallbacks de `backend/app/config.py`. La app debe abortar al arrancar si los secretos faltan, miden menos de 32 bytes, son iguales entre sí o contienen "cambiar".
- **0.2.3** Que `install-production.ps1` y `setup-db.ps1` generen secretos y una contraseña de base de datos aleatorios, en vez de copiar el ejemplo o usar `pos_pass`.
- **0.2.4** Cambiar la contraseña de `pos_user` en PostgreSQL. Poner `listen_addresses='localhost'`.
- **0.2.5** Seed: crear el admin solo si la base está vacía, con contraseña aleatoria o pedida en consola, y marcar `must_change_password`. Quitar `admin123` de `start.bat`, `start.ps1` y `seed.py`.
- **0.2.6** Rate limit en `/api/auth/login` (por IP y por usuario, con bloqueo temporal).
- **Verificación:** con un JWT firmado con el secreto de ejemplo → 401. Con 10 intentos fallidos → 429.

### 0.3 Que los respaldos no lleguen al repo (H-14)
- Agregar a `.gitignore`: `backend/backups/`, `backups/`, `*.dump`, `*.sql`, `*.backup` y `backend/logs/`.
- Mover `BACKUP_DIR` por defecto fuera del repo (p. ej. `%PROGRAMDATA%\pos-vrntas\backups`).

### 0.4 Apagar el modo debug (H-15)
- En `backend/run.py`, tomar `debug` de una variable de entorno (por defecto `False`) y escuchar en `127.0.0.1`.
- Marcar `start.bat` y `start.ps1` como "solo desarrollo", o redirigirlos a `start-production.ps1`.

---

## Fase 1: Integridad del dinero y del inventario

Objetivo: que cada peso y cada pieza cuadren. Es la fase más importante y la más grande.

### 1.1 Precio autoritativo del servidor (H-01)
- **1.1.1** En `sale_service.create_sale`, tomar `unit_price` y `tax_rate` de `Product` e ignorar los del cliente (o validar que coincidan).
- **1.1.2** Descuento: tope configurable (`max_discount_percent`). Por encima de él, exigir un permiso nuevo `ventas:descuento` o la autorización de un supervisor.
- **1.1.3** Rechazar productos inactivos y cantidades fraccionarias cuando `unit.allows_fractions = False`.
- **1.1.4** Corregir los fixtures de `conftest.py` que venden a un precio distinto al del catálogo.

### 1.2 Un solo cálculo de totales (H-04)
- **1.2.1** Crear un endpoint `POST /api/sales/quote` que devuelva las líneas y el total oficial con el mismo código que `create_sale`.
- **1.2.2** En el frontend (`pos-store.ts:getCartTotals`), replicar el redondeo por línea con HALF_EVEN usando centavos enteros, y usar el total del quote para el cobro y el botón "Exacto".
- **1.2.3** Test de paridad con casos conocidos (p. ej. 2 × $12.85 al 16 %, y Desarmador + Brocha).

### 1.3 Pagos y cambio calculados en el servidor (H-16)
- Calcular el cambio como `efectivo − (total − pagos no efectivo)` e ignorar el `change_amount` del cliente. Rechazar sobrepagos con tarjeta o transferencia.
- Validar que `session.user_id == usuario actual` para vender y cerrar caja, salvo con el permiso `caja:supervisar`.

### 1.4 Idempotencia y doble envío (H-05, H-03)
- **1.4.1** Agregar la columna `sales.client_uuid` UNIQUE (con migración). El frontend genera un UUID por intento de venta. Si llega repetido, se devuelve la venta existente.
- **1.4.2** En `pos.tsx:handlePay`, un guard síncrono con `useRef` para ignorar el segundo clic.
- **1.4.3** Pasar a offline **solo** ante un error de red (`!err.response` o timeout). Con 4xx/5xx, dejar el modal abierto, mostrar `errorMessage` y conservar el carrito.

### 1.5 Devoluciones y cancelaciones (H-06, H-07, H-25)
- **1.5.1** Agrupar las cantidades por `sale_item_id` antes de validar, y bloquear la venta con `with_for_update()`.
- **1.5.2** `cancel_sale`: solo permitirlo en estado `completada` y sin devoluciones.
- **1.5.3** Agregar a `SaleReturn` los campos `session_id` (sesión abierta en ese momento) y `refund_method`, con migración.
- **1.5.4** UI: input con `step` según `allows_fractions` e invalidar la venta en caché tras devolver (`pages/returns.tsx`).

### 1.6 Corte de caja y reportes correctos (H-08)
- `expected_cash` = fondo + efectivo neto de ventas en estado `completada`, `devolucion_parcial` o `devolucion_total`, − reembolsos en efectivo de la sesión.
- Aplicar el mismo criterio en `/summary`, en `reports.py` (ingresos, márgenes, top productos) y en el dashboard: restar `SaleReturnItem.refund_amount` y la cantidad devuelta.
- **Test:** el escenario de QA-08 debe dar sobrante $0.

### 1.7 Conteo físico por diferencia (H-20)
- Aplicar el ajuste como diferencia (`contado − esperado`) o tomar una foto del stock al capturar. Agregar UNIQUE en `(inventory_count_id, product_id)`.

### 1.8 Tests de regresión de dinero
- Un test por escenario: precio manipulado, devolución duplicada, cancelar tras devolución, corte con devoluciones, sobrepago y cambio, doble envío con el mismo UUID, conteo con ventas intermedias.

---

## Fase 2: Trazabilidad y control de acceso

### 2.1 Arreglar la auditoría (H-09, H-39)
- **2.1.1** Que `log_action` participe en la transacción del servicio (llamarlo antes del commit). Los intentos de login fallidos necesitan su propio commit.
- **2.1.2** Agregar auditoría a devoluciones, ajustes, conteos, usuarios y roles, apertura y cierre de caja, recepciones, proveedores, categorías y unidades, con valor anterior y nuevo.
- **2.1.3** Test que lea `audit_logs` con una sesión nueva después del request (corrige el falso positivo de H-34).

### 2.2 Revocación de tokens (H-17)
- Blocklist por `jti` (tabla o caché) en el logout. Agregar `token_version` en `User`, que se incrementa al desactivar, cambiar el rol o cambiar la contraseña.
- `user_lookup_loader`: comprobar `is_active` y los permisos en la BD en cada request (con un cache corto).
- Access token de 15 a 30 min con refresh automático (ya existe el interceptor).

### 2.3 La interfaz respeta los permisos (H-19)
- Helper `can(perm)` y componente `<RequirePermission>` en `App.tsx`. Filtrar `navSections`, la paleta de comandos y los badges (`enabled: can(...)`).
- La página inicial depende del rol: el cajero va a `/pos`.
- Endpoint público `GET /api/config/branding` para el nombre y el logo.
- Aplicar `productos:editar_precio` en `PATCH /products` cuando se cambian precios o costos. Hacer `avg_cost` de solo lectura.

### 2.4 Aislamiento entre sesiones de usuario (H-18)
- En el logout: `queryClient.clear()` y `usePosStore.clearSession()`. No restaurar `state.from` cuando cambia el usuario.
- Al montar el POS, validar que la sesión de caja siga abierta y sea del usuario. Limpiarla al cerrar el corte.
- Asociar la cola offline al `user_id`.

### 2.5 Salvaguardas en acciones destructivas (H-40)
- Reutilizar el modal de confirmación de `products.tsx` en: cancelar OC, desactivar proveedor o usuario, y cerrar turno.
- El backend impide desactivarse a uno mismo o desactivar al último admin.

---

## Fase 3: Continuidad (respaldos, restauración y despliegue)

### 3.1 Respaldos que funcionan (H-12, H-42)
- **3.1.1** `PG_BIN_DIR` en la configuración, con autodetección de `C:\Program Files\PostgreSQL\*\bin` y validación al arrancar.
- **3.1.2** El respaldo del cierre de caja corre en un hilo aparte, y la respuesta incluye `backup: {ok, error}` con un aviso en la interfaz.
- **3.1.3** Comando `flask backup` y Tarea programada diaria.
- **3.1.4** Retención (14 diarios + 8 semanales), extensión `.dump`, borrar los archivos parciales si falla, capturar `OSError` de la USB.
- **3.1.5** Copia fuera del equipo (carpeta en la nube o NAS) y alerta si el último respaldo externo tiene más de 24 h.
- **3.1.6** Fecha del último respaldo visible en `/api/health` y en Configuración.

### 3.2 Restauración segura (H-13)
- `restore-backup.ps1`: leer `DATABASE_URL` del `.env`, usar `PG_BIN_DIR`, hacer un respaldo previo automático, usar `--single-transaction --exit-on-error` y verificar que el servicio esté detenido.
- Test de integración real: dump → restore en una base temporal → comparar conteos.
- Documentar un simulacro trimestral.

### 3.3 Instalación y servicio de Windows (H-23, H-37, H-51)
- **3.3.1** Instalar el backend como servicio (NSSM) con reinicio automático y dependencia de `postgresql-x64-18`.
- **3.3.2** Que los scripts revisen `$LASTEXITCODE` y la versión de Python, usen `npm ci` y separen `requirements-dev.txt`. Agregar una regla de firewall para el puerto 5000.
- **3.3.3** Seed solo en la instalación o la actualización. Mover las secuencias de folio a una migración. Sincronizar los permisos de los roles del sistema.
- **3.3.4** Completar `.env.example` (`PG_BIN_DIR`, `PRINTER_*`, `APP_TIMEZONE`, `BUSINESS_*`). Quitar `FLASK_ENV`.

### 3.4 Observabilidad (H-36)
- `RotatingFileHandler` en `logs/pos.log`. `/api/health` con `SELECT 1`, último respaldo y espacio en disco. ID de correlación en los 500. Si falla el import de un blueprint, que la app falle al arrancar.

---

## Fase 4: Operación de tienda

### 4.1 Zona horaria (H-21)
- `APP_TIMEZONE=America/Mexico_City`. Calcular los límites del día con `zoneinfo`, usar `date_trunc('day', created_at AT TIME ZONE :tz)` y la fecha local en folios y nombres de respaldo. En el frontend, formatear con la zona local.

### 4.2 Impresión y cajón (H-22)
- Impresora por caja registradora (`cash_registers.printer_path`, configurada por el admin).
- Enviar `ESC t` con la página de códigos y transliterar los caracteres que no existan en ella. Cortar con `ESC d 4` + `GS V`. Datos de la empresa y pie desde `config_service`.
- Abrir el cajón automáticamente al cobrar en efectivo. Botón "Reimprimir" en el historial de ventas.
- Probar con la impresora real.

### 4.3 Modo offline fiable (H-24)
- Un solo sincronizador global con candado, backoff y ping a `/api/health`.
- Bandeja de "ventas rechazadas" visible e indicador de "N pendientes".
- Timeout de 10 a 15 s en axios. No cerrar la sesión ante un error de red al recargar.
- Ticket offline con el usuario real y marcado como "pendiente". Deshabilitar F8 para ids negativos.
- Decidir: HTTPS local para tener un service worker real en las cajas, o documentar el alcance limitado del modo offline.

### 4.4 Catálogo e inventario (H-26, H-43, H-38)
- Crear `Stock(quantity=0)` al dar de alta un producto e inicializar `avg_cost` con `purchase_price`.
- Filtro "Mostrar inactivos" y acción para reactivar.
- Búsqueda con `word_similarity`/`%>` y un umbral calibrado con los casos de QA-18.

### 4.5 Usuarios y validaciones (H-28)
- Email opcional (`allow_none`). Traducir al español los mensajes de Marshmallow.

### 4.6 Concurrencia (H-31)
- Índice único parcial para una sola sesión abierta por caja. `with_for_update()` en la sesión (venta y cierre) y en la `PurchaseOrder` (recepción). `avg_cost` con 4 decimales.

---

## Fase 5: Interfaz y UX visual

### 5.1 Datos reales en el dashboard (H-27)
- Calcular las tendencias contra el periodo anterior en `/reports/dashboard` (o quitar los badges).
- Banner de turno basado en las sesiones abiertas reales, con "Vendido en turno" tomado de `getSessionSummary`.
- Estado de red real (ping) y versión tomada de `package.json`.

### 5.2 Datos frescos (H-29)
- Factory de query keys (`qk.*`) y helpers `invalidateAfterSale()` / `invalidateInventory()`.

### 5.3 Ergonomía del POS (H-30, H-53)
- Esc no vacía el carrito si el foco está en un input o la paleta está abierta, y pide confirmación si hay más de N artículos.
- Ocultar "Crédito" porque está fuera del MVP.

### 5.4 Notificaciones y reportes (H-44, H-49, H-54)
- Panel de la campana (stock bajo, OC pendientes, ventas offline) o quitarla.
- Validar el rango de fechas en reportes y rellenar con 0 los días sin ventas.
- Unificar las categorías duplicadas y el "Sin Proveedor" doble.

### 5.5 Accesibilidad base: contraste y foco (UI-01, UI-02, UI-06, UI-14)
- **5.5.1** Agregar a `index.css` los tokens `--color-on-primary` (texto oscuro sobre el primario, como en la referencia Obsidian) y `--color-primary-text` (≈`oklch(0.52 0.15 235)`) para enlaces, tabs y folios. Aplicarlos en `button.tsx` (variantes primary y danger).
- **5.5.2** Regla global `:focus-visible { outline: 2px solid var(--color-primary-text); outline-offset: 2px }` y quitar los `outline-none` sin reemplazo de `app-shell.tsx`.
- **5.5.3** Variantes de `badge.tsx` con texto de L≈0.45 sobre el tinte. Sidebar sin `/50`. `avatar.tsx` con un token.
- **Verificación:** volver a correr `revisor-visual`. Todos los textos deben medir ≥4.5:1 y los elementos no textuales ≥3:1.

### 5.6 Responsive: tablet y móvil (UI-03, UI-05, UI-08, UI-09, UI-17)
- **5.6.1** En `app-shell.tsx`: aside `hidden lg:flex`, un drawer off-canvas con botón hamburguesa en el header y cierre al navegar.
- **5.6.2** Header: `shrink-0` y 44 px en los botones de icono. Mostrar solo el título en anchos menores a `md`.
- **5.6.3** Dashboard: `min-w-0` en el grid y gráfica sin etiquetas de valor en móvil, para que no desborde a 375 px.
- **5.6.4** `input.tsx` y `select.tsx` con `text-base lg:text-sm`. `toggle.tsx` y los enlaces del sidebar con `min-h-11`.
- **5.6.5** `table.tsx` con indicador de scroll horizontal (sombra o fade).

### 5.7 Sistema tipográfico y formato (UI-07, UI-10, UI-04)
- **5.7.1** Componente `PageHeader` con el h1 en la escala de MASTER. Reemplazar los `text-[9|10|11px]` por tokens de la escala y subir los valores de los KPI.
- **5.7.2** Formateador de cantidades por unidad en `lib/formatters.ts` (enteros para piezas, «—» cuando el máximo es 0).
- **5.7.3** Claves de fecha locales en `dashboard.tsx` (se resuelve junto con 4.1).

### 5.8 Contenido, textos y pulido (UI-11, UI-12, UI-13, UI-15, UI-16, UI-17)
- Corregir acentos y traducir lo que está en inglés (Backups → Respaldos, Online → En línea), arreglar los plurales y poner `document.title` por ruta.
- Unificar la marca (login, sidebar y título) a partir de la configuración.
- Gráficas de reportes con ticks en formato `es-MX` y `role="img"` + `aria-label`. Agregar `aria-label` al enlace de volver en Conteo.
- Quitar los `cursor-pointer` manuales. Usar `Modal` en lugar de `window.confirm`. Botón para abrir caja en el corte vacío.

---

## Fase 6: Calidad continua y deuda técnica

### 6.1 Tests que sí detectan errores (H-34)
- Que los requests de los tests no corran dentro de un app context exterior (o llamar `db.session.remove()` entre requests).
- Que los servicios hagan `rollback` explícito ante errores.

### 6.2 Tests del frontend
- Agregar Vitest con tests unitarios de `getCartTotals`, `useSyncQueue` y `useBarcodeScanner`.
- Agregar Playwright con los flujos críticos: venta, devolución y corte.

### 6.3 CI (H-50)
- GitHub Actions: pytest con un servicio de PostgreSQL, `tsc`, build, `npm audit` y `pip-audit`.
- Mover el hook de pre-commit a `scripts/hooks/` (sin `echo.`) y los scripts sueltos a `tools/`.
- Escribir el README con instalación, operación, respaldo y soporte.

### 6.4 Dependencias y configuración (H-35, H-45)
- `npm audit fix` y actualizar `flask-cors`, Flask, Werkzeug, PyJWT y Flask-JWT-Extended.
- Restringir CORS al propio origen. Paginar `/sessions`, `/low-stock` y proveedores.

### 6.5 Modelo de datos (H-33, H-32, H-52)
- CHECK (`stock >= 0`, `amount > 0`, `change >= 0`) e índices en `created_at` y `audit_logs`. Declarar el índice trigram en `__table_args__`.
- Helper `parse_date()` que responda 400 y un manejador global de `IntegrityError` que responda 409.
- Evaluar folios sin huecos (asignarlos después de validar) si se requieren para fines fiscales.

### 6.6 Limpieza del frontend (H-41, H-46, H-47, H-48, H-55)
- Registrar el service worker solo en producción y versionarlo con el hash del build.
- Eliminar `any`, `motion`, `graphify-out` de `src` y el código duplicado. Usar `formatCurrency` en todas partes.
- Patrón "latest ref" en el lector de código de barras.
- Enviar las cantidades como string con `toFixed(3)`.
- Cerrar la sesión ante un 422 por token inválido.

---

## Orden sugerido y criterio de "listo para tienda"

1. **Fase 0 → 1 → 2 → 3**, en ese orden. Son las que bloquean la operación.
2. Las fases 4 y 5 se pueden trabajar en paralelo por áreas (backend y frontend).
3. La fase 6 va en paralelo y de forma continua. Conviene adelantar la 6.3 (CI) para proteger lo que se corrija.

**Criterios para considerar el sistema listo para operar en tienda:**
- [ ] Los 14 hallazgos críticos están cerrados, cada uno con su test.
- [ ] Hay un respaldo diario automático verificado y un simulacro de restauración exitoso.
- [ ] El corte de caja cuadra en el escenario QA-08 y en un día simulado con ventas, devoluciones y cancelaciones.
- [ ] El sistema está instalado como servicio en una máquina limpia siguiendo solo `DEPLOYMENT.md`.
- [ ] Se volvió a correr la suite de agentes de `.claude/agents/` y no aparece ningún hallazgo crítico ni alto nuevo.
