import { apiClient } from "./client";

// ── Config Types ──────────────────────────────────────────────────

export type ConfigMap = Record<string, string>;

export async function getConfig() {
  const response = await apiClient.get<ConfigMap>("/config/");
  return response.data;
}

export async function updateConfig(data: ConfigMap) {
  const response = await apiClient.put<ConfigMap>("/config/", data);
  return response.data;
}

// ── Backup Types ──────────────────────────────────────────────────

export type BackupEntry = {
  filename: string;
  size: number;
  size_bytes: number;
  created_at: string;
  usb_copied?: boolean;
  usb_path?: string | null;
};

export async function listBackups() {
  const response = await apiClient.get<{ backups: BackupEntry[] }>("/backup/");
  return response.data.backups;
}

export async function createBackup() {
  const response = await apiClient.post<{ filename: string; size: number; created_at: string }>("/backup/");
  return response.data;
}

export async function deleteBackup(filename: string) {
  await apiClient.delete(`/backup/${filename}`);
}

export async function verifyBackup(filename: string) {
  const response = await apiClient.post<{
    filename: string;
    verified: boolean;
    entries: number;
    checked_at: string;
  }>(`/backup/${filename}/verify`);
  return response.data;
}
