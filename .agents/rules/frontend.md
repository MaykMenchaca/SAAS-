---
trigger: glob
globs: frontend/src/**/*.ts,frontend/src/**/*.tsx,frontend/src/**/*.css
description: Convenciones del frontend React del POS (dinero, React Query, permisos, diseño)
---

# Reglas frontend

- **Dinero.**
  - Calcula con centavos enteros y redondeo por línea, igual que el backend (HALF_EVEN).
  - El total con el que se cobra es el que devuelve `POST /api/sales/quote` (cuando exista, fase 1.2).
  - Los decimales viajan a la API como string (`toFixed(2)` y `toFixed(3)`).
- **Errores de red frente a errores del servidor.**
  - Solo `!error.response` o un timeout cuentan como "sin conexión".
  - Un 4xx o 5xx se muestra al usuario. Nunca se encola como venta offline.
- **React Query.**
  - Usa las query keys de la factory `qk` (cuando exista, fase 5.2).
  - Después de toda mutación se invalidan los prefijos afectados con los helpers `invalidateAfterSale` e `invalidateInventory`.
- **Permisos.** Usa `can(perm)` y `<RequirePermission>` (cuando existan, fase 2.3). No muestres menús, rutas ni queries a quien no tiene el permiso.
- **Estado.** El logout limpia `queryClient` y el store del POS. El POS valida que su `sessionId` siga abierto.
- **Diseño.**
  - Sigue `../design/system/MASTER.md`.
  - Usa solo los tokens de `src/index.css` (OKLCH). No uses hex fijos.
  - No uses `transition-all` ni `cursor-pointer` manual en `<button>`.
  - Escala tipográfica 10/12/14/16/18/24/32/48. No uses `text-[Npx]`.
  - Contraste ≥4.5:1 en texto y ≥3:1 en el resto. Foco visible con `:focus-visible`.
  - Objetivos táctiles de al menos 44 px.
- **Componentes.**
  - Reutiliza `src/components/ui/*`: `Modal` para confirmaciones (no uses `window.confirm`), `Input`, `Button` y `Badge`.
  - Para moneda, usa `formatCurrency` de `src/lib/formatters.ts`.
- **Textos.** En español con acentos. Para errores, usa `toast.error` con el mensaje del backend.
- **Verificación.** `npm run build` debe pasar sin errores ni `any` nuevos.
