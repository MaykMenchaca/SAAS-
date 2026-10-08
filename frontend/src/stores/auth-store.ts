import { create } from "zustand";

import type { AuthUser } from "../api/auth";
import { loginRequest, logoutRequest, meRequest, refreshRequest } from "../api/auth";
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredAccessToken,
  setStoredTokens,
} from "../api/client";
import { queryClient } from "../lib/query-client";
import { usePosStore } from "./pos-store";

const USER_KEY = "pos_auth_user";

type AuthState = {
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshToken: string | null;
  user: AuthUser | null;
  clearSession: () => void;
  loadCurrentUser: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

function readStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

function setStoredUser(user: AuthUser) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  window.localStorage.removeItem(USER_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: getStoredAccessToken(),
  isAuthenticated: Boolean(getStoredAccessToken()),
  isLoading: false,
  refreshToken: getStoredRefreshToken(),
  user: readStoredUser(),

  clearSession: () => {
    clearStoredTokens();
    clearStoredUser();
    queryClient.clear();
    usePosStore.getState().clearSession();
    set({
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      refreshToken: null,
      user: null,
    });
  },

  loadCurrentUser: async () => {
    if (!get().accessToken) {
      return;
    }

    set({ isLoading: true });
    try {
      const user = await meRequest();
      setStoredUser(user);
      set({ isAuthenticated: true, isLoading: false, user });
    } catch {
      get().clearSession();
    }
  },

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const session = await loginRequest(username, password);
      setStoredTokens(session.access_token, session.refresh_token);
      setStoredUser(session.user);
      set({
        accessToken: session.access_token,
        isAuthenticated: true,
        isLoading: false,
        refreshToken: session.refresh_token,
        user: session.user,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      if (get().accessToken) {
        await logoutRequest();
      }
    } finally {
      get().clearSession();
    }
  },

  refreshSession: async () => {
    const refreshToken = get().refreshToken;
    if (!refreshToken) {
      get().clearSession();
      return;
    }

    try {
      const response = await refreshRequest(refreshToken);
      const currentUser = get().user;
      setStoredAccessToken(response.access_token);
      set({
        accessToken: response.access_token,
        isAuthenticated: true,
        user: currentUser,
      });
    } catch {
      get().clearSession();
    }
  },
}));
