# Equivalencias: diseño Industry → código actual

Referencia para todas las fases. Lo que está a la izquierda es del prototipo de Claude Design (`diseno/`); a la derecha, lo que hay en `frontend/src` y qué se hace con ello.

## 1. Estrategia de migración de tokens (decisión de la Fase 1)

El tema actual es Tailwind 4 (`@theme` en `index.css`) con nombres semánticos propios (`neutral-surface`, `neutral-border`, `primary`, `neutral-text-secondary`…) usados en ~15 archivos de páginas y componentes. Cambiar todos de golpe es riesgoso.

**Estrategia: tokens nuevos + alias.**
1. En 1.1 se definen los tokens Industry (`--color-bg`, `--color-surface`, `--color-text`, `--color-divider`, `--ink-2/3`, `--line-soft`, `--acc-tint`, `--acc-text`, `--on-acc`, `ok/warn/bad` y sus `-tint`, rampas `accent-*` y `neutral-*`) y se expone cada uno en `@theme` como utilidad de Tailwind (`bg-bg`, `bg-surface`, `text-ink-2`, `border-divider`, `bg-acc-tint`…).
2. Los **nombres viejos pasan a ser alias** de los nuevos (por ejemplo `--color-neutral-surface: var(--color-surface)`). Así, una pantalla que todavía no se migró sigue viéndose coherente con el nuevo tema, y nada se rompe a mitad del rediseño.
3. Cada pantalla, al migrarse, usa solo los tokens nuevos.
4. En la 8.3 se borran los alias y el `grep` de los nombres viejos debe dar 0.

| Industry / VRNTAS (nuevo) | Valor claro | Valor oscuro | Alias viejo | Notas |
|---|---|---|---|---|
| `--color-bg` | `#f2f2f3` | `#131517` | `neutral-bg`, `pos-bg` | Fondo de la app |
| `--color-surface` | `#e9e9ea` | `#1c1f22` | `neutral-surface` | Campos e inputs. Las tarjetas son **transparentes** (línea) |
| `--color-text` | `#1d1f20` | `#e5e7e9` | `neutral-text-primary` | |
| `--color-divider` | `#1d1f20` al 16 % | `#e5e7e9` al 17 % | `neutral-border` | Borde fino |
| `--ink-2` | texto al 68 % | texto al 70 % | `neutral-text-secondary` | Texto secundario. Medir: ≥4.5:1 |
| `--ink-3` | texto al 46 % | texto al 48 % | `neutral-text-muted` | **Solo decorativo** (puede quedar bajo 4.5:1) |
| `--line-soft` | texto al 7 % | texto al 7 % | `neutral-surface-raised` | Hover y filas |
| `--color-accent` | **`#416180`** (tono 700, decidido) | `#8db2d7` | `primary` | Relleno y borde de acento |
| `--acc-text` | `#416180` | `#b5d9fd` | `primary-text` | Texto de acento |
| `--acc-tint` | `#e3eef9` | acento al 16 % | — | Fondo del ítem activo, hover |
| `--on-acc` | `#f7f8fa` | `#0f1215` | `on-primary` | Texto sobre el acento |
| `--ok` / `--ok-tint` | `oklch(.5 .1 155)` | `oklch(.78 .1 155)` | `success`, `success-text` | |
| `--warn` / `--warn-tint` | `oklch(.52 .11 65)` | `oklch(.8 .11 75)` | `warning`, `warning-text` | |
| `--bad` / `--bad-tint` | `oklch(.52 .15 27)` | `oklch(.74 .13 27)` | `danger`, `danger-text` | |
| `--overlay` | `#1d2d3d` al 45 % | `rgba(0,0,0,.6)` | — | Fondo de modales |
| `--shadow-lg` | `0 12px 32px` tinta al 22 % | `0 12px 32px rgba(0,0,0,.5)` | `shadow-lg` | |

**Contraste:** el prototipo usa `#5980a6` como acento (3.7:1 con texto claro). Se sustituye por `#416180` en rellenos y textos de acento (decisión del 2026-10-12). El script de la 1.5 mide todos los pares y debe dar ≥4.5:1 para texto y ≥3:1 para bordes de componentes.

## 2. Tipografía

| Prototipo | Código actual | Acción |
|---|---|---|
| `--font-heading`: Barlow Condensed 600 | `--font-sans`: Inter | Barlow Condensed (títulos, totales, botones) y Barlow (texto), **locales** con `@fontsource`. Inter y JetBrains Mono se retiran en 8.3 |
| h1 40-42, h2 24-32, cuerpo 14-15, etiquetas 11-13 en mayúsculas con `letter-spacing` | Escala de la Fase 5 (`PageHeader`) | Se ajusta la escala. El mínimo vuelve a ser 11 px solo para etiquetas de tabla y `Kbd` |
| `font-variant-numeric: tabular-nums` en montos | Parcial | Clase global `.num` o `tabular-nums` en todos los montos |

## 3. Componentes

| Prototipo | Archivo actual (`components/ui/`) | Acción |
|---|---|---|
| `.btn .btn-primary` (relleno de acento, esquinas rectas) y `.blueprint` en el botón principal | `button.tsx` (`primary`/`secondary`/`danger`/`ghost`/`icon`) | Se rehacen los estilos. Se conservan las variantes y se agrega la prop `frame` (marcas `+`) |
| `.btn-secondary` (borde fino), `.btn-ghost`, `.btn-icon` 36 px | `button.tsx` | Igual. En el POS el icono sube a 44 px |
| `.input`, `.field > label`, `<select class="input">` | `input.tsx`, `select.tsx` | Fondo `--color-surface`, borde fino, foco con borde de acento. Se conservan `error`, `icon` y `label` |
| `.seg` / `.seg-opt`, y los grupos de botones de método de pago, rol y descuento | No existe | **Nuevo `segmented.tsx`** |
| `.tag` (`accent`, `neutral`, `outline`) y los tags de estado `ok`/`warn`/`bad` | `badge.tsx` (`neutral`/`success`/`warning`/`danger`/`info`) | Se rehace con los tonos nuevos. `info` se retira (se mapea a `accent`) |
| Cajita de atajo (F2, F5, Ctrl K, Esc) | No existe | **Nuevo `kbd.tsx`** |
| `.card` y `.blueprint` (transparente, borde fino, 4 marcas `+`) | `card.tsx` | La tarjeta pasa a "panel": sin fondo ni sombra. Componente `<Corners/>` para las marcas |
| Tablas del diseño (`.table`: encabezado en mayúsculas de 11 px, filas con línea suave) | `table.tsx` (+ `tableHeadClass`, `tableCellClass`, `tableRowClass`) | Se mantienen los nombres exportados y el indicador de scroll de la Fase 5. Cambia el aspecto: sin franjas alternas |
| `.dialog-backdrop` + `.dialog` / modal blueprint | `modal.tsx` (`size`: `md`/`lg`/`xl`) | Se mantienen el foco atrapado, Esc y `size`. Cambia el aspecto |
| Chips de categoría (borde, activo con relleno de acento) | `filter-chip.tsx` | Se rehace |
| Interruptor, tooltip, avatar (iniciales en cuadro con borde), skeleton, paginación, estados vacío y error, toast | `toggle.tsx`, `tooltip.tsx`, `avatar.tsx`, `skeleton.tsx`, `pagination.tsx`, `empty-state.tsx`, `error-state.tsx`, `toast.tsx` | Se rehacen los estilos, sin cambiar las props |
| Encabezado de página (kicker en mayúsculas + h1 condensado) | `page-header.tsx` | Se ajusta |
| `<lucide-icon name size>` con trazo fino | `lucide-react` (`^0.525.0`) | `strokeWidth={1.5}` por defecto mediante un wrapper |

## 4. Shell

| Prototipo (`VRNTAS POS.dc.html`) | Archivo actual | Notas |
|---|---|---|
| Sidebar de 236 px (marca, 4 secciones, tarjeta de turno, usuario) | `components/layout/app-shell.tsx` | Se reescribe el JSX. Se conservan: permisos (`can`), badges reales, drawer móvil y el cierre de sesión que limpia los stores |
| Sidebar colapsado de 64 px, automático en el POS | `app-shell.tsx` | Nuevo: el modo colapsado se activa solo en `/pos` |
| Header (breadcrumb, Ctrl K, Nueva venta, reloj, LAN, campana, tema) | `app-shell.tsx` | Se conservan `useServerStatus`, el popover de notificaciones y el contador real |
| Paleta Ctrl K (panel blueprint de 560 px) | `command-palette.tsx`, `command-palette-context.tsx` | Se rehace el aspecto. Se conservan el filtro por permiso y la lógica |
| Selector "Ver la app como…" (admin / gerente / cajero) | — | **No se implementa.** Es una herramienta del prototipo; los permisos reales mandan |
| Tarjeta "Caja 1 · Turno abierto · Desde 08:02 · Fondo $1,500" | `/cash-register/active` (existe) | Datos reales. "Sin turno abierto" si no hay sesión |

## 5. Pantallas

| Prototipo | Página actual | Cambios de backend que pide el diseño |
|---|---|---|
| `PantallaLogin` | `login.tsx`, `change-password.tsx`, `not-found.tsx` | — |
| `PantallaDashboard` | `dashboard.tsx` | — (datos reales de la Fase 5 anterior) |
| `PantallaPOS` | `pos.tsx` | — (precio, IVA y cambio los calcula el servidor; el descuento solo con permiso) |
| `PantallaProductos` | `products.tsx` | — (margen y precio con IVA se calculan en el cliente) |
| `PantallaInventario` (incluye el conteo) | `inventory.tsx`, `inventory-count.tsx` | **Motivo del ajuste** como catálogo (merma o daño, error de captura, devolución a proveedor, uso interno, otro) |
| `PantallaCompras` | `purchases.tsx` | — (`expected_date` y `payment_terms` ya existen) |
| `PantallaVentas` | `sales-history.tsx` | Filtro por cajero (`user_id`) a verificar. **Exportar CSV** en el cliente |
| `PantallaCorte` | `cash-cut.tsx` | — |
| `PantallaDevoluciones` | `returns.tsx` | **`restock`** (regresar o no el artículo al inventario) |
| `PantallaUsuarios` | `users.tsx` | **Restablecer contraseña** (temporal + `must_change_password` + `token_version`) y la matriz de permisos por rol (de `GET /users/roles`) |
| `PantallaReportes` | `reports.tsx` | CSV por reporte (cliente) |
| `PantallaConfig` | `settings.tsx` | **Descargar** y **Restaurar** respaldos (Fase 7.4) |

## 6. Lo que NO cambia (no se toca durante el rediseño)
`stores/pos-store.ts` (totales en centavos), `api/*` (contratos), `hooks/useSyncQueue.ts`, `useBarcodeScanner.ts`, `lib/permissions.ts`, `lib/offline-catalog.ts`, `api/query-keys.ts` e `invalidate.ts`, el `quote`, `client_uuid` e `isSubmittingRef` de `pos.tsx`. Si una subfase necesita tocar alguno, se anota en `progreso.md` → Hallazgos nuevos y se pregunta antes.
