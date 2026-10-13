import { extendTailwindMerge } from "tailwind-merge";

/**
 * Colores del tema para que tailwind-merge los reconozca como colores (y no como tamaños de texto):
 * así `text-ink-2` pisa a `text-text` y `text-xs` no se confunde con un color.
 * Los nombres anteriores al rediseño se mantienen mientras existan los alias de index.css (se retiran en 8.3).
 */
const THEME_COLORS = [
  // Industry
  "bg", "surface", "text", "divider", "ink-2", "ink-3", "line-soft", "field-border",
  "accent", "accent-hover", "acc-text", "acc-tint", "on-acc",
  "ok", "ok-tint", "warn", "warn-tint", "bad", "bad-tint", "on-bad", "overlay",
  // alias anteriores
  "primary", "primary-hover", "primary-text", "on-primary", "success", "success-text", "warning", "warning-text",
  "danger", "danger-text", "on-danger", "info", "info-text", "outline",
  "neutral-bg", "neutral-surface", "neutral-surface-raised", "neutral-border", "neutral-border-strong",
  "neutral-text-primary", "neutral-text-secondary", "neutral-text-muted", "neutral-decorative",
  "sidebar-bg", "sidebar-text", "pos-bg", "pos-cart", "pos-total-bg", "pos-total-text",
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
