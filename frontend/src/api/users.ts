import { apiClient } from "./client";
import type { PaginatedResponse } from "./products";

// ── Types ──────────────────────────────────────────────────────────

export type Role = {
  id: number;
  name: string;
  description: string | null;
};

export type User = {
  id: number;
  username: string;
  email: string | null;
  full_name: string;
  role: string;
  role_id: number;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type UserCreatePayload = {
  username: string;
  password: string;
  email?: string | null;
  full_name: string;
  role_id: number;
};

export type UserUpdatePayload = {
  email?: string | null;
  full_name?: string;
  role_id?: number;
  password?: string;
  is_active?: boolean;
};

// ── API calls ─────────────────────────────────────────────────────

type ListUsersParams = {
  page?: number;
  perPage?: number;
  search?: string;
  includeInactive?: boolean;
};

export async function listUsers({
  page = 1,
  perPage = 20,
  search = "",
  includeInactive = false,
}: ListUsersParams = {}) {
  const response = await apiClient.get<PaginatedResponse<User>>("/users/", {
    params: {
      page,
      per_page: perPage,
      search: search || undefined,
      include_inactive: includeInactive ? "true" : undefined,
    },
  });
  return response.data;
}

export async function createUser(payload: UserCreatePayload) {
  const response = await apiClient.post<User>("/users/", payload);
  return response.data;
}

export async function updateUser(userId: number, payload: UserUpdatePayload) {
  const response = await apiClient.patch<User>(`/users/${userId}`, payload);
  return response.data;
}

export async function deactivateUser(userId: number) {
  const response = await apiClient.delete<User>(`/users/${userId}`);
  return response.data;
}

export async function listRoles() {
  const response = await apiClient.get<Role[]>("/users/roles");
  return response.data;
}
