import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuthStore } from "../../../stores/auth-store";
import { ProtectedRoute } from "../protected-route";

const usuario = { id: 1, username: "admin", full_name: "Admin", role: "admin", permissions: [] };

function renderEn(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute><p>Panel</p></ProtectedRoute>} path="/" />
        <Route element={<p>Cambiar contraseña</p>} path="/cambiar-contrasena" />
        <Route element={<p>Login</p>} path="/login" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("cambio obligatorio de contraseña (FE-101)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("redirige a /cambiar-contrasena si el usuario tiene contraseña temporal", () => {
    useAuthStore.setState({ isAuthenticated: true, user: { ...usuario, must_change_password: true } });
    renderEn("/");
    expect(screen.getByText("Cambiar contraseña")).toBeTruthy();
  });

  it("tras cambiarla guarda el token nuevo y deja pasar", () => {
    useAuthStore.setState({ isAuthenticated: true, user: { ...usuario, must_change_password: true } });
    useAuthStore.getState().passwordChanged("token-nuevo");
    expect(useAuthStore.getState().accessToken).toBe("token-nuevo");
    expect(window.localStorage.getItem("pos_access_token")).toBe("token-nuevo");
    renderEn("/");
    expect(screen.getByText("Panel")).toBeTruthy();
  });

  it("un 403 password_change_required marca al usuario", () => {
    useAuthStore.setState({ isAuthenticated: true, user: { ...usuario, must_change_password: false } });
    useAuthStore.getState().requirePasswordChange();
    expect(useAuthStore.getState().user?.must_change_password).toBe(true);
  });
});
