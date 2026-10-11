import axios from "axios";
import type { AxiosRequestConfig } from "axios";

const ACCESS_TOKEN_KEY = "pos_access_token";
const REFRESH_TOKEN_KEY = "pos_refresh_token";

/** Sin timeout, un servidor colgado deja la venta "Procesando..." para siempre (H-24). */
export const API_TIMEOUT_MS = 15000;

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

export function getStoredAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setStoredTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function setStoredAccessToken(accessToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearStoredTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredRefreshToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── JWT auto-refresh with request queue ──────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Contraseña temporal: el backend exige cambiarla antes de cualquier otra acción (FE-101)
    if (error.response?.status === 403 && error.response.data?.code === "password_change_required") {
      window.dispatchEvent(new Event("auth:password-change-required"));
      return Promise.reject(error);
    }

    // flask-jwt-extended responde 422 {"msg": ...} ante un token mal formado o con firma inválida;
    // no confundir con el 422 de validación ({"error": "Datos inválidos", "details": ...})
    if (error.response?.status === 422 && typeof error.response.data?.msg === "string" && !error.response.data?.error) {
      window.dispatchEvent(new Event("auth:expired"));
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest._retry
    ) {
      // If another refresh is already in progress, queue this request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        isRefreshing = false;
        window.dispatchEvent(new Event("auth:expired"));
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<{ access_token: string }>(
          `${apiClient.defaults.baseURL}/auth/refresh`,
          undefined,
          { headers: { Authorization: `Bearer ${refreshToken}` }, timeout: API_TIMEOUT_MS },
        );

        setStoredAccessToken(data.access_token);
        processQueue(null, data.access_token);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Solo se cierra la sesión si el servidor rechazó el refresh; un error de red no la invalida.
        if (axios.isAxiosError(refreshError) && refreshError.response) {
          window.dispatchEvent(new Event("auth:expired"));
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
