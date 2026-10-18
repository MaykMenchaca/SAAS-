import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import { LogIn } from "lucide-react";
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

  useEffect(() => {
    document.title = "Iniciar Sesión · VRNTAS POS";
  }, []);

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  const state = location.state as LocationState | null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const trimmedUser = username.trim();
      if (!trimmedUser || !password) {
        setError("Ingresa tu usuario y contraseña para continuar.");
        return;
      }

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

  const beneficios = [
    "Opera 100% en red local, sin internet requerido",
    "Inventario en tiempo real durante cada venta",
    "Corte de caja con conteo por denominaciones",
  ];

  return (
    <main className="grid min-h-screen overflow-x-hidden bg-bg text-text lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,1fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-divider p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="grid h-10 w-10 place-items-center bg-accent font-heading text-2xl font-semibold text-on-acc">
            V
          </div>
          <span className="font-heading text-xl font-semibold">Ferretería</span>
        </div>

        <div className="grid max-w-[620px] gap-7">
          <p className="font-heading text-sm font-semibold uppercase tracking-[0.14em] text-acc-text">Acceso a caja local</p>
          <p aria-hidden="true" className="font-heading text-[7rem] font-semibold uppercase leading-[0.86] tracking-tight">
            VRNTAS
            <br />
            <span className="text-acc-text">POS</span>
          </p>
          <p className="max-w-md text-lg text-ink-2">
            Gestión de ventas, inventario y compras en una sola herramienta. Opera en red local sin depender de internet.
          </p>
          <ul className="grid grid-cols-3 border border-divider bg-bg">
            {beneficios.map((feature, index) => (
              <li className={`grid content-start gap-2 p-4 ${index > 0 ? "border-l border-divider" : ""}`} key={feature}>
                <span aria-hidden="true" className="font-heading text-3xl font-semibold leading-none text-acc-text">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2.5 text-sm text-ink-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok" />
          Sistema local, sin depender de internet
        </p>
      </section>

      <section className="grid place-items-center p-6 sm:p-12">
        <form className="grid w-full max-w-sm gap-5" onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <p className="mb-3 font-heading text-sm font-semibold uppercase tracking-[0.14em] text-acc-text lg:hidden">
              VRNTAS POS
            </p>
            <h1 className="text-4xl leading-none">Iniciar sesión</h1>
            <p className="mt-2 text-ink-2">Ingresa con tu usuario para abrir caja.</p>
          </div>

          <Input
            autoComplete="username"
            label="Usuario"
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Ingresa tu usuario"
            value={username}
          />
          <Input
            autoComplete="current-password"
            label="Contraseña"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            type="password"
            value={password}
          />

          {error ? (
            <div className="border border-bad bg-bad-tint px-3 py-2.5 text-sm text-bad" role="alert">
              {error}
            </div>
          ) : null}

          <Button
            className="mt-1"
            disabled={isLoading}
            frame
            icon={<LogIn aria-hidden="true" size={18} />}
            size="lg"
            type="submit"
            variant="primary"
          >
            {isLoading ? "Validando..." : "Entrar al sistema"}
          </Button>
          <p className="text-sm text-ink-2">
            ¿Olvidaste tu contraseña? Pide al administrador que la restablezca desde Usuarios.
          </p>
        </form>
      </section>
    </main>
  );
}
