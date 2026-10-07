import { create } from "zustand";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "pos_theme";
const DEFAULT_THEME: ThemeMode = "light";

function isTheme(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const stored = window.localStorage.getItem(THEME_KEY);
  if (isTheme(stored)) {
    return stored;
  }

  // Sin preferencia guardada: respetar el modo del SO.
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.dataset.theme = theme;
}

type ThemeState = {
  setTheme: (theme: ThemeMode) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStoredTheme(),

  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
}));
