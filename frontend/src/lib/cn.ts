import { extendTailwindMerge } from "tailwind-merge";

/**
 * Colores del tema para que tailwind-merge los reconozca como colores (y no como tamaños de texto):
 * así `text-ink-2` pisa a `text-text` y `text-xs` no se confunde con un color.
 */
const THEME_COLORS = [
  // Industry
  "bg", "surface", "text", "divider", "ink-2", "ink-3", "line-soft", "field-border",
  "accent", "accent-hover", "acc-text", "acc-tint", "on-acc",
  "ok", "ok-tint", "warn", "warn-tint", "bad", "bad-tint", "on-bad", "overlay",
  "brand-cyan", "brand-emerald", "brand-indigo", "brand-amber", "brand-rose", "brand-slate", "brand-violet",
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: THEME_COLORS,
      // `text-page` (título de página de 38 px) es un tamaño de fuente propio del tema
      text: ["page"],
    },
  },
});

/**
 * Une clases condicionales y resuelve los conflictos de Tailwind: gana la última.
 * Sin esto, un `px-0` o `text-xs` pasado por un consumidor perdía contra el `px-4`/`text-base` base
 * del componente por el orden del CSS generado.
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}
