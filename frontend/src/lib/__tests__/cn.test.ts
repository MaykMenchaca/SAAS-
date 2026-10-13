import { describe, expect, it } from "vitest";

import { cn } from "../cn";

describe("cn (clases condicionales + resolución de conflictos de Tailwind)", () => {
  it("ignora valores falsos y une el resto", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("el padding que pasa el consumidor reemplaza al base (px-0 gana a px-4)", () => {
    // Regresión: el icono del botón "Cerrar sesión" quedaba aplastado a 2 px porque px-4 ganaba a px-0
    const result = cn("min-h-11 px-4 py-2", "w-11 px-0");
    expect(result).toContain("px-0");
    expect(result).not.toContain("px-4");
  });

  it("el tamaño de texto del consumidor reemplaza al base (text-xs gana a text-base)", () => {
    expect(cn("text-base", "text-xs")).toBe("text-xs");
  });

  it("los colores del tema se reconocen: text-ink-2 reemplaza a text-text", () => {
    expect(cn("text-text", "text-ink-2")).toBe("text-ink-2");
    expect(cn("bg-accent", "bg-bg")).toBe("bg-bg");
    expect(cn("border-divider", "border-field-border")).toBe("border-field-border");
  });

  it("un tamaño de texto no se confunde con un color: se conservan los dos", () => {
    const result = cn("text-ink-2", "text-sm");
    expect(result).toContain("text-ink-2");
    expect(result).toContain("text-sm");
  });

  it("text-page es un tamaño de fuente propio: reemplaza a text-3xl pero no a un color", () => {
    expect(cn("text-3xl", "text-page")).toBe("text-page");
    const withColor = cn("text-text", "text-page");
    expect(withColor).toContain("text-text");
    expect(withColor).toContain("text-page");
  });

  it("variantes distintas no entran en conflicto (móvil vs escritorio)", () => {
    const result = cn("text-base lg:text-sm", "px-3 lg:px-6");
    for (const c of ["text-base", "lg:text-sm", "px-3", "lg:px-6"]) expect(result).toContain(c);
  });

  it("conserva clases propias del sistema que no conoce Tailwind", () => {
    expect(cn("blueprint", "fade-in", "font-heading")).toBe("blueprint fade-in font-heading");
  });

  it("el borde fino y su color conviven (ancho y color son categorías distintas)", () => {
    const result = cn("border", "border-divider");
    expect(result).toContain("border");
    expect(result).toContain("border-divider");
  });
});
