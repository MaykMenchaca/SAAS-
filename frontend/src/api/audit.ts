import { apiClient } from "./client";

// ── Types ──────────────────────────────────────────────────────────

export type AuditLog = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export type AuditLogResponse = {
  items: AuditLog[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
};

type ListAuditParams = {
  page?: number;
  perPage?: number;
  userId?: number;
  action?: string;
  entityType?: string;
  entityId?: number;
  from?: string;
  to?: string;
};

// ── API calls ─────────────────────────────────────────────────────

export async function listAuditLogs(params: ListAuditParams = {}) {
  const response = await apiClient.get<AuditLogResponse>("/audit/", {
    params: {
      page: params.page ?? 1,
      per_page: params.perPage ?? 50,
      user_id: params.userId || undefined,
      action: params.action || undefined,
      entity_type: params.entityType || undefined,
      entity_id: params.entityId || undefined,
      from: params.from || undefined,
      to: params.to || undefined,
    },
  });
  return response.data;
}
