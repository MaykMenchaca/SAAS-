import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { logoAppearance } from "../brand-mark";
import { MobileDrawer } from "../mobile-drawer";
import { filterNav, findNavEntry, initialsOf, navSections, roleLabel } from "../nav-config";
import { NavList } from "../nav-list";
import { Sidebar } from "../sidebar";

const getActiveSession = vi.fn();
const getBranding = vi.fn();
vi.mock("../../../api/sales", () => ({ getActiveSession: () => getActiveSession() }));
vi.mock("../../../api/config", () => ({ getBranding: () => getBranding() }));

const CAJERO_PERMS = ["ventas:crear", "ventas:ver", "caja:ver", "caja:abrir", "caja:cerrar", "productos:ver", "inventario:ver"];
const baseUser = { id: 2, username: "jperez", full_name: "Jorge Pérez", permissions: [] as string[] };
const badges = { lowStock: 6, pendingPurchases: 1 };

function setUser(role: string, permissions: string[] = []) {
  useAuthStore.setState({ isAuthenticated: true, user: { ...baseUser, role, permissions, must_change_password: false } as never });
}

function wrap(ui: React.ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  getActiveSession.mockResolvedValue({ session: null });
  getBranding.mockResolvedValue({ company_name: "Ferretería El Clavo", company_subtitle: "Sucursal Centro", company_logo_icon: "Store", company_logo_color: "primary" });
});

describe("nav-config", () => {
  const labels = (sections: ReturnType<typeof filterNav>) => sections.flatMap((s) => s.items.map((i) => i.label));

  it("el administrador ve toda la navegación, incluida Configuración", () => {
    const sections = filterNav(navSections, { isAdmin: true, can: () => true });
    expect(sections.map((s) => s.label)).toEqual(["Principal", "Inventario", "Finanzas", "Sistema"]);
    expect(labels(sections)).toContain("Configuración");
  });

  it("el cajero solo ve lo que sus permisos permiten (sin Dashboard, Usuarios, Reportes ni Configuración)", () => {
    const sections = filterNav(navSections, { isAdmin: false, can: (p) => CAJERO_PERMS.includes(p) });
    const visible = labels(sections);
    expect(visible).toEqual(expect.arrayContaining(["Punto de Venta", "Inventario", "Productos", "Historial de Ventas", "Corte de Caja"]));
    for (const hidden of ["Dashboard", "Usuarios", "Reportes", "Configuración", "Compras", "Devoluciones"]) expect(visible).not.toContain(hidden);
  });

  it("Configuración es solo del administrador aunque el usuario tenga el permiso", () => {
    const sections = filterNav(navSections, { isAdmin: false, can: () => true });
    expect(labels(sections)).not.toContain("Configuración");
  });

  it("las secciones que quedan vacías desaparecen", () => {
    const sections = filterNav(navSections, { isAdmin: false, can: (p) => p === "ventas:crear" });
    expect(sections.map((s) => s.label)).toEqual(["Principal"]);
  });

  it("findNavEntry resuelve sección y página, también en subrutas", () => {
    expect(findNavEntry("/")?.item.label).toBe("Dashboard");
    expect(findNavEntry("/pos")?.section).toBe("Principal");
    expect(findNavEntry("/inventario/conteo")?.item.label).toBe("Inventario");
    expect(findNavEntry("/ruta-que-no-existe")).toBeNull();
  });

  it("la raíz solo coincide con '/' (no con todas las rutas)", () => {
    expect(findNavEntry("/productos")?.item.label).toBe("Productos");
  });

  it("roleLabel e initialsOf", () => {
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("gerente")).toBe("Gerente");
    expect(roleLabel("auditor")).toBe("Auditor");
    expect(roleLabel(undefined)).toBe("Usuario");
    expect(initialsOf("Laura Méndez")).toBe("LM");
    expect(initialsOf("Admin")).toBe("AD");
    expect(initialsOf("  ")).toBe("?");
    expect(initialsOf(undefined)).toBe("?");
  });
});

describe("logoAppearance", () => {
  it("el color principal es el acento de acero con texto claro", () => {
    expect(logoAppearance("primary").className).toContain("bg-accent");
    expect(logoAppearance("primary").className).toContain("text-on-acc");
  });

  it("un matiz personalizado usa un fondo oscuro con texto blanco (contraste) salvo en amarillos", () => {
    const azul = logoAppearance("235");
    expect(azul.style?.backgroundColor).toContain("oklch(0.52");
    expect(azul.className).toContain("text-white");
    expect(logoAppearance("70").className).toContain("text-text");
  });

  it("un valor desconocido cae al color principal", () => {
    expect(logoAppearance("no-es-un-color").className).toContain("bg-accent");
  });
});

describe("NavList", () => {
  const sections = filterNav(navSections, { isAdmin: true, can: () => true });

  it("marca la página actual con aria-current y muestra los contadores", () => {
    wrap(<NavList badges={badges} sections={sections} />, "/inventario");
    const active = screen.getByRole("link", { current: "page" });
    expect(active.textContent).toContain("Inventario");
    expect(active.textContent).toContain("6");
    expect(screen.getByRole("link", { name: /Compras/ }).textContent).toContain("1");
  });

  it("el contador de stock bajo es ámbar y el de compras es de acento", () => {
    wrap(<NavList badges={badges} sections={sections} />);
    expect(screen.getByText("6").className).toContain("bg-warn-tint");
    expect(screen.getByText("1").className).toContain("bg-acc-tint");
  });

  it("los contadores grandes se limitan a 99+", () => {
    wrap(<NavList badges={{ lowStock: 250, pendingPurchases: 0 }} sections={sections} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("colapsado: solo iconos con nombre accesible y un punto en vez del contador", () => {
    const { container } = wrap(<NavList badges={badges} collapsed sections={sections} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(screen.queryByText("Principal")).toBeNull(); // sin etiquetas de sección
    expect(screen.queryByText("6")).toBeNull();
    expect(container.querySelectorAll("a span.rounded-full").length).toBeGreaterThanOrEqual(2);
  });

  it("al navegar llama a onNavigate (cierra el drawer)", () => {
    const onNavigate = vi.fn();
    wrap(<NavList badges={badges} onNavigate={onNavigate} sections={sections} />);
    fireEvent.click(screen.getByRole("link", { name: /Productos/ }));
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe("Sidebar", () => {
  const sections = filterNav(navSections, { isAdmin: true, can: () => true });

  it("expandido muestra la marca del local, el usuario y 'Sin turno abierto' si no hay sesión", async () => {
    setUser("admin");
    wrap(<Sidebar badges={badges} collapsed={false} sections={sections} />);
    expect(await screen.findByText("Ferretería El Clavo")).toBeTruthy();
    expect(screen.getByText("Sucursal Centro")).toBeTruthy();
    expect(await screen.findByText("Sin turno abierto")).toBeTruthy();
    expect(screen.getByText("Jorge Pérez")).toBeTruthy();
    expect(screen.getByText(/jperez · Administrador/)).toBeTruthy();
  });

  it("muestra el turno real: caja, hora de apertura y fondo", async () => {
    setUser("admin");
    getActiveSession.mockResolvedValue({
      session: { id: 1, cash_register_name: "Caja 2", opened_at: "2026-10-12T14:05:00Z", opening_amount: "1500.00", status: "abierta" },
    });
    wrap(<Sidebar badges={badges} collapsed={false} sections={sections} />);
    expect(await screen.findByText("Caja 2 · Turno abierto")).toBeTruthy();
    expect(screen.getByText(/Fondo \$1,500\.00/)).toBeTruthy();
  });

  it("sin el permiso caja:ver no consulta ni muestra un turno ajeno", async () => {
    setUser("cajero", ["ventas:crear"]);
    wrap(<Sidebar badges={badges} collapsed={false} sections={sections} />);
    expect(await screen.findByText("Sin turno abierto")).toBeTruthy();
    expect(getActiveSession).not.toHaveBeenCalled();
  });

  it("solo el administrador puede personalizar la marca (el logo es un botón)", async () => {
    setUser("admin");
    const onCustomize = vi.fn();
    wrap(<Sidebar badges={badges} collapsed={false} onCustomizeBrand={onCustomize} sections={sections} />);
    fireEvent.click(await screen.findByRole("button", { name: "Personalizar la marca del local" }));
    expect(onCustomize).toHaveBeenCalledTimes(1);
  });

  it("sin permiso de personalizar, el logo no es un botón", async () => {
    setUser("cajero", CAJERO_PERMS);
    wrap(<Sidebar badges={badges} collapsed={false} sections={sections} />);
    await screen.findByText("Ferretería El Clavo");
    expect(screen.queryByRole("button", { name: "Personalizar la marca del local" })).toBeNull();
  });

  it("colapsado no muestra textos de marca ni de usuario", async () => {
    setUser("admin");
    wrap(<Sidebar badges={badges} collapsed sections={sections} />);
    expect(screen.queryByText("Ferretería El Clavo")).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    expect(await screen.findByRole("img", { name: "Sin turno abierto" })).toBeTruthy();
  });
});

describe("MobileDrawer", () => {
  const sections = filterNav(navSections, { isAdmin: true, can: () => true });

  it("cerrado no renderiza nada", () => {
    setUser("admin");
    wrap(<MobileDrawer badges={badges} onClose={() => undefined} open={false} sections={sections} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("abierto es un diálogo modal con la navegación y pone el foco en Cerrar menú", async () => {
    setUser("admin");
    wrap(<MobileDrawer badges={badges} onClose={() => undefined} open sections={sections} />);
    const dialog = screen.getByRole("dialog", { name: "Menú de navegación principal" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("link", { name: /Punto de Venta/ })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cerrar menú" })));
  });

  it("Esc, el botón Cerrar y elegir una página lo cierran", async () => {
    setUser("admin");
    const onClose = vi.fn();
    wrap(<MobileDrawer badges={badges} onClose={onClose} open sections={sections} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("link", { name: /Productos/ }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
