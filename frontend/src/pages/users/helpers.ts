import { AxiosError } from "axios";

import type { Permission, Role } from "../../api/users";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  cajero: "Cajero",
};

/** Nombre legible del rol; los roles personalizados se muestran con la primera letra en mayúscula. */
export function roleLabel(name: string): string {
  if (ROLE_LABELS[name]) return ROLE_LABELS[name];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

const MODULE_LABELS: Record<string, string> = {
  usuarios: "Usuarios",
  productos: "Productos",
  inventario: "Inventario",
  ventas: "Ventas",
  caja: "Caja",
  compras: "Compras",
  reportes: "Reportes",
  config: "Configuración",
  configuracion: "Configuración",
  auditoria: "Auditoría",
  respaldos: "Respaldos",
  respaldo: "Respaldos",
  devoluciones: "Devoluciones",
  impresion: "Impresión",
  impresoras: "Impresoras",
};

export function moduleLabel(module: string): string {
  if (MODULE_LABELS[module]) return MODULE_LABELS[module];
  return module ? module.charAt(0).toUpperCase() + module.slice(1) : module;
}

export type MatrixCell = { granted: number; total: number };
export type MatrixRow = { module: string; label: string; total: number; cells: Record<number, MatrixCell> };

/** Permisos concedidos sobre el total de cada módulo, por rol. */
export function buildPermissionMatrix(roles: Role[], catalog: Permission[]): MatrixRow[] {
  const totals = new Map<string, number>();
  for (const permission of catalog) {
    totals.set(permission.module, (totals.get(permission.module) ?? 0) + 1);
  }
  return [...totals.keys()]
    .sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), "es"))
    .map((module) => {
      const total = totals.get(module) ?? 0;
      const cells: Record<number, MatrixCell> = {};
      for (const role of roles) {
        const granted = (role.permissions ?? []).filter((p) => p.module === module).length;
        cells[role.id] = { granted: Math.min(granted, total), total };
      }
      return { module, label: moduleLabel(module), total, cells };
    });
}

export function formatLastLogin(value: string | null): string {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getErrorMessage(error: Error | null, fallback = "No se pudo guardar."): string {
  if (!error) return "";
  if (error instanceof AxiosError) {
    const details = error.response?.data?.details;
    if (details && typeof details === "object") {
      return Object.values(details).flat().join(" ");
    }
    return error.response?.data?.error ?? fallback;
  }
  return fallback;
}
