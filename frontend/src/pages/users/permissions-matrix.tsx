import type { Role } from "../../api/users";
import { Card, EmptyState, Table, tableCellClass, tableHeadClass } from "../../components/ui";
import { cn } from "../../lib/cn";
import type { MatrixRow } from "./helpers";
import { roleLabel } from "./helpers";

type PermissionsMatrixProps = {
  highlightRoleId?: number | null;
  roles: Role[];
  rows: MatrixRow[];
};

/** Matriz de solo lectura: permisos concedidos / total del módulo para cada rol. */
export function PermissionsMatrix({ highlightRoleId, roles, rows }: PermissionsMatrixProps) {
  return (
    <Card className="overflow-hidden" frame>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider px-4 py-3.5">
        <h2 className="text-2xl">Permisos por rol</h2>
        <span className="text-sm text-ink-2">Permisos concedidos / total del módulo</span>
      </header>
      {rows.length === 0 ? (
        <EmptyState message="No hay permisos registrados." />
      ) : (
        <Table>
          <caption className="sr-only">Permisos concedidos por rol y módulo</caption>
          <thead>
            <tr>
              <th className={tableHeadClass} scope="col">Módulo</th>
              {roles.map((role) => (
                <th
                  className={cn(tableHeadClass, "text-center", role.id === highlightRoleId && "bg-acc-tint text-acc-text")}
                  key={role.id}
                  scope="col"
                >
                  {roleLabel(role.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.module}>
                <th className={cn(tableCellClass, "font-medium")} scope="row">{row.label}</th>
                {roles.map((role) => {
                  const cell = row.cells[role.id] ?? { granted: 0, total: row.total };
                  const full = cell.granted > 0 && cell.granted === cell.total;
                  const partial = cell.granted > 0 && !full;
                  return (
                    <td
                      className={cn(tableCellClass, "text-center", role.id === highlightRoleId && "bg-acc-tint")}
                      key={role.id}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-3 w-3 border",
                            cell.granted > 0 ? "border-accent" : "border-divider",
                            full && "bg-accent",
                            partial && "[background:linear-gradient(90deg,var(--color-accent)_50%,transparent_50%)]",
                          )}
                        />
                        <span className={cn("text-sm tabular-nums", cell.granted > 0 ? "text-text" : "text-ink-2")}>
                          {cell.granted > 0 ? `${cell.granted}/${cell.total}` : "—"}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
