import { create } from "zustand";

type ConnectionState = {
  /** El servidor respondió al último ping a /api/health (o a una petición de sincronización). */
  serverReachable: boolean;
  /** Hay una sincronización de la cola offline en curso. */
  syncing: boolean;
  setServerReachable: (reachable: boolean) => void;
  setSyncing: (syncing: boolean) => void;
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverReachable: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  setServerReachable: (serverReachable) => set({ serverReachable }),
  setSyncing: (syncing) => set({ syncing }),
}));
