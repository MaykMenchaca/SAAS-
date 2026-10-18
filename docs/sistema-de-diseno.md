# Sistema de diseño "Industry"

Guía vigente de la interfaz del POS (rediseño de octubre de 2026). Reemplaza a `design/system/MASTER.md`.
Los prototipos de referencia y la tabla de equivalencias están en `docs/rediseno-2026-10/`.

## Principios
- **Línea, no relleno:** paneles planos con borde fino (`divider`); los campos son los únicos con fondo (`surface`).
- **Esquinas rectas** (`--radius-*: 0`). Solo los círculos (puntos de estado, spinner) usan `rounded-full`.
- **Marcas de registro `+`:** `.blueprint` + `<Corners/>` en secciones destacadas.
- **Tipografía local** (el POS opera sin internet): Barlow Condensed para títulos (`font-heading`), Barlow para texto. No se cargan fuentes de Google.
- **Cifras** con `tabular-nums`. Para texto monoespaciado real (tickets) se usa un stack explícito; `font-mono` del tema es Barlow.

## Tokens (`frontend/src/index.css`)
| Uso | Token |
|---|---|
| Fondo / campos | `bg`, `surface` |
| Texto | `text`, `ink-2` (secundario, ≥4.5:1), `ink-3` (**solo decorativo**) |
| Líneas | `divider`, `line-soft`, `field-border` (controles, ≥3:1) |
| Acento | `accent`, `accent-hover`, `acc-text`, `acc-tint`, `on-acc` (relleno en tono 700, `#416180`) |
| Estados | `ok`, `warn`, `bad` (+ `-tint`), `on-bad` |
| Capas | `overlay` |

Tema por clase: `html.dark` / `html.light` (variante `dark:` de Tailwind enlazada a esa clase).
Los colores se escriben solo como hex, `oklch()` o `color-mix(in srgb, X n%, transparent)` para que `tools/contrast_check.py` pueda medirlos.

## Reglas de código
- Usa `cn()` (tailwind-merge con los tokens del tema): gana la última clase.
- Tailwind solo genera clases **completas y literales**; no armes `hover:${x}`.
- Un tinte translúcido sobre `bg-divider` rompe el contraste: apóyalo en el fondo opaco (`[background:linear-gradient(var(--color-acc-tint),var(--color-acc-tint)),var(--color-bg)]`).
- Las rejillas de página llevan `grid-cols-[minmax(0,1fr)]` para no ensancharse con tablas anchas; los grupos `Segmented` hacen scroll propio.
- Componentes en `frontend/src/components/ui/`; catálogo vivo en la ruta `ui-catalog`.

## Verificación
```powershell
python tools/contrast_check.py     # 44 pares WCAG en claro y oscuro
python tools/verify_design.py      # reglas estáticas de diseño (también en el hook de pre-commit)
cd frontend; npx tsc -b; npx vitest run; npm run build
```
Al auditar contraste en un navegador, termina primero las animaciones (`document.getAnimations().forEach(a => a.finish())`): las transiciones de color dan falsos fallos.
