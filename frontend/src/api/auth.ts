import { apiClient } from "./client";

export type AuthUser = {
  id: number;
  username: string;
  email?: string;
  full_name: string;
  role: string;
  permissions: string[];
  is_active?: boolean;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
};

export async function loginRequest(username: string, password: string) {
  const response = await apiClient.post<LoginResponse>("/auth/login", {
    username,
    password,
  });
  return response.data;
}

export async function meRequest() {
  const response = await apiClient.get<AuthUser>("/auth/me");
  return response.data;
}

export async function refreshRequest(refreshToken: string) {
  const response = await apiClient.post<{ access_token: string }>(
    "/auth/refresh",
    undefined,
    {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    },
  );
  return response.data;
}

export async function logoutRequest() {
  await apiClient.post("/auth/logout");
}
