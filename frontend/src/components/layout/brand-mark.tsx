import { Boxes, Hammer, Package, ShoppingCart, Store, Wrench } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "../../lib/cn";

export const LOGO_ICONS = {
  ShoppingCart,
  Wrench,
  Hammer,
  Boxes,
  Package,
  Store,
};

/** Colores de la marca. `primary` es el acento de acero del sistema; el resto son alternativas del local. */
export const LOGO_COLORS = [
  { id: "primary", bg: "bg-accent", text: "text-on-acc", label: "Acero (principal)" },
  { id: "emerald", bg: "bg-brand-emerald", text: "text-white", label: "Esmeralda" },
  { id: "indigo", bg: "bg-brand-indigo", text: "text-white", label: "Índigo" },
  { id: "amber", bg: "bg-brand-amber", text: "text-white", label: "Ámbar" },
  { id: "rose", bg: "bg-brand-rose", text: "text-white", label: "Rosa" },
  { id: "slate", bg: "bg-brand-slate", text: "text-white", label: "Gris acero" },
];

export const isCustomColor = (colorId: string) => !LOGO_COLORS.some((c) => c.id === colorId);

/** Clases y estilo del cuadro de marca según el color configurado (preset o matiz personalizado). */
export function logoAppearance(colorKey: string): { className: string; style?: CSSProperties } {
  const preset = LOGO_COLORS.find((c) => c.id === colorKey);
  if (preset) return { className: cn(preset.bg, preset.text) };
  const hue = parseInt(colorKey, 10);
  if (!Number.isNaN(hue)) {
    return {
      className: hue >= 50 && hue <= 95 ? "text-text" : "text-white",
      style: { backgroundColor: `oklch(0.52 0.12 ${hue})` },
    };
  }
  return { className: cn(LOGO_COLORS[0].bg, LOGO_COLORS[0].text) };
}

type BrandMarkProps = {
  className?: string;
  colorKey?: string;
  iconKey?: string;
  size?: number;
};

/** Cuadro de marca (34 px en el diseño): el icono y el color configurados por el local, en acero por defecto. */
export function BrandMark({ className, colorKey = "primary", iconKey = "ShoppingCart", size = 34 }: BrandMarkProps) {
  const Icon = LOGO_ICONS[iconKey as keyof typeof LOGO_ICONS] ?? ShoppingCart;
  const { className: colors, style } = logoAppearance(colorKey);
  return (
    <div
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center", colors, className)}
      style={{ width: size, height: size, ...style }}
    >
      <Icon size={Math.round(size * 0.52)} />
    </div>
  );
}
