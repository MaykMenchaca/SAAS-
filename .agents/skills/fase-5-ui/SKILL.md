---
name: fase-5-ui
description: Ejecuta la Fase 5 (interfaz, UX visual y accesibilidad) del plan de corrección del POS. Dashboard con datos reales, invalidaciones de React Query, ergonomía del POS, contraste y foco, layout responsive con drawer, escala tipográfica y textos en español. Úsala desde el orquestador o cuando se pida la fase 5, una subfase 5.x o un hallazgo UI-xx.
---

# Fase 5: Interfaz, UX visual y accesibilidad (H-27, H-29, H-30, H-44, H-49, H-53, H-54, UI-01…17)

**Requisito:** fases 0-3 aprobadas. Puede correr en paralelo con la Fase 4, carril B, si no tocan los mismos archivos; coordina con `progreso.md`.
**Referencias obligatorias:** `../design/system/MASTER.md`, `../design/audits/*_obsidian_edition/` y `frontend/src/index.css`. Respeta lo ya remediado en `docs/remediation-2026-06-11.md`.
**Verificación de cada subfase visual:** abre el navegador (Antigravity browser agent) en `http://localhost:3000`, a 1280, 768 y 375 px, en tema claro y oscuro. Mide el contraste con estilos computados.

## 5.1 Dashboard con datos reales (H-27, UI-11)
- **Backend:** `api/reports.py` `/dashboard` agrega `revenue_prev_day`, `sales_prev_day`, `revenue_prev_month` y `open_sessions: [{id, register, user, revenue, count}]`.
  - **Test:** `test_dashboard_incluye_periodo_anterior`.
- **`pages/dashboard.tsx:92-146`:**
  - `delta` calculado (y se oculta si el periodo anterior es 0).
  - El banner de turno usa `open_sessions` ("Sin turno abierto" si no hay ninguno).
  - "Vendido en turno" sale de la sesión.
  - Montos con `formatCurrency`.
- **`pages/settings.tsx:196-217`:**
  - "Red" con el ping real (hook `useServerStatus` contra `/api/health`).
  - Versión desde `import.meta.env.VITE_APP_VERSION`, inyectada desde `package.json` en `vite.config.ts`.
  - "Reiniciar terminal" usa `Modal` y hace lo que dice: limpiar los stores y la caché, y recargar.

## 5.2 Datos frescos (H-29)
- `src/api/query-keys.ts` (`qk.stock()`, `qk.products()`, `qk.dashboard()`, …) y `src/api/invalidate.ts` con `invalidateAfterSale(qc)` e `invalidateInventory(qc)`.
- Aplicarlos en: `pos.tsx:743-750`, `sales-history.tsx:142`, `returns.tsx:180`, `purchases.tsx:298`, `inventory.tsx:184` e `inventory-count.tsx:283`.

## 5.3 Ergonomía del POS (H-30, H-53)
- `pos.tsx:247-250`: ignorar Esc si `document.activeElement` es un input o si la paleta está abierta. Con más de 3 artículos, pedir confirmación con `Modal`.
- `command-palette.tsx:188-191`: agregar `stopPropagation()`.
- Ocultar el método "Crédito" (`pos.tsx:333-346`) mientras esté fuera del MVP.

## 5.4 Notificaciones, reportes y catálogos (H-44, H-49, H-54)
- **Campana** (`app-shell.tsx:532-546`): popover con stock bajo, OC pendientes (borrador, enviada o parcial) y ventas offline pendientes o rechazadas. "Conexión LAN" usa `useServerStatus`.
- **`reports.tsx:115-130`:** validar que la fecha inicial sea anterior a la final. Rellenar con 0 los días sin ventas. Ticks con `toLocaleDateString('es-MX')`. SVG con `role="img"` y `aria-label` (UI-13).
- **Datos duplicados:** migración de datos que unifica las categorías que solo difieren en mayúsculas (reasignar productos) y el proveedor "Sin Proveedor". ⚠️ Confirma con el usuario.

## 5.5 Contraste y foco (UI-01, UI-02, UI-06, UI-14)
- **`index.css`:**
  - Tokens `--color-on-primary` (texto oscuro, como la referencia Obsidian) y `--color-primary-text` (≈`oklch(0.52 0.15 235)`) en claro y oscuro.
  - Regla `:focus-visible { outline: 2px solid var(--color-primary-text); outline-offset: 2px; }`.
- **`components/ui/button.tsx`:** primary y danger usan `text-[--color-on-primary]`. El anillo de `Button` e `Input` debe medir ≥3:1.
- **`app-shell.tsx:388,473,534,552`:** quitar los `outline-none` sin reemplazo. Sidebar sin `/50` en el subtítulo y el rol.
- **`badge.tsx`:** texto de L≈0.45 sobre el tinte. **`avatar.tsx`:** usar un token.
- **Folios, tabs activas y "Ver todo":** `text-[--color-primary-text]`.
- **Login (UI-14):** placeholder "usuario", botón activo con validación inline, contraste ≥3:1 en "VRNTAS" y marca desde `/api/config/branding`.
- **Criterio:** todo texto ≥4.5:1 (≥3:1 si mide 24 px o más) y el foco visible con Tab en el sidebar y el header.

## 5.6 Responsive (UI-03, UI-05, UI-08, UI-09, UI-17)
- **`app-shell.tsx`:**
  - `<aside>` con `hidden lg:flex`.
  - Drawer off-canvas por debajo de `lg`: botón hamburguesa en el header, overlay, cierre con Esc, al navegar y al tocar fuera, y foco atrapado.
- **Header:** botones de icono con `shrink-0 size-11`. Breadcrumb oculto por debajo de `md`.
- **`dashboard.tsx`:** `min-w-0` en el grid y gráfica sin etiquetas de valor por debajo de `sm`. Criterio: `scrollWidth <= innerWidth` a 375 px.
- **`input.tsx` y `select.tsx`:** `text-base lg:text-sm`.
- **`toggle.tsx`** y los enlaces del sidebar: `min-h-11`. "Cerrar sesión" con hitSlop.
- **`table.tsx`:** wrapper con sombra o fade cuando hay overflow-x.
- **`cash-cut.tsx`:** en el estado vacío, CTA "Abrir caja" hacia `/pos`.

## 5.7 Tipografía y formato (UI-07, UI-10)
- Componente `PageHeader` (h1 de 32 px en desktop y 24 px en móvil, según MASTER) en todas las páginas.
- Reemplazar todos los `text-[9px]`, `text-[10px]` y `text-[11px]` por la escala (los de 10 px solo en badges y kbd).
- KPI de 32 px.
- **`lib/formatters.ts`:** `formatQuantity(q, unit)` (enteros si la unidad no admite fracciones) y "—" para un máximo de 0. Aplicarlo en `products.tsx`, `inventory.tsx` y `dashboard.tsx`.

## 5.8 Textos y pulido (UI-12, UI-15, UI-16)
- **Acentos:** `settings.tsx:111,204,213,256,286`, `pos.tsx:226,822`, `reports.tsx:225,364` y "Mín."/"Máx." en el modal de producto.
- **Traducciones:** "Backups" → "Respaldos", "Online" → "En línea", "Admin" → "Administrador". Plural "1 transacción".
- **`document.title`** por ruta: `"<Página> · <marca>"`.
- **Accesibilidad:** `aria-label="Volver a inventario"` en `inventory-count.tsx`.
- Quitar el `cursor-pointer` manual (`app-shell.tsx:473,534,552`). Usar `Modal` en lugar de `window.confirm`.

## Cierre
Ejecuta `/gate-fase` con N=5. Incluye volver a correr `revisor-visual`, que debe tener 0 hallazgos Altos.
