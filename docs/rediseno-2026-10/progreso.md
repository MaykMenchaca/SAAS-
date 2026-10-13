# Progreso del rediseño Industry

**Estado:** `[ ]` pendiente · `[~]` en curso · `[x]` hecha · `[!]` bloqueada
**Formato al cerrar:** `[x] N.M Título · commit <hash> · verificación · notas`
**Rama:** `feat/rediseno-industry` (worktree `../pos-rediseno`)

## Fase 0: Preparación
- [x] 0.1 Rama y worktree, paquete de diseño en `docs/rediseno-2026-10/diseno/`, guía `ui-ux-pro-max` copiada
- [x] 0.2 Línea base verde · pytest **446 passed** (6 min 29 s, esquema `lane_d`), Vitest **29 passed**, build OK (chunk mayor 455.7 kB / 141.9 kB gzip)
- [x] 0.3 Entorno de revisión · esquema `shots` en `pos_test_db` (no toca `pos_db`), con migraciones al día y datos del diseño: 17 productos, 6 categorías, turno abierto, 5 ventas (efectivo, mixta y tarjeta), 1 devolución, 1 proveedor y 1 OC. Usuarios `admin` (24 permisos), `lmendez` gerente (19) y `jperez` cajero (7), con contraseñas solo en el `shots.env` del scratchpad. Servidores: backend :5000 (esquema `shots`) y frontend :3000 desde `pos-rediseno`
- [x] 0.4 `equivalencias.md` · estrategia de tokens nuevos + alias viejos (se borran en 8.3), mapa de componentes, shell y pantallas, y lista de lo que no se toca
- [x] **Gate 0** · APROBADO (2026-10-12): línea base verde, entorno de revisión con 3 roles verificados por API y equivalencias escritas

## Fase 1: Fundaciones
- [x] 1.1 Tokens Industry en claro y oscuro · `index.css` reescrito: tokens nuevos como fuente de verdad (`bg`, `surface`, `text`, `divider`, `ink-2/3`, `line-soft`, `accent` + rampa 100-900, `acc-text/tint`, `on-acc`, `ok/warn/bad` + `-tint`, `overlay`, `field-border`) y los nombres viejos como **alias** (`primary`, `danger`, `neutral-*`…, a borrar en 8.3). Acento de relleno `#416180`. Esquinas rectas (`--radius-* : 0px`) y sombras tintadas. Sidebar y barra de total del POS conservan su azul marino heredado hasta las fases 3 y 4. `tools/verify_design.py` ahora exige los tokens nuevos
- [x] 1.2 Barlow / Barlow Condensed locales · `@fontsource` (solo subconjunto latino: Barlow 400/500/700 y Condensed 400/600, ~24 KB cada uno), importados en `main.tsx`; Google Fonts eliminado de `index.html` (0 peticiones externas verificadas en el navegador). Títulos h1-h6 en Condensed 600; cuerpo 15 px en escritorio y 16 px en móvil. `font-mono` ahora es Barlow con cifras tabulares
- [x] 1.3 Lucide con trazo 1.5 · regla global `svg.lucide { stroke-width: 1.5 }` (gana al atributo del SVG, no hay que tocar los ~200 usos)
- [x] 1.4 Primitivas · `.blueprint` y `.corner` en `@layer components` (las utilidades de Tailwind pueden sobrescribirlas), componente `<Corners/>` exportado desde `components/ui`, `:focus-visible` con borde de acento de 2 px, `::selection`, inputs numéricos sin flechas, scrollbars con los tokens
- [x] 1.5 Medidor de contraste + verificación · `tools/contrast_check.py` resuelve hex, oklch y color-mix desde `index.css` y mide 20 pares × 2 temas = **40/40 cumplen**. Encontró 2 fallos reales en los colores del prototipo (éxito 4.35:1 y advertencia 4.28:1 sobre su tinte) → se oscurecieron (`ok` L 0.46, `warn` L 0.47). Nuevo token `field-border` (≥3:1) para bordes de inputs: la línea `divider` (1.38:1) queda solo decorativa. Verificado en el navegador (claro y oscuro, fuentes locales, radio 0, acento correcto)
- [x] **Gate 1** · APROBADO (2026-10-12): tests nuevos `test_rediseno_fase1.py` (6), Vitest 29 passed, build OK (chunk mayor 455.7 kB sin cambio), contraste 40/40, `verify_design.py` OK. Pendiente de fases siguientes: el menú lateral oscuro heredado (fase 3) y los componentes con aspecto viejo sobre los tokens nuevos (fase 2)

## Fase 2: Componentes base
- [x] 2.1 Button · acento de relleno con hover/active de la rampa (en oscuro "presionado" va al extremo claro, con la variante `dark:` ligada a `html.dark`), secundario/ghost/danger/icon, tamaños `sm`/`md`/`lg` (md conserva los 44 px táctiles), prop `frame` (marcas `+`), Barlow Condensed 600, deshabilitado al 45 %
- [x] 2.2 Input, Select, Toggle y **Segmented** (nuevo) · campos con relleno `surface` y borde `field-border` (≥3:1), foco con borde de acento, `text-base` (sin zoom en iOS). **Mejora de accesibilidad:** el error se enlaza con `aria-invalid` y `aria-describedby` (antes solo estaba dentro del `<label>`). Segmented es un `radiogroup` con flechas del teclado, salta opciones deshabilitadas y solo la activa entra en el orden de tabulación. Toggle cuadrado
- [x] 2.3 Badge + **Kbd** (nuevo) · tintes translúcidos con texto del mismo tono (todos ≥4.5:1), tonos `accent`/`outline` nuevos, `info` se muestra como acento; Kbd para atajos
- [x] 2.4 Card como panel blueprint · transparente, borde fino, sin sombra ni relleno; prop `frame` para las marcas de registro
- [x] 2.5 Table · marco de línea fina, encabezado en mayúsculas pequeñas, sin zebra, hover con tinte; se mantiene el indicador de scroll horizontal (tapas con el color de fondo). Nuevo `tableNumClass` para columnas de montos
- [x] 2.6 Modal · panel blueprint con marcas `+`, fondo `overlay`, `shadow-lg`, título en Condensed. Foco atrapado, Esc y restauración del foco intactos (verificado en el navegador)
- [x] 2.7 Toast, EmptyState, ErrorState, Skeleton, Pagination, Avatar, Tooltip, FilterChip, PageHeader, Breadcrumb · todos con los tokens nuevos y esquinas rectas. PageHeader usa el título de 38 px del diseño (`text-page`); Avatar es un cuadrado de línea con iniciales; FilterChip es el chip de categoría del POS (`aria-pressed`)
- [x] 2.8 Catálogo `/_ui` · `pages/ui-catalog.tsx` con todas las variantes y un interruptor de tema; la ruta solo existe si `import.meta.env.DEV` (verificado: el build de producción no emite el chunk ni el texto). **Auditoría de contraste real:** script en el navegador que calcula el fondo efectivo de cada texto renderizado → claro 95/95, oscuro 99/99 (con el diálogo abierto), 0 fallos
- [x] **Gate 2** · APROBADO (2026-10-12): Vitest **61 passed** (29 + 32 nuevos de componentes), `tsc` y build OK (JS 456.0 kB, +0.3 kB), tests de repo `test_rediseno_fase2.py` (7) + fase 1 (6) en verde, contraste 40/40 de tokens y 0 fallos en el catálogo. Revisadas pantallas reales (Productos y su modal) con los componentes nuevos

## Fase 3: Shell
- [x] 3.1 Sidebar expandido · `sidebar.tsx` + `nav-list.tsx` + `brand-mark.tsx`: 236 px, marca (cuadro de acero con el icono y color que configura el local), 4 secciones en Barlow Condensed, ítem activo con fondo `acc-tint`, barra interior de 2 px e icono de acento, contadores cuadrados (ámbar para stock bajo, acento para compras). El administrador personaliza la marca desde el logo (ahora un `<button>`). Navegación y permisos en `nav-config.ts` (`filterNav`, `findNavEntry`)
- [x] 3.2 Tarjeta de turno + usuario · `shift-card.tsx` con datos reales de `/cash-register/active` (misma clave que el POS y las devoluciones, así se refresca al abrir/cerrar caja): "Caja 1 · Turno abierto · Desde 23:01 · Fondo $1,000.00" o "Sin turno abierto"; no consulta sin `caja:ver`. `user-card.tsx`: iniciales en cuadro de línea, nombre, "usuario · rol" y cerrar sesión. **No se implementó** el selector "Ver la app como…" del prototipo
- [x] 3.3 Sidebar colapsado · 64 px con iconos de 44 px, punto en lugar de contador, separadores entre secciones, punto de turno y cerrar sesión. **Se colapsa solo en `/pos`** (`isPosRoute || manualCollapsed`) y en el resto se puede colapsar a mano (preferencia recordada). Verificado en el navegador: el cajero entra al POS con el menú colapsado
- [x] 3.4 Header · `topbar.tsx` de 64 px: breadcrumb "Sección / Página", buscador `Ctrl K` (botón ancho desde 1200 px, icono por debajo, como el diseño), "Nueva venta" (oculto en el POS y sin `ventas:crear`), reloj (fecha solo ≥1200 px, cada 15 s), indicador LAN con el ping real y **siempre visible cuando no hay conexión** (en el prototipo se ocultaba), campana y tema. Título de la pestaña `Página · Local`
- [x] 3.5 Paleta Ctrl K · panel blueprint de 560 px con marcas `+`, buscador de 56 px, filas de 44 px con icono, sección en Condensed, `Kbd` para los atajos y contador; se conservan el filtro por permiso, la búsqueda de productos, el teclado (↑ ↓ Enter Esc, trampa de Tab) y que Esc no vacíe el carrito del POS. Campana y pendientes migrados con `tools/migrate_tokens.py` (herramienta nueva y reutilizable para las fases 4-7)
- [x] 3.6 Móvil y tablet · `mobile-drawer.tsx`: panel de 280 px con la misma navegación, tarjeta de turno y usuario; ahora **Esc lo cierra**, el foco entra en "Cerrar menú" y navegar o cerrar sesión lo cierra. Verificado a 768 y 375 px (6 pantallas sin desborde horizontal por el shell)
- [x] 3.7 Verificación · cajero (5 secciones, sin Dashboard/Usuarios/Reportes/Configuración), admin y gerente por permisos; claro y oscuro; 1280/768/375 px; Ctrl K con navegación real. **Contraste real del shell: 29 textos del menú + 9 del encabezado = 0 fallos en claro y oscuro** (con las animaciones terminadas antes de medir)
- [x] **Gate 3** · APROBADO (2026-10-12): Vitest **95 passed** (+34: 24 del shell, 9 de `cn`, 1 de Input), `test_rediseno_fase1/2/3.py` (21), `tsc` y build OK, contraste 40/40, `verify_design.py` OK. `app-shell.tsx` pasa de 921 a ~110 líneas repartidas en 9 archivos pequeños

## Fase 4: Punto de venta ✅ (pendiente Gate 4)
- [x] 4.1 Sin sesión: unirse o abrir caja
- [x] 4.2 Búsqueda y escaneo + feedback
- [x] 4.3 Categorías
- [x] 4.4 Cuadrícula de productos
- [x] 4.5 Ticket lateral (fracciones y descuento con permiso)
- [x] 4.6 Totales del quote + métodos + Cobrar
- [x] 4.7 Modal de cobro: teclado y pagos divididos
- [x] 4.8 Venta completada + F8
- [x] 4.9 Offline, sincronización y rechazadas
- [x] 4.10 Barra de atajos
- [x] 4.11 Verificación de dinero (vitest, Playwright, navegador)
- [ ] **Gate 4**

**Verificación:** `vitest` 191 pasan (POS: payment-math, cart-helpers, ticket-panel, payment-modal, pos-screens), `tsc` limpio, contraste 44/44, verify_design OK, `test_rediseno_fase4.py` 7 pasan. En navegador: cobro con cambio, doble clic = 1 venta, stock correcto en servidor, búsqueda/F2/Enter, tema oscuro.

**Hallazgos de la fase (para el resumen final):**
- Bug de Fase 1: `* {border-color}` sin capa anulaba utilidades de borde (field-border no se aplicaba en fases 1-3); movido a `@layer base`.
- tailwind-merge en `cn` suma ~25 kB de JS.
- `font-mono` = Barlow (no monoespaciada): los tickets usan un stack monoespaciado explícito.
- Tinte translúcido sobre `bg-divider` rompía contraste: ahora se apoya en fondo opaco (`TINT_ON_BG`).
- "Lector de código activo" es indicador fijo, no detecta hardware.
- Pendiente de revisión visual: 768/375 px del POS y modo offline real (cubierto por tests).

## Fase 5: Pantallas operativas
- [x] 5.1 Login (+ cambio de contraseña y 404)
- [x] 5.2 Dashboard
- [x] 5.3 Corte de caja
- [x] 5.4 Devoluciones (+ backend `restock`)
- [x] 5.5 Historial de ventas (+ CSV, filtro por cajero)
- [x] **Gate 5**

## Fase 6: Catálogo e inventario
- [x] 6.1 Productos
- [x] 6.2 Inventario (+ backend motivo de ajuste)
- [x] 6.3 Conteo físico
- [x] 6.4 Compras
- [x] **Gate 6**

## Fase 7: Administración
- [x] 7.1 Usuarios (+ restablecer contraseña, matriz de permisos)
- [x] 7.2 Reportes (+ CSV)
- [x] 7.3 Configuración (+ descargar respaldo)
- [x] 7.4.1 Restaurar: endpoint con confirmación
- [x] 7.4.2 Restaurar: protocolo (respaldo previo, mantenimiento, reversión)
- [x] 7.4.3 Restaurar: UI en dos pasos
- [x] 7.4.4 Restaurar: tests
- [x] 7.4.5 Restaurar: documentación
- [x] **Gate 7**

**Integración (ramas r5a..r7b fusionadas en feat/rediseno-industry):** vitest 355 pasan, backend completo sin fallos, build OK, contraste 44/44, una sola cabeza de Alembic (`a5b4c3d2e1f0`).
Pendiente: revisión visual en navegador de cada pantalla y aprobación de Gates 5, 6 y 7. Simulacro de restauración en base desechable antes de usarla en producción.
Notas: KPI "Agotados" de Inventario ignora productos sin mínimo y solo lee 100; `/restore-status` es público a propósito; faltan imprimir comprobante de devolución, conteo por categoría y columna de diferencias.

## Fase 8: Cierre
- [ ] 8.1 QA visual (`revisor-visual`)
- [ ] 8.2 QA funcional (`qa-funcional` + Playwright)
- [ ] 8.3 Limpieza de tokens viejos + MASTER.md + README
- [ ] 8.4 Push, CI y PR (tras fusionar `fix/fase-6-claude` en `main`)
- [ ] **Gate 8**

## Decisiones
| Fecha | Tema | Decisión |
|---|---|---|
| 2026-10-12 | Contraste | Acento 700 (#416180) en rellenos y textos de acento |
| 2026-10-12 | Respaldos en Configuración | Descargar **y** Restaurar desde la web (protocolo 7.4) |
| 2026-10-12 | Skill ui-ux-pro-max | Solo la guía SKILL.md, sin scripts |
| 2026-10-12 | Ejecutor | Claude (esta sesión) |

## Hallazgos nuevos
- (3.x) **Corrección sistémica en `cn`**: `cn` solo concatenaba clases, así que un `px-0`/`text-xs`/`min-h-0` pasado por una pantalla perdía contra el `px-4`/`text-base`/`min-h-11` base del componente por el orden del CSS (ya pasaba en la app original: la "×" de los modales y el cierre de sesión quedaban con el icono aplastado). Ahora usa `tailwind-merge` configurado con los tokens del tema (`text-ink-2`, `text-page`…): gana la última clase. Costo: +25 kB de JS (+9.7 kB gzip). Puede cambiar el aspecto de pantallas viejas que dependían del conflicto; se revisan una a una en las fases 4-7
- (3.7) El Dashboard desborda a 375 px (contenido de 382 px): ya conocido, se corrige al rediseñar la pantalla en 5.2
- (3.5) `components/auth/require-permission.tsx` (`AccessDenied`) y `error-boundary.tsx` siguen con nombres de color viejos: se migran en 8.3 con el resto de alias
- (3.7) Para auditar contraste en el navegador integrado hay que terminar las animaciones (`document.getAnimations().forEach(a => a.finish())`) antes de medir
- (2.8) El panel del navegador integrado estira las transiciones de color: una auditoría de contraste lanzada justo tras cambiar de tema midió colores a medias (falsos fallos). Para medir hay que esperar ≥1.5 s tras el cambio. No es un bug del código.
- (2.2) Los mensajes de error de `Input`/`Select` siguen dentro del `<label>` (así estaba); ahora además están enlazados con `aria-describedby`. Si el ruido para lectores de pantalla molesta, se puede mover fuera del label en una fase posterior.
- (1.5) Los colores `ok` y `warn` del prototipo no cumplen 4.5:1 sobre sus tintes en claro; se ajustaron. Conviene avisar a quien mantenga el diseño en Claude Design.
- (1.1) Los avisos de WebSocket (`ws://localhost:3000`) en consola vienen del recargador en caliente de Vite dentro del panel del navegador, no de la app.
