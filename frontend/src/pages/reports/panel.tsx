import type { ReactNode } from "react";
import { Download } from "lucide-react";

import { Button, Card } from "../../components/ui";

/** Botón «Exportar CSV» del reporte activo; deshabilitado si no hay filas. */
export function ExportButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <Button disabled={disabled} icon={<Download aria-hidden="true" size={16} />} onClick={onClick} variant="secondary">
      Exportar CSV
    </Button>
  );
}

/** Panel con encabezado (título a la izquierda, dato o acción a la derecha) y contenido sin relleno. */
export function ReportPanel({ aside, children, title }: { aside?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <Card className="min-w-0 overflow-hidden" frame>
      {title || aside ? (
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider px-4 py-3.5">
          {title ? <h2 className="text-2xl">{title}</h2> : <span />}
          {aside}
        </header>
      ) : null}
      {children}
    </Card>
  );
}
