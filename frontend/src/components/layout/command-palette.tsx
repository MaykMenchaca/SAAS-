import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  Calculator,
  CornerDownLeft,
  LayoutDashboard,
  Moon,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listProducts } from "../../api/products";
import { cn } from "../../lib/cn";
import { useThemeStore } from "../../stores/theme-store";
import { useCan } from "../auth/require-permission";
import { useCommandPalette } from "./command-palette-context";
import { qk } from "../../api/query-keys";

type CommandSection = "pages" | "products" | "actions";

type Command = {
  id: string;
  label: string;
  hint?: string;
  section: CommandSection;
  keywords?: string[];
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
};

const SECTION_LABELS: Record<CommandSection, string> = {
  pages: "Páginas",
  products: "Productos",
  actions: "Acciones rápidas",
};

const SECTION_ORDER: CommandSection[] = ["actions", "pages", "products"];

/** Paleta de comandos global. Se abre con Cmd/Ctrl+K. Búsqueda fuzzy
   sobre páginas, productos del catálogo y acciones del sistema. */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const can = useCan();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset al cerrar / abrir.
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      // Focus el input cuando el modal aparece — siguiente frame para garantizar montaje.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounce de query para no martillar al backend.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const productsQuery = useQuery({
    queryKey: qk.commandPaletteProducts(debouncedQuery),
    queryFn: () => listProducts({ page: 1, perPage: 6, search: debouncedQuery }),
    enabled: open && can("productos:ver") && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const actions = useMemo<Command[]>(() => {
    const list: (Command & { permission?: string })[] = [
      {
        id: "action-new-sale",
        label: "Nueva venta",
        hint: "Ir al punto de venta",
        section: "actions",
        keywords: ["pos", "vender", "cobrar"],
        icon: ShoppingCart,
        shortcut: "F5",
        permission: "ventas:crear",
        run: () => navigate("/pos"),
      },
      {
        id: "action-close-shift",
        label: "Corte de caja",
        hint: "Cerrar turno",
        section: "actions",
        keywords: ["cerrar", "turno", "arqueo"],
        icon: Calculator,
        permission: "caja:ver",
        run: () => navigate("/corte-caja"),
      },
      {
        id: "action-new-purchase",
        label: "Nueva compra",
        hint: "Crear orden de compra",
        section: "actions",
        keywords: ["proveedor", "orden", "comprar"],
        icon: Plus,
        permission: "compras:crear",
        run: () => navigate("/compras"),
      },
      {
        id: "action-toggle-theme",
        label: theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
        section: "actions",
        keywords: ["tema", "oscuro", "claro", "dark", "light"],
        icon: theme === "dark" ? Sun : Moon,
        run: () => toggleTheme(),
      },
    ];
    return list.filter((item) => !item.permission || can(item.permission));
  }, [navigate, theme, toggleTheme, can]);

  const pages = useMemo<Command[]>(() => {
    const list: (Command & { permission?: string })[] = [
      { id: "page-dashboard", label: "Dashboard", section: "pages", keywords: ["inicio", "home", "resumen"], icon: LayoutDashboard, permission: "reportes:ver", run: () => navigate("/") },
      { id: "page-pos", label: "Punto de Venta", section: "pages", keywords: ["pos", "venta", "cobrar"], icon: ShoppingCart, permission: "ventas:crear", run: () => navigate("/pos") },
      { id: "page-inventory", label: "Inventario", section: "pages", keywords: ["stock", "existencias"], icon: Boxes, permission: "inventario:ver", run: () => navigate("/inventario") },
      { id: "page-products", label: "Productos", section: "pages", keywords: ["catalogo", "sku"], icon: Package, permission: "productos:ver", run: () => navigate("/productos") },
      { id: "page-purchases", label: "Compras", section: "pages", keywords: ["proveedores", "ordenes"], icon: Truck, permission: "compras:ver", run: () => navigate("/compras") },
      { id: "page-sales-history", label: "Historial de Ventas", section: "pages", keywords: ["tickets", "ventas previas"], icon: ReceiptText, permission: "ventas:ver", run: () => navigate("/ventas") },
      { id: "page-cash-cut", label: "Corte de Caja", section: "pages", keywords: ["arqueo", "cierre"], icon: Calculator, permission: "caja:ver", run: () => navigate("/corte-caja") },
      { id: "page-returns", label: "Devoluciones", section: "pages", keywords: ["reembolso", "regresar"], icon: CornerDownLeft, permission: "ventas:cancelar", run: () => navigate("/devoluciones") },
      { id: "page-users", label: "Usuarios", section: "pages", keywords: ["operadores", "cajeros"], icon: Users, permission: "usuarios:ver", run: () => navigate("/usuarios") },
      { id: "page-reports", label: "Reportes", section: "pages", keywords: ["analytics", "graficos"], icon: BarChart3, permission: "reportes:ver", run: () => navigate("/reportes") },
      { id: "page-settings", label: "Configuración", section: "pages", keywords: ["ajustes", "preferencias"], icon: Settings, permission: "admin", run: () => navigate("/configuracion") },
    ];
    return list.filter((item) => !item.permission || can(item.permission));
  }, [navigate, can]);

  const productCommands = useMemo<Command[]>(() => {
    if (!can("productos:ver")) return [];
    const items = productsQuery.data?.items ?? [];
    return items.map((p) => ({
      id: `product-${p.id}`,
      label: p.name,
      hint: `SKU ${p.sku}`,
      section: "products" as const,
      icon: Package,
      run: () => navigate("/productos"),
    }));
  }, [productsQuery.data, navigate, can]);

  // Filtrado: si hay query, matchea contra label + keywords; productos vienen pre-filtrados.
  const filtered = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const matchLocal = (c: Command) => {
      if (!q) return true;
      if (c.label.toLowerCase().includes(q)) return true;
      if (c.hint?.toLowerCase().includes(q)) return true;
      if (c.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    };

    const ordered: Command[] = [];
    for (const section of SECTION_ORDER) {
      const pool = section === "products" ? productCommands : section === "actions" ? actions : pages;
      ordered.push(...pool.filter(matchLocal));
    }
    return ordered;
  }, [query, actions, pages, productCommands]);

  // Mantén selectedIndex dentro de rango cuando cambia la lista.
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll al item activo.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      // Que el Esc de la paleta no llegue al atajo "vaciar carrito" del POS (H-30)
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) {
        cmd.run();
        setOpen(false);
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (!panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === null) {
          last.focus();
        } else {
          const idx = focusables.indexOf(document.activeElement as HTMLElement);
          focusables[Math.max(0, idx - 1)].focus();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
        } else {
          const idx = focusables.indexOf(document.activeElement as HTMLElement);
          focusables[Math.min(focusables.length - 1, idx + 1)].focus();
        }
      }
      return;
    }
  }

  // Agrupar para render con headers por sección.
  const grouped = filtered.reduce<Record<CommandSection, { cmd: Command; globalIndex: number }[]>>(
    (acc, cmd, idx) => {
      acc[cmd.section].push({ cmd, globalIndex: idx });
      return acc;
    },
    { actions: [], pages: [], products: [] },
  );

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      {/* Overlay */}
      <button
        aria-label="Cerrar paleta"
        className="absolute inset-0 bg-black/40 fade-in"
        onClick={() => setOpen(false)}
        tabIndex={-1}
        type="button"
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-neutral-border bg-neutral-surface shadow-2xl scale-in"
        ref={panelRef}
      >
        <h2 className="sr-only" id={titleId}>Paleta de comandos</h2>

        {/* Search */}
        <div className="flex items-center gap-2 border-b border-neutral-border px-4 py-3">
          <Search aria-hidden="true" className="text-neutral-text-secondary shrink-0" size={18} />
          <input
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-label="Buscar comandos, páginas y productos"
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-text-primary placeholder:text-neutral-text-muted outline-none"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar páginas, productos o acciones..."
            ref={inputRef}
            type="text"
            value={query}
          />
          <kbd className="rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-text-secondary">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          aria-activedescendant={filtered[selectedIndex] ? `cmd-${filtered[selectedIndex].id}` : undefined}
          className="max-h-[55vh] overflow-y-auto py-1"
          id="command-palette-list"
          ref={listRef}
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-text-secondary">
              {productsQuery.isLoading
                ? "Buscando..."
                : query.trim()
                  ? "Sin resultados. Prueba con otra palabra."
                  : "Escribe para empezar a buscar."}
            </div>
          ) : (
            SECTION_ORDER.map((section) => {
              const items = grouped[section];
              if (items.length === 0) return null;
              return (
                <div className="py-1" key={section}>
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-text-muted">
                    {SECTION_LABELS[section]}
                  </div>
                  <div className="grid gap-0.5">
                    {items.map(({ cmd, globalIndex }) => {
                      const Icon = cmd.icon;
                      const isSelected = globalIndex === selectedIndex;
                      return (
                        <button
                          aria-selected={isSelected}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2 text-left text-sm outline-none transition-colors duration-100 ease-[var(--ease-out-strong)]",
                            isSelected
                              ? "bg-primary/10 text-neutral-text-primary"
                              : "text-neutral-text-primary hover:bg-neutral-surface-raised",
                          )}
                          data-cmd-index={globalIndex}
                          id={`cmd-${cmd.id}`}
                          key={cmd.id}
                          onClick={() => {
                            cmd.run();
                            setOpen(false);
                          }}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          role="option"
                          type="button"
                        >
                          <Icon aria-hidden="true" className={cn("shrink-0", isSelected ? "text-primary-text" : "text-neutral-text-secondary")} size={16} />
                          <span className="flex-1 truncate font-medium">{cmd.label}</span>
                          {cmd.hint ? (
                            <span className="shrink-0 font-mono text-[10px] text-neutral-text-muted">{cmd.hint}</span>
                          ) : null}
                          {cmd.shortcut ? (
                            <kbd className="shrink-0 rounded border border-neutral-border bg-neutral-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-text-secondary">
                              {cmd.shortcut}
                            </kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-neutral-border bg-neutral-bg/40 px-4 py-2 text-[10px] text-neutral-text-secondary">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-neutral-border bg-neutral-surface px-1 py-0.5 font-mono">↑</kbd>
              <kbd className="rounded border border-neutral-border bg-neutral-surface px-1 py-0.5 font-mono">↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-neutral-border bg-neutral-surface px-1 py-0.5 font-mono">↵</kbd>
              ejecutar
            </span>
          </div>
          <span>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
        </div>

        {/* Región live para screen readers — anuncia cambios en resultados */}
        <div aria-atomic="true" aria-live="polite" className="sr-only">
          {filtered.length > 0
            ? `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`
            : query.trim()
              ? "Sin resultados"
              : ""}
        </div>
      </div>
    </div>
  );
}
