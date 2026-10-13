import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Corners } from "../../components/ui";

/** Panel blueprint del dashboard: encabezado con título, enlace o nota, y contenido. */
export function Panel({
  children,
  link,
  note,
  title,
}: {
  children: ReactNode;
  link?: { label: string; to: string };
  note?: string;
  title: string;
}) {
  return (
    <section className="blueprint flex min-w-0 flex-col">
      <Corners />
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-divider px-4 py-3.5 sm:px-5">
        <h2 className="text-xl">{title}</h2>
        {link ? (
          <Link className="inline-flex items-center gap-1 text-sm font-medium text-acc-text hover:underline" to={link.to}>
            {link.label}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        ) : note ? (
          <span className="text-sm text-ink-2">{note}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}
