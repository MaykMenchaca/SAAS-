import type { FormEvent } from "react";
import { useState } from "react";
import { AxiosError } from "axios";
import { KeyRound, LogIn, UserRound } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../stores/auth-store";
import { Button, Card, Input } from "../components/ui";

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
  const redirectTo = state?.from?.pathname ?? "/";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      await login(username.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      if (caught instanceof AxiosError && caught.response?.status === 401) {
        setError("Usuario o contrasena incorrectos.");
        return;
      }
      setError("No se pudo iniciar sesion.");
    }
  }

  return (
    <main className="grid min-h-screen bg-neutral-bg lg:grid-cols-[minmax(360px,460px)_1fr]">
      <section className="grid place-items-center p-6">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-white">
              <UserRound aria-hidden="true" size={21} />
            </div>
            <h1 className="text-2xl font-bold text-neutral-text-primary">Iniciar sesion</h1>
            <p className="mt-1 text-sm text-neutral-text-secondary">POS Local</p>
          </div>

          <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <Input
              autoComplete="username"
              label="Usuario"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              value={username}
            />
            <Input
              autoComplete="current-password"
              label="Contrasena"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              type="password"
              value={password}
            />

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
                {error}
              </div>
            ) : null}

            <Button
              disabled={isLoading || !username.trim() || !password}
              icon={<LogIn aria-hidden="true" size={18} />}
              type="submit"
            >
              {isLoading ? "Validando" : "Entrar"}
            </Button>
          </form>
        </Card>
      </section>

      <section className="hidden border-l border-neutral-border bg-neutral-surface p-8 lg:grid lg:content-center">
        <div className="max-w-xl">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-neutral-bg text-primary">
            <KeyRound aria-hidden="true" size={28} />
          </div>
          <p className="text-sm font-semibold uppercase text-primary">Acceso de caja</p>
          <h2 className="mt-3 text-4xl font-bold text-neutral-text-primary">Sistema POS</h2>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-neutral-border p-4">
              <p className="text-2xl font-bold text-neutral-text-primary">LAN</p>
              <p className="text-xs text-neutral-text-secondary">Local</p>
            </div>
            <div className="rounded-lg border border-neutral-border p-4">
              <p className="text-2xl font-bold text-success">0</p>
              <p className="text-xs text-neutral-text-secondary">Alertas</p>
            </div>
            <div className="rounded-lg border border-neutral-border p-4">
              <p className="text-2xl font-bold text-warning">Caja</p>
              <p className="text-xs text-neutral-text-secondary">Cerrada</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
