import type { FormEvent } from "react";
import { useState } from "react";
import { AxiosError } from "axios";
import { KeyRound, LogIn, UserRound } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";
import { Button, Input } from "../components/ui";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const login = useAuthStore((state) => state.login);
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  const state = location.state as LocationState | null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const trimmedUser = username.trim();
      const lastUser = typeof window !== "undefined" ? localStorage.getItem("pos_last_auth_user") : null;
      const isSameUser = Boolean(lastUser && lastUser.toLowerCase() === trimmedUser.toLowerCase());

      await login(trimmedUser, password);

      if (typeof window !== "undefined") {
        localStorage.setItem("pos_last_auth_user", trimmedUser);
      }

      // No restaurar state.from cuando cambia el usuario (H-18)
      const targetPath = isSameUser && state?.from?.pathname ? state.from.pathname : "/";
      navigate(targetPath, { replace: true });
    } catch (caught) {
      if (caught instanceof AxiosError && caught.response?.status === 401) {
        setError("Usuario o contraseña incorrectos.");
        return;
      }
      setError("No se pudo iniciar sesión.");
    }
  }

  return (
    <main className="relative grid min-h-screen bg-neutral-bg lg:grid-cols-[minmax(400px,500px)_1fr] overflow-hidden">
      {/* Left Column: Form */}
      <section className="relative z-10 grid place-items-center p-6 sm:p-10">
        <div className="w-full max-w-sm rounded-xl border border-neutral-border bg-neutral-surface p-8 shadow-xl">
          <div className="mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner shadow-primary/20">
              <UserRound aria-hidden="true" size={24} />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-text-primary">
              Iniciar Sesión
            </h1>
            <p className="mt-2 text-sm text-neutral-text-secondary">
              POS Retail VRNTAS
            </p>
          </div>

          <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-1">
              <Input
                autoComplete="username"
                label="Usuario de Acceso"
                name="username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
                value={username}
              />
            </div>
            <div className="space-y-1">
              <Input
                autoComplete="current-password"
                label="Contraseña"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                type="password"
                value={password}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-semibold text-danger" role="alert">
                {error}
              </div>
            ) : null}

            <Button
              disabled={isLoading || !username.trim() || !password}
              icon={<LogIn aria-hidden="true" size={16} />}
              type="submit"
              variant="primary"
            >
              {isLoading ? "Validando..." : "Entrar al Sistema"}
            </Button>
          </form>
        </div>
      </section>

      {/* Right Column */}
      <section className="relative hidden border-l border-neutral-border bg-neutral-surface-raised p-12 lg:grid lg:content-center overflow-hidden">
        <div className="relative z-10 max-w-xl space-y-8">
          <div>
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-surface border border-neutral-border text-primary shadow-md">
              <KeyRound aria-hidden="true" size={30} />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              Acceso a Caja Local
            </span>
            <h2 className="mt-4 text-5xl font-extrabold tracking-tight text-neutral-text-primary">
              Sistema POS <span className="text-primary">VRNTAS</span>
            </h2>
            <p className="mt-3 text-sm text-neutral-text-secondary leading-relaxed max-w-md">
              Gestión de ventas, inventario y compras en una sola herramienta. Opera en red local sin depender de internet.
            </p>
          </div>

          <ul className="space-y-3 mt-6">
            {[
              "Opera 100% en red local, sin internet requerido",
              "Inventario en tiempo real durante cada venta",
              "Corte de caja con conteo por denominaciones",
            ].map((feature) => (
              <li className="flex items-start gap-2.5 text-sm text-neutral-text-secondary" key={feature}>
                <span aria-hidden="true" className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
