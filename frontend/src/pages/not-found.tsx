import { Home, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "../components/ui";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-bg p-6">
      <Card className="grid max-w-sm gap-4 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-neutral-bg text-primary">
          <SearchX aria-hidden="true" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-text-primary">Página no encontrada</h1>
          <p className="mt-1 text-sm text-neutral-text-secondary">La ruta solicitada no existe.</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          to="/"
        >
          <Home aria-hidden="true" size={18} />
          Volver
        </Link>
      </Card>
    </main>
  );
}
