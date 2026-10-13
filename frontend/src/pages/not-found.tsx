import { Home, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "../components/ui";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <Card className="grid w-full max-w-sm gap-4 p-6 text-center" frame>
        <div className="mx-auto grid h-12 w-12 place-items-center border border-divider bg-acc-tint text-acc-text">
          <SearchX aria-hidden="true" size={24} />
        </div>
        <div>
          <h1 className="text-3xl leading-none">Página no encontrada</h1>
          <p className="mt-2 text-sm text-ink-2">La ruta solicitada no existe.</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-accent bg-accent px-4 py-2 font-heading text-base font-semibold uppercase tracking-wide text-on-acc transition-colors hover:opacity-90"
          to="/"
        >
          <Home aria-hidden="true" size={18} />
          Volver
        </Link>
      </Card>
    </main>
  );
}
