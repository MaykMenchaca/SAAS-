# Plan de rediseño: VRNTAS POS con el sistema "Industry"

**Fuente del diseño:** [`diseno/`](diseno/), exportado de Claude Design ("Mejora de diseño POS ventas"). El shell es `VRNTAS POS.dc.html` y hay 11 pantallas `Pantalla*.dc.html`. El mapa pantalla → archivo está en `diseno/github.md`.
**Rama:** `feat/rediseno-industry`, creada desde `fix/fase-6-claude`, que ya trae todas las correcciones de las fases 0 a 6. Worktree: `../pos-rediseno`.
**Ejecuta:** Claude, en esta sesión, fase por fase, con tu aprobación en cada gate.
**Progreso:** [`progreso.md`](progreso.md).

## Decisiones tomadas (2026-10-12)
| Tema | Decisión |
|---|---|
| Contraste | El acento base del diseño (`#5980a6`, 3.7:1) se **oscurece al tono 700 (`#416180`)** en rellenos y textos de acento. Se conserva el look acero y se mantiene ≥4.5:1 (WCAG AA), lo mismo que en la Fase 5. En oscuro se usa la rampa clara del diseño. |
| Respaldos | Configuración tendrá **Descargar y Restaurar** desde la web. Restaurar es la subfase de mayor riesgo y lleva su propio protocolo (ver 7.4). |
| Skill UI/UX | `ui-ux-pro-max` está copiada **solo como guía** en `.claude/skills/` y `.agents/skills/`. Sus scripts no existen; se usa como checklist. |
| Ejecutor | Claude (esta sesión). |

## Principios del rediseño
1. **Se cambia la apariencia, no la lógica.** Las pantallas actuales ya tienen la lógica correcta y probada: precio del servidor y `quote`, `client_uuid`, guard de doble clic, cola offline, permisos `can()`, zona horaria, query keys e invalidaciones. Se cambia el JSX y los estilos, **sin reescribir hooks ni llamadas a la API**. Cada subfase verifica que sus tests y flujos sigan pasando.
2. **El backend manda sobre los datos de ejemplo del diseño.** El diseño usa datos simulados (Jorge Pérez, IVA 16 % fijo, descuentos de 5 a 20 %, el selector "Ver la app como…"). Se implementa con datos reales y respetando las reglas:
   - El IVA se muestra según el `quote`, que calcula una tasa por producto.
   - El descuento por línea solo se muestra con el permiso `ventas:descuento` y hasta `max_discount_percent`.
   - El menú lo filtran los permisos reales, no la tabla `ACCESS` del prototipo.
   - El selector de rol del prototipo **no se implementa**.
3. **Sistema Industry, adaptado:**
   - Esquinas rectas.
   - Bordes finos (hairline).
   - Marcas de registro `+` (`.blueprint` + `.corner`) en tarjetas, figuras y el botón primario.
   - Barlow Condensed para títulos y Barlow para el texto.
   - Lucide con trazo 1.5.
   - `tabular-nums` en todos los montos.
   - Tema claro y oscuro.
4. **Funciona sin internet:** las fuentes Barlow se sirven **locales** (`@fontsource`), nunca desde Google Fonts, porque el POS opera en la LAN.
5. **Se conserva lo ganado en la Fase 5:** contraste AA, `:focus-visible`, objetivos táctiles de al menos 44 px en el POS, drawer en móvil y `text-base` en inputs de móvil.
6. Antes de cada subfase visual se repasa la guía `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max/SKILL.md`), sobre todo las secciones de accesibilidad, interacción y formularios.

## Resumen de fases

| Fase | Objetivo | Esfuerzo | Riesgo |
|---|---|---|---|
| 0 | Preparación y línea base | S | Bajo |
| 1 | Fundaciones: tokens, fuentes, iconos | M | Medio (afecta toda la app) |
| 2 | Componentes base al estilo Industry | M | Medio |
| 3 | Shell: sidebar, header, paleta y drawer | M | Medio |
| 4 | Punto de venta y cobro | L | **Alto** (flujo de dinero) |
| 5 | Pantallas operativas: login, dashboard, corte, devoluciones, ventas | L | Medio |
| 6 | Catálogo e inventario: productos, inventario y conteo, compras | L | Medio |
| 7 | Administración: usuarios, reportes, configuración (+ descargar y restaurar) | L | **Alto** (7.4 restaurar) |
| 8 | Cierre: QA visual y funcional, accesibilidad, integración | M | Bajo |

**Gate de cada fase:**
- `npm run build`.
- `npx vitest run`.
- `pytest` completo, si se tocó el backend.
- Revisión en el navegador contra el `.dc.html` correspondiente: claro y oscuro, a 1280, 768 y 375 px.
- Contraste ≥4.5:1 en textos.
- Commit por subfase con el formato `feat(rediseno-N.M): … (pantalla)`.
- Push de la rama al cerrar cada fase, con tu aprobación.

---

## Fase 0: Preparación y línea base
- **0.1** Crear la rama y el worktree `feat/rediseno-industry`, copiar el paquete de diseño a `docs/rediseno-2026-10/diseno/` y la guía `ui-ux-pro-max`. ✅ (hecho al crear este plan)
- **0.2** Línea base verde en la rama: `pytest` (446), `vitest` (29) y build. Se registra en `progreso.md`.
- **0.3** Entorno de revisión:
  - Backend contra el esquema `shots` de `pos_test_db` (no toca `pos_db`), con datos de ejemplo cargados por la API: turno abierto, ventas en efectivo, tarjeta y mixtas, una devolución, una OC, stock bajo y un producto a granel.
  - Usuarios de prueba admin, gerente y cajero, para verificar los menús por rol.
- **0.4** Tabla de equivalencias entre el diseño y el código: qué clase o estilo del prototipo corresponde a qué componente de `components/ui`. Se guarda en `equivalencias.md` y la usan todas las fases.

## Fase 1: Fundaciones
- **1.1 Tokens** en `frontend/src/index.css`, en claro y oscuro:
  - Se mapean los de Industry (`--color-bg`, `surface`, `text`, `divider` y las rampas neutral y accent de 100 a 900) y los de VRNTAS (`ink-2/3`, `line-soft`, `acc-text/tint`, `on-acc`, `ok/warn/bad` con sus `-tint`, `overlay`).
  - Se exponen como `@theme` de Tailwind 4: `bg-surface`, `text-ink-2`, `border-divider`, etc.
  - **Acento de relleno = `#416180` (700)** en claro y `#8db2d7` en oscuro, con texto `on-acc`.
  - Se eliminan los tokens viejos sin uso **después** de migrar las pantallas (8.3).
- **1.2 Tipografía:**
  - `npm i @fontsource/barlow @fontsource/barlow-condensed`, con los pesos 400, 500 y 600 importados en `main.tsx`.
  - `--font-heading` y `--font-body`.
  - Escala del diseño: h1 de 40 a 42, h2 de 24 a 32, cuerpo de 14 a 15. Los totales usan heading 600 con `tabular-nums`.
  - Se ajusta `PageHeader` a la escala.
- **1.3 Iconos:** Lucide con `strokeWidth={1.5}` global, mediante un wrapper `Icon` o el contexto de `lucide-react`. Los tamaños por contexto salen del diseño: 15 a 18 en la UI y 26 en el buscador del POS.
- **1.4 Primitivas CSS:**
  - `.blueprint` y `.corner`, con un componente `<Corners/>` que pinta las 4 marcas.
  - `:focus-visible` con un borde de 2 px en el acento.
  - `::selection`.
  - Inputs numéricos sin flechas.
  - Scrollbars discretas.
- **1.5 Verificación:** la app se ve con la fuente y los colores nuevos sin romper ninguna pantalla (aún con el layout viejo). El contraste de los tokens se mide con un script en `tools/` que calcula los pares texto-fondo de claro y oscuro.

## Fase 2: Componentes base (`frontend/src/components/ui/`)
Cada componente conserva su API actual (props) para no romper las pantallas, y se le suman las variantes del diseño.
- **2.1 `Button`:**
  - `primary`: relleno de acento, esquinas rectas y `blueprint` opcional.
  - `secondary`: borde fino.
  - `ghost` e `icon` de 36 px (44 en el POS).
  - Estados hover y active de la rampa y `disabled` al 45 %.
- **2.2 Formularios:** `Input`, `Select`, `Field`/label, `Toggle` y un nuevo `Segmented`, que es el selector de método de pago, de rol y de filtros.
- **2.3 `Tag`/`Badge`** con variantes `accent`, `neutral`, `ok`, `warn`, `bad` y `outline`. **`Kbd`** para atajos (F2, F5, Ctrl K).
- **2.4 `Card` → `Panel` blueprint:** transparente, con borde fino y marcas, más un encabezado de sección (kicker y título condensado).
- **2.5 `Table`:** encabezado en mayúsculas de 11 a 12 px, filas con línea suave, hover y columnas numéricas a la derecha con `tabular-nums`. Conserva el scroll con indicador de la Fase 5.
- **2.6 `Modal`/`Dialog`:** backdrop `--overlay`, panel blueprint y `shadow-lg`, con el foco atrapado y el cierre con Esc que ya existen.
- **2.7** `Toast`, `EmptyState`, `ErrorState`, `Skeleton`, `Pagination`, `Avatar` (iniciales en un cuadro con borde) y `Tooltip`, todos con el estilo Industry.
- **2.8** Una página de catálogo **solo en desarrollo** (`/_ui`, que no se compila en producción) con todas las variantes en claro y oscuro, para revisarlas contra el diseño.

## Fase 3: Shell (`components/layout/app-shell.tsx`, `App.tsx`)
Diseño de referencia: `VRNTAS POS.dc.html`.
- **3.1 Sidebar expandido** de 236 px:
  - Marca (cuadro de acento "V", "Ferretería" y "VRNTAS POS" tomados del branding).
  - Secciones Principal, Inventario, Finanzas y Sistema.
  - Ítem activo con fondo `acc-tint`, barra interior de 2 px e icono en acento.
  - Badges de stock bajo (warn) y OC pendientes (accent).
- **3.2 Tarjeta de turno** en el pie del sidebar: "Caja N · Turno abierto · Desde hh:mm · Fondo $X", con datos de `/cash-register/active`. Si no hay sesión, dice "Sin turno abierto". Debajo, el usuario con sus iniciales, nombre, usuario y rol, y el botón para cerrar sesión.
- **3.3 Sidebar colapsado** de 64 px, con iconos y un punto en lugar del badge. **Se colapsa solo en el POS**, como en el diseño, y también se puede colapsar a mano.
- **3.4 Header** de 64 px:
  - Breadcrumb Sección / Página.
  - Buscador Ctrl K (botón ancho a partir de 1200 px; solo icono por debajo).
  - "Nueva venta" (oculto en el POS).
  - Reloj `es-MX` (con fecha a partir de 1200 px).
  - Indicador LAN / Sin conexión con `useServerStatus` real.
  - Campana con el contador real y el popover que ya existe.
  - Tema claro/oscuro.
- **3.5 Paleta Ctrl K:** panel blueprint de 560 px, input grande, resultados con icono y sección, Enter abre el primero y "Sin coincidencias.". Se conservan los filtros por permiso.
- **3.6 Móvil y tablet** (por debajo de `lg`): se mantiene el drawer de la Fase 5 con el estilo nuevo, y el header se compacta.
- **3.7 Verificación:** navegación completa con admin, gerente y cajero, en claro y oscuro, a 1280, 768 y 375 px.

## Fase 4: Punto de venta (`pages/pos.tsx`) ⚠️ flujo de dinero
Diseño de referencia: `PantallaPOS.dc.html`. **No se toca** la lógica de `quote`, `client_uuid`, `isSubmittingRef`, la cola offline, `open_drawer` ni los permisos.
- **4.1 Sin sesión de caja:** "Abre una caja para vender", con la lista de sesiones abiertas (unirse si es propia o con `caja:supervisar`) y el formulario para abrir una nueva (caja y fondo).
- **4.2 Zona de búsqueda y escaneo:**
  - Campo de 64 px con borde de acento y marcas, icono `scan-barcode`, texto de 22 px, botón para limpiar y `Kbd` F2.
  - Indicador "Lector USB listo".
  - Línea de feedback (ok, error o info) con los mensajes reales: agregado, agotado, "N coincidencias" o "no registrado".
  - Enter agrega por código, SKU o coincidencia única. Se usan `useBarcodeScanner` y `/products/by-code` existentes.
- **4.3 Categorías** como chips con conteo, tomadas del catálogo real (y de la copia offline).
- **4.4 Cuadrícula de productos** (celdas de 190 px o más con separadores de 1 px):
  - SKU, tag de stock (agotado, bajo o normal), nombre, precio de 24 px y unidad.
  - "En ticket: N".
  - Agotado deshabilitado al 50 %.
- **4.5 Ticket lateral** (de 340 a 420 px):
  - "Venta en curso · Caja · Ticket · Cajero".
  - Líneas con −/cantidad/+; las unidades fraccionarias usan pasos de 0.5 y botones rápidos (0.25, 0.5, 1, 2.5, 5, 10).
  - "Desc." y "Quitar". **El descuento solo aparece con `ventas:descuento` y se limita a `max_discount_percent`.**
  - Total de línea, con el precio tachado si lleva descuento.
- **4.6 Totales y cobro rápido:**
  - Subtotal, descuentos e IVA tomados del `quote`; la etiqueta dice "IVA" sin porcentaje fijo.
  - TOTAL de 34 a 52 px.
  - Selector de método: efectivo, tarjeta o transferencia.
  - Botón primario blueprint "Cobrar F5 · $total".
- **4.7 Modal de cobro** de 880 px, en dos columnas:
  - Total a pagar de 48 px, método y monto recibido o cobrado.
  - Billetes rápidos (Exacto, $100, $200, $500…) y referencia de pago para tarjeta.
  - **Pagos divididos**, con lista y opción de quitar.
  - Estado "Falta por cobrar" (bad), "Cambio a entregar" u "Cobro completo" (ok).
  - Teclado numérico 3×4 de 64 px, Exacto y Limpiar.
  - "Completar cobro $total", deshabilitado si falta.
  - El cálculo del cambio se sigue mostrando **solo como vista previa**: el servidor manda.
- **4.8 Venta completada:** panel ok con folio, total, "Cambio $X" y "Imprimir ticket · F8" (con el agente o la impresora de la caja que ya existen).
- **4.9 Offline:** banner rojo "Sin conexión al servidor. Puedes seguir vendiendo…" con el contador de pendientes, banner verde de sincronización y bandeja de rechazadas (de la 4.3 del plan anterior) con el estilo nuevo.
- **4.10 Barra de atajos** (F2 Buscar, F5 Cobrar, F8 Último ticket, Esc Vaciar) y "Salir del POS". Esc sigue respetando la confirmación de la Fase 5.3.
- **4.11 Verificación:**
  - Vitest de `pos-store` y `payments-cents` en verde.
  - Playwright de la venta crítica.
  - En el navegador: efectivo con cambio, mixto, fraccionario, doble clic (debe crear 1 venta), sin stock (debe mostrar error y no venta offline), offline y sincronización.
  - El total del POS debe coincidir al centavo con el `quote`.

## Fase 5: Pantallas operativas
- **5.1 Login** (`PantallaLogin`): panel de marca con "VRNTAS", acceso a caja local y beneficios, y el formulario con usuario, contraseña y error inline. `change-password.tsx` y `not-found.tsx` usan el mismo lenguaje visual (no tienen diseño propio).
- **5.2 Dashboard** (`PantallaDashboard`):
  - Acciones rápidas (Nueva compra, Devolución, Reportes).
  - Panel de turno abierto con cajero, vendido en turno, transacciones y "Cerrar turno".
  - "Rendimiento semanal" con gráfica de 7 días, promedio y total.
  - "Stock crítico", "Últimas ventas" (tabla) y "Más vendidos" del mes.
  - Todo con los datos reales de la 5.1 del plan anterior.
- **5.3 Corte de caja** (`PantallaCorte`):
  - Encabezado de caja y turno.
  - Conteo de efectivo por denominaciones (billetes y monedas MXN), total contado y "Reiniciar conteo".
  - Resumen del turno: esperado, contado y diferencia con color, más observaciones.
  - Cierre con confirmación y respaldo.
  - Historial de cortes con "Ver arqueo".
- **5.4 Devoluciones** (`PantallaDevoluciones`):
  - Búsqueda de venta y ventas recientes.
  - Selección de artículos con cantidades según la unidad.
  - Panel de reembolso: motivo, "Regresar dinero en" (método) y **"Regresar artículos al inventario"**.
  - Comprobante con folio `D-`.
  - **Backend:** se agrega el campo `restock` (por defecto `true`) a la devolución. Con `false` no reingresa stock (útil para producto dañado). Lleva su test, su migración si hace falta y su entrada en la auditoría.
- **5.5 Historial de ventas** (`PantallaVentas`):
  - Filtros por cajero y fecha.
  - Tabla con folio, fecha, cajero, artículos, método, total y estado.
  - Detalle con ticket (subtotal, IVA, total), "Reimprimir", "Devolución" y "Cancelar venta" con motivo y confirmación.
  - **Exportar CSV** en el frontend, con los filtros aplicados.
  - **Backend:** se verifica el filtro `user_id` en `GET /sales`. Si falta, se agrega con su test.

## Fase 6: Catálogo e inventario
- **6.1 Productos** (`PantallaProductos`):
  - Tabla con producto, categoría, costo, precio, **margen**, stock y estado.
  - Panel de edición con precio con IVA y utilidad calculados.
  - Modo de solo lectura según el rol ("Tu rol solo puede consultar el catálogo.").
  - Etiqueta, desactivar y reactivar.
  - Pestaña de categorías y unidades (nombre, abreviatura, "Permite fracciones").
- **6.2 Inventario** (`PantallaInventario`):
  - KPIs: productos, bajo mínimo, agotados y **valor a costo** (del reporte de valuación).
  - Tabla con nivel mín/máx y estado.
  - "Ajustar stock" con actual, nueva cantidad y **motivo** (merma o daño, error de captura, devolución a proveedor, uso interno, otro).
  - Movimientos recientes.
  - **Backend:** verificar o agregar `reason` como catálogo en el ajuste y en `stock_movements`, con su test.
- **6.3 Conteo físico** (`inventory-count.tsx`, dentro de la misma pantalla del diseño):
  - Conteo en curso con contados, con diferencia y avance.
  - Tabla esperado / contado / diferencia.
  - "Cancelar conteo" y "Cerrar y aplicar diferencias".
  - Conteos anteriores (folio CF-).
- **6.4 Compras** (`PantallaCompras`):
  - Órdenes con folio, proveedor, creada, **esperada**, total y estado.
  - Detalle con recepción parcial (pedido, recibido, costo, recibir), "Registrar recepción", "Enviar al proveedor" e "Imprimir" (vista imprimible).
  - Proveedores con contacto, teléfono, email y **condiciones** (`payment_terms`).

## Fase 7: Administración
- **7.1 Usuarios** (`PantallaUsuarios`):
  - Lista con "Mostrar inactivos" y último acceso (`last_login_at`).
  - Formulario con nombre, usuario, email opcional, rol y contraseña temporal.
  - **"Restablecer contraseña":** el backend fija una contraseña temporal, activa `must_change_password` e incrementa `token_version`. Si no existe el endpoint, se agrega con su test y su auditoría.
  - **Matriz "Permisos por rol"** de solo lectura (permisos concedidos sobre el total por módulo), a partir de `GET /users/roles`.
- **7.2 Reportes** (`PantallaReportes`): rango Desde/Hasta, "Exportar CSV" por reporte, ingreso diario, más vendidos con su participación, valuación a costo promedio y margen bruto por producto.
- **7.3 Configuración** (`PantallaConfig`):
  - Datos del negocio con **vista previa del ticket en vivo**.
  - Auditoría con filtros por acción y entidad.
  - Cajas e impresoras (de la 4.2 y 4.11 anteriores).
  - Respaldos: último respaldo, programación, lista, "Crear respaldo ahora" y **Descargar**.
- **7.4 Restaurar respaldo desde la web** ⚠️ es la subfase de mayor riesgo. Va con tests antes del código y con confirmación tuya antes de probarla sobre una base real.
  - **7.4.1 Backend:** `POST /api/backup/<archivo>/restore`, solo para el rol admin.
    - Exige confirmación escrita (`{"confirm": "RESTAURAR <archivo>"}`) y valida el nombre contra la lista (sin rutas).
  - **7.4.2 Protocolo:**
    1. Respaldo previo automático (`pre-restore-*.dump`).
    2. **Modo mantenimiento:** el resto de la API responde 503 con un mensaje en español. Las cajas muestran un aviso y encolan.
    3. `db.engine.dispose()`.
    4. Terminar las otras conexiones de `pos_user` (`pg_terminate_backend`).
    5. `pg_restore --clean --if-exists --single-transaction --exit-on-error`.
    6. `flask db upgrade`, por si el respaldo es de una versión anterior.
    7. Salir del modo mantenimiento.
    8. Auditoría del evento.
    9. Si cualquier paso falla, se restaura automáticamente el respaldo previo y se reporta el error.
  - **7.4.3 Frontend:** diálogo de dos pasos. El primero muestra el resumen (fecha, tamaño, "se cerrarán todas las sesiones y cajas"). El segundo pide escribir el nombre del archivo. Durante la restauración hay una pantalla de progreso; al terminar, se cierra la sesión.
  - **7.4.4 Tests:** solo contra `pos_test_db` o el esquema `shots`.
    - Restauración exitosa con conteos iguales.
    - Archivo inválido → 400.
    - Sin confirmación → 400.
    - No admin → 403.
    - Fallo a la mitad → la base queda como antes, gracias al respaldo previo.
    - Mantenimiento → 503 en otros endpoints.
  - **7.4.5 Documentación:** `DEPLOYMENT.md` y `docs/simulacro-restauracion.md` agregan la vía web y conservan el script como alternativa.

## Fase 8: Cierre
- **8.1 QA visual completo:** las 12 pantallas más el shell, en claro y oscuro, a 1280, 768 y 375 px, comparadas contra los `.dc.html`. Se corre el agente `revisor-visual` (`.claude/agents/`) y no puede quedar ningún Alto.
- **8.2 QA funcional:** `qa-funcional` en los 11 flujos, más Playwright y Vitest.
- **8.3 Limpieza:** se eliminan los tokens y clases viejos que ya no se usan, se actualiza `design/system/MASTER.md` (o se reemplaza por la guía Industry adaptada) y se agregan al `README` las capturas de antes y después.
- **8.4 Integración:**
  - Push de `feat/rediseno-industry` y CI en verde.
  - PR hacia `main`. Antes hay que fusionar `fix/fase-6-claude` en `main`, porque `main` sigue con el código viejo.
  - El merge se hace con tu aprobación.

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Romper flujos de dinero al rehacer `pos.tsx` | Se cambia el JSX sin tocar hooks ni API. Vitest, Playwright y QA manual en la 4.11 |
| Contraste del sistema Industry (acento base 3.7:1, `ink-3` cerca de 3:1) | Acento 700 en rellenos y textos, `ink-3` solo en decoración. Script de contraste en la 1.5 |
| Fuentes desde Google sin internet | `@fontsource` local (1.2) |
| Restaurar desde la web corrompe la base | Protocolo de la 7.4: respaldo previo, mantenimiento, `--single-transaction` y reversión automática |
| El diseño asume datos o funciones que el backend no tiene | Las subfases "Backend:" de 5.4, 5.5, 6.2 y 7.1 se hacen antes del JSX, con su test |
| Choques con los cambios en `fix/fase-6-claude` | Se rebasa o fusiona desde esa rama al inicio de cada fase si cambió |
