import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import type { AuditLog } from "../../api/audit";
import { listAuditLogs } from "../../api/audit";
import { qk } from "../../api/query-keys";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  Select,
  SkeletonTable,
  Table,
  tableCellClass,
  tableHeadClass,
  tableRowClass,
} from "../../components/ui";
import { ACTION_OPTIONS, ENTITY_OPTIONS, actionLabel, actionTone, entityLabel } from "./format";

export function AuditTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const auditQuery = useQuery({
    queryKey: qk.auditLogs(page, actionFilter, entityFilter),
    queryFn: () =>
      listAuditLogs({
        page,
        perPage: 30,
        action: actionFilter,
        entityType: entityFilter,
      }),
  });

  const logs = auditQuery.data?.items ?? [];
  const totalPages = auditQuery.data?.pages ?? 1;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          className="sm:w-48"
          label="Acción"
          name="action-filter"
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          options={ACTION_OPTIONS}
          placeholder="Todas"
          value={actionFilter}
        />
        <Select
          className="sm:w-48"
          label="Entidad"
          name="entity-filter"
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          options={ENTITY_OPTIONS}
          placeholder="Todas"
          value={entityFilter}
        />
      </div>

      {auditQuery.isLoading ? <SkeletonTable rows={8} cols={5} /> : null}
      {auditQuery.isError ? <ErrorState onRetry={() => void auditQuery.refetch()} /> : null}

      {auditQuery.isSuccess ? (
        <>
          <Card frame>
            {logs.length === 0 ? (
              <EmptyState
                icon={<ScrollText aria-hidden="true" size={32} />}
                message="Sin registros de auditoría."
              />
            ) : (
              <Table>
                <caption className="sr-only">Tabla de auditoría</caption>
                <thead>
                  <tr>
                    <th className={tableHeadClass}>Fecha</th>
                    <th className={tableHeadClass}>Usuario</th>
                    <th className={tableHeadClass}>Acción</th>
                    <th className={tableHeadClass}>Entidad</th>
                    <th className={tableHeadClass}>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: AuditLog) => (
                    <tr className={tableRowClass} key={log.id}>
                      <td className={`${tableCellClass} whitespace-nowrap text-xs tabular-nums text-ink-2`}>
                        {new Date(log.created_at).toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className={tableCellClass}>
                        <span className="font-medium">{log.username ?? "Sistema"}</span>
                        {log.ip_address ? <div className="font-mono text-xs text-ink-2">{log.ip_address}</div> : null}
                      </td>
                      <td className={tableCellClass}>
                        <Badge tone={actionTone(log.action)}>{actionLabel(log.action)}</Badge>
                      </td>
                      <td className={tableCellClass}>
                        <span className="text-sm">{entityLabel(log.entity_type)}</span>
                        {log.entity_id ? <span className="ml-1 font-mono text-xs text-ink-2">#{log.entity_id}</span> : null}
                      </td>
                      <td className={`${tableCellClass} max-w-48`}>
                        {log.details ? (
                          <span className="block truncate text-xs text-ink-2" title={JSON.stringify(log.details)}>
                            {JSON.stringify(log.details)}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-2">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
            <span>
              Página {auditQuery.data?.page ?? page} de {totalPages}
            </span>
            <Pagination onPageChange={setPage} page={page} totalPages={totalPages} />
          </div>
        </>
      ) : null}
    </div>
  );
}
