import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AxiosError } from "axios";

import { useAuthStore } from "../../stores/auth-store";
import { ChangePasswordPage } from "../change-password";
import { LoginPage } from "../login";
import { NotFoundPage } from "../not-found";

vi.mock("../../api/auth", () => ({ changePasswordRequest: vi.fn() }));

function renderLogin() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

beforeEach(() => {
  window.localStorage.clear();
  useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null });
});

describe("Login", () => {
  it("muestra la marca, los beneficios y un solo h1", () => {
    renderLogin();
    expect(screen.getByText("Acceso a caja local")).toBeTruthy();
    expect(screen.getByText("Corte de caja con conteo por denominaciones")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Entrar al sistema/ })).toBeTruthy();
  });

  it("valida usuario y contraseña vacíos con un error inline", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: /Entrar al sistema/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Ingresa tu usuario y contraseña");
  });

  it("credenciales incorrectas (401) muestran el error inline", async () => {
    const login = vi.fn().mockRejectedValue(new AxiosError("x", "401", undefined, undefined, { status: 401 } as never));
    useAuthStore.setState({ login } as never);
    renderLogin();
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "mala" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar al sistema/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Usuario o contraseña incorrectos."));
    expect(login).toHaveBeenCalledWith("admin", "mala");
  });

  it("deshabilita el botón mientras valida", () => {
    useAuthStore.setState({ isLoading: true });
    renderLogin();
    expect((screen.getByRole("button", { name: /Validando/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Cambio de contraseña y 404", () => {
  it("cambio de contraseña valida coincidencia y deshabilita el envío", () => {
    render(<MemoryRouter><ChangePasswordPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Cambia tu contraseña" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contraseña actual (temporal)"), { target: { value: "temporal123" } });
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: "nueva-clave-1" } });
    fireEvent.change(screen.getByLabelText("Confirma la contraseña nueva"), { target: { value: "otra" } });
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Guardar y continuar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("404 ofrece volver al inicio", () => {
    render(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Volver/ }).getAttribute("href")).toBe("/");
  });
});
