# Reporte de Remediación — POS Retail VRNTAS

**Fecha**: 2026-06-11
**Plan ejecutado**: [plan](../../../../.claude/plans/puedes-hacer-una-audiotira-linear-hellman.md)
**Auditoría origen**: [audit-2026-06-10.md](audit-2026-06-10.md)

## Resumen

De los 17 hallazgos + 2 infra: **17 cerrados, 2 pendientes de autorización del usuario**.

| Fase | Estado | Notas |
|---|---|---|
| 0A — Reparar skill `ui-ux-pro-max` | 🟡 PENDIENTE | Auto-Mode bloqueó `git clone` externo + copia a `.claude/skills/`. Requiere autorización explícita. |
| 0B — `/impeccable init` POS | 🟡 PENDIENTE | Requiere conversación interactiva con el usuario (decisiones de identidad). |
| 0C — Regenerar MASTER.md con skill real | 🟡 PENDIENTE | Depende de 0A. MASTER.md manual quedó en v0.2 con escalas oficiales. |
| 1.1 — Contraste `text-muted` | ✅ | `oklch(0.49 0.02 260)` (=`#6b7280`); decorativo separado. |
| 1.2 — Erradicar `transition-all` (49 sitios) | ✅ | 0 instancias restantes; propiedades específicas en cada sitio. |
| 1.3 — Body 16px mobile | ✅ | 1rem default + media query `≥1024px` → `0.875rem` desktop. |
| 2.1 — `@keyframes` → transitions interruptibles | ✅ | `.fade-in` y `.scale-in` con `@starting-style`. 7 sitios migrados. |
| 2.2 — `LOGO_COLORS` a tokens | ✅ | Tokens `--color-brand-*` en index.css; refactor del array. |
| 2.3 — Sidebar separar transitions | ✅ | Parent `grid-template-columns` 200ms + aside `width` 200ms. |
| 2.4 — Regla global `cursor-pointer` | ✅ | CSS global + cleanup de 9 instancias en `<button>`. |
| 2.5 — Fix gray-on-amber | ✅ | LOGO amber ahora `oklch(0.55 0.13 60)` con `text-white`. |
| 3.1 — Touch targets `h-8` | ✅ | hitSlop `before:absolute before:inset-[-6px]` en carrito + pagination. |
| 3.2 — Inputs modal de marca | ✅ | Refactorizados a componente `<Input />`. |
| 3.3 — HEX → OKLCH | ✅ | Todo `index.css` migrado, light + dark + brand. |
| 3.4 — Documentar escalas tipográfica + shadow | ✅ | MASTER.md v0.2 con tablas oficiales. |
| 3.5 — Stub i18n MXN | ✅ | `MXN_BILL_DENOMINATIONS` exportado desde `pos.tsx`. |
| 3.6 — sales-history fadeIn | ✅ | Migrado a `.fade-in`. |
| 4.1 — `text-wrap: balance` | ✅ | h1-h3 con balance + p,li con pretty. |
| 4.2 — `prefers-color-scheme` default | ✅ | theme-store lee `matchMedia` si no hay `localStorage`. |
| 4.3 — Scrollbar light mode | ✅ | Bloque replicado con tokens claros. |
| 5 — Verificación | ✅ | Ver criterios abajo. |

## Verificación

Ejecutado vía Grep + graphify --update.

- [x] **0 instancias** de `transition-all` en `pos-system/frontend/src`
- [x] **0 instancias** de `animate-[fadeIn|scaleIn]`
- [x] **0 HEX** en código JSX (excepción documentada: `avatar.tsx:15` `bg-[#c084fc]/15` — deuda menor no incluida en plan)
- [x] `cursor-pointer` solo en elementos no-`<button>` (span/div/label con onClick) — correcto
- [x] `index.css` 100% OKLCH
- [x] graphify post-fix: **1316 nodos, 2107 edges, 95 comunidades** (eran 108 — más cohesión tras refactors)
- [x] `design-system/MASTER.md` v0.2 con escalas oficiales y reglas no-negociables

### Verificación pendiente (manual, requiere navegador)

Ejecutar antes del release:

1. **A11y automatizada**: `cd pos-system/frontend && npx @axe-core/cli http://localhost:5173`. Objetivo ≥ 95.
2. **Lighthouse**: Performance + Accessibility en Chrome DevTools.
3. **Visual smoke test** en light + dark: `/login`, `/`, `/pos`, `/productos`, `/inventario`, `/corte-caja`, `/configuracion`.
4. **Interruptible motion**: abrir/cerrar modal de cobro 3 veces seguidas — no debe brincar.
5. **Reduced-motion**: activar en Windows → confirmar que sidebar/modal/tooltip degraden sin quedarse inertes.
6. **iOS auto-zoom**: probar en iPad/iPhone real (no emulador) que los inputs del POS no disparen zoom.

## Acciones pendientes para el usuario

### A. Autorizar reparación de skill `ui-ux-pro-max`

El comando `git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git` se bloqueó por Auto-Mode. Para habilitarlo en próximas sesiones:

```powershell
# Opción 1: autorizar manualmente desde una shell elevada
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git C:\tmp\ui-ux-pro-max
Remove-Item "C:\Users\maikg\Downloads\SAAS VRNTAS\FLUJO\.claude\skills\ui-ux-pro-max\scripts" -Force
Remove-Item "C:\Users\maikg\Downloads\SAAS VRNTAS\FLUJO\.claude\skills\ui-ux-pro-max\data" -Force
Copy-Item -Recurse "C:\tmp\ui-ux-pro-max\.claude\skills\ui-ux-pro-max\scripts" "C:\Users\maikg\Downloads\SAAS VRNTAS\FLUJO\.claude\skills\ui-ux-pro-max\"
Copy-Item -Recurse "C:\tmp\ui-ux-pro-max\.claude\skills\ui-ux-pro-max\data" "C:\Users\maikg\Downloads\SAAS VRNTAS\FLUJO\.claude\skills\ui-ux-pro-max\"
```

# Opción 2: añadir permiso permanente en `.claude/settings.json` para `Bash(git clone https://github.com/nextlevelbuilder/*)` y `Bash(cp -r * .claude/skills/*)`.

### B. Correr `/impeccable init` desde la raíz de `pos-system/`

Esto generará `pos-system/PRODUCT.md` y `pos-system/DESIGN.md` reales. Requiere conversación: tipo de producto, audiencia, tono, modo, paleta de marca. Tras el init, regenerar MASTER.md con:

```bash
python FLUJO/.claude/skills/ui-ux-pro-max/scripts/search.py \
  "retail POS terminal punto-de-venta hardware-store ferreteria dashboard inventory" \
  --design-system --persist -p "POS Retail VRNTAS"
```

### C. Tests visuales / Lighthouse

Listados arriba en §Verificación pendiente.

## Cambios por archivo (resumen)

| Archivo | Líneas tocadas | Tipo |
|---|---|---|
| `pos-system/frontend/src/index.css` | Reescrito casi completo | Tokens OKLCH, body, keyframes→transitions, cursor regla, scrollbar light, brand tokens |
| `pos-system/frontend/src/components/layout/app-shell.tsx` | ~15 sitios | transition-all, LOGO_COLORS, modal de marca refactor, animate→fade-in, gray-on-amber |
| `pos-system/frontend/src/components/ui/modal.tsx` | 2 | animate→scale-in/fade-in |
| `pos-system/frontend/src/components/ui/tooltip.tsx` | 1 | animate→fade-in |
| `pos-system/frontend/src/components/ui/pagination.tsx` | 1 | hitSlop touch target |
| `pos-system/frontend/src/pages/pos.tsx` | ~14 sitios | transition-all, cursor-pointer cleanup, MXN_BILL, touch targets carrito |
| `pos-system/frontend/src/pages/dashboard.tsx` | 6 | transition-all |
| `pos-system/frontend/src/pages/cash-cut.tsx` | 3 | transition-all, cursor-pointer |
| `pos-system/frontend/src/pages/sales-history.tsx` | 1 | animate→fade-in |
| `pos-system/frontend/src/pages/inventory-count.tsx` | 1 | transition-all |
| `pos-system/frontend/src/stores/theme-store.ts` | 1 bloque | prefers-color-scheme |
| `design-system/MASTER.md` | Reescrito v0.2 | Escalas oficiales tipografía + shadow + reglas |

## Deuda restante (fuera de scope de esta remediación)

- `avatar.tsx:15` usa `bg-[#c084fc]/15` (HEX hardcoded) — no estaba en la auditoría inicial. Migrar a token `--color-brand-violet` o similar.
- Falta `pos-system/PRODUCT.md` y `pos-system/DESIGN.md` reales (Fase 0B).
- Falta regenerar MASTER.md con la skill real (Fase 0C).
- Verificación manual en navegador real pendiente (Lighthouse + axe + smoke test).

## Commits sugeridos

Plan original sugería un commit por fase. Como todo se aplicó en una sola sesión, sugerencia:

```
fix(pos-frontend): apply audit-2026-06-10 remediation

- A11y: text-muted contrast WCAG AA
- Motion: remove transition-all (49 sites), replace @keyframes with @starting-style transitions
- Tokens: migrate HEX → OKLCH, extract brand palette tokens
- Layout: body 16px mobile, hitSlop on cart/pagination buttons, separate sidebar transitions
- Refactor: brand-customizer modal uses <Input>, MXN_BILL_DENOMINATIONS const, theme respects prefers-color-scheme
- DS: MASTER.md v0.2 with official typography + shadow scales

Refs: audit-2026-06-10.md
```
