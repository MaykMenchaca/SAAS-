import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { UsersPage } from "../../users";
import { buildPermissionMatrix } from "../helpers";

const userEvent = { click: async (el: Element) => { fireEvent.click(el); } };

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listRoles: vi.fn(),
  listPermissions: vi.fn(),
  resetUserPassword: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
}));

vi.mock("../../../api/users", () => api);

const permisos = [
  { code: "usuarios:ver", module: "usuarios", description: "Ver" },
  { code: "usuarios:crear", module: "usuarios", description: "Crear" },
  { code: "ventas:crear", module: "ventas", description: "Vender" },
  { code: "ventas:ver", module: "ventas", description: "Ver ventas" },
];

const roles = [
  { id: 1, name: "admin", description: "Acceso completo", permissions: permisos },
  { id: 2, name: "cajero", description: "Vende y cobra", permissions: [permisos[2]] },
];

const jorge = {
  id: 3, username: "jperez", email: null, full_name: "Jorge Pérez", role: "cajero", role_id: 2,
  is_active: true, last_login_at: null, created_at: "2026-10-01T10:00:00Z",
};
const ana = { ...jorge, id: 4, username: "aruiz", full_name: "Ana Ruiz", is_active: false, last_login_at: "2026-10-08T20:55:00Z" };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function sesion(permissions: string[], role = "gerente") {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 9, username: "x", full_name: "X", role, permissions } });
}

describe("Usuarios (7.1)", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listUsers.mockResolvedValue({ items: [jorge, ana], total: 2, page: 1, pages: 1, per_page: 20 });
    api.listRoles.mockResolvedValue(roles);
    api.listPermissions.mockResolvedValue(permisos);
    sesion([], "admin");
  });

  it("muestra la lista con último acceso, la matriz de permisos y un solo h1", async () => {
    renderPage();
    expect(await screen.findByText("Jorge Pérez")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Nunca")).toBeTruthy();
    expect(screen.getByText("Permisos por rol")).toBeTruthy();
    // ventas: cajero 1/2, admin 2/2
    expect(await screen.findByText("1/2")).toBeTruthy();
    expect(screen.getAllByText("2/2").length).toBeGreaterThan(0);
  });

  it("muestra el estado de carga, de error y el vacío", async () => {
    api.listUsers.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderPage();
    expect(document.querySelector("[aria-busy='true'], .animate-pulse")).toBeTruthy();
    unmount();

    api.listUsers.mockRejectedValue(new Error("falla"));
    const segundo = renderPage();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeTruthy();
    segundo.unmount();

    api.listUsers.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1, per_page: 20 });
    renderPage();
    expect(await screen.findByText("No hay usuarios que coincidan.")).toBeTruthy();
  });

  it("sin permisos de escritura no ofrece Nuevo usuario y el panel queda de solo lectura", async () => {
    sesion(["usuarios:ver"]);
    renderPage();
    await screen.findByText("Jorge Pérez");
    expect(screen.queryByRole("button", { name: /Nuevo usuario/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Editar Jorge Pérez" }));
    expect(screen.getByText("Tu rol solo puede consultar los usuarios.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restablecer contraseña" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });

  it("restablece la contraseña: confirma, muestra la temporal una sola vez y avisa", async () => {
    api.resetUserPassword.mockResolvedValue({ user: jorge, temporary_password: "Xk3mPq9RtVw2zA" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Editar Jorge Pérez" }));
    await userEvent.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    const confirmar = within(await screen.findByRole("dialog")).getByRole("button", { name: "Restablecer contraseña" });
    expect(api.resetUserPassword).not.toHaveBeenCalled();
    await userEvent.click(confirmar);

    expect(await screen.findByTestId("temporary-password")).toHaveProperty("textContent", "Xk3mPq9RtVw2zA");
    expect(api.resetUserPassword.mock.calls[0][0]).toBe(3);
    expect(screen.getByText(/No se volverá a mostrar/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Copiar" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Xk3mPq9RtVw2zA"));

    await userEvent.click(screen.getByRole("button", { name: "Listo, ya la anoté" }));
    expect(screen.queryByTestId("temporary-password")).toBeNull();
    expect(screen.queryByText("Xk3mPq9RtVw2zA")).toBeNull();
  });

  it("muestra el error del servidor al restablecer", async () => {
    api.resetUserPassword.mockRejectedValue(Object.assign(new Error("x"), {}));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Editar Jorge Pérez" }));
    await userEvent.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Restablecer contraseña" }));
    expect(await screen.findByText("No se pudo restablecer la contraseña.")).toBeTruthy();
  });

  it("desactivar pide confirmación y reactivar usa PATCH is_active", async () => {
    api.deactivateUser.mockResolvedValue({ ...jorge, is_active: false });
    api.updateUser.mockResolvedValue({ ...ana, is_active: true });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Editar Jorge Pérez" }));
    await userEvent.click(screen.getByRole("button", { name: "Desactivar usuario" }));
    expect(api.deactivateUser).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(api.deactivateUser.mock.calls[0][0]).toBe(3));

    await userEvent.click(screen.getByRole("button", { name: "Editar Ana Ruiz" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reactivar usuario" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(4, { is_active: true }));
  });

  it("crea un usuario con contraseña temporal y rol", async () => {
    api.createUser.mockResolvedValue({ ...jorge, id: 10, username: "nuevo", full_name: "Nuevo Usuario" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Nuevo usuario/ }));
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "nuevo" } });
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Nuevo Usuario" } });
    fireEvent.change(screen.getByLabelText("Contraseña temporal"), { target: { value: "clave-segura" } });
    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalled());
    expect(api.createUser.mock.calls[0][0]).toEqual({
      username: "nuevo", full_name: "Nuevo Usuario", email: null, password: "clave-segura", role_id: 2,
    });
    expect(await screen.findByText("Usuario guardado.")).toBeTruthy();
  });
});

describe("buildPermissionMatrix", () => {
  it("cuenta concedidos sobre el total del módulo por rol", () => {
    const filas = buildPermissionMatrix(roles, permisos);
    const ventas = filas.find((f) => f.module === "ventas")!;
    expect(ventas.cells[1]).toEqual({ granted: 2, total: 2 });
    expect(ventas.cells[2]).toEqual({ granted: 1, total: 2 });
    const usuarios = filas.find((f) => f.module === "usuarios")!;
    expect(usuarios.cells[2]).toEqual({ granted: 0, total: 2 });
  });
});
