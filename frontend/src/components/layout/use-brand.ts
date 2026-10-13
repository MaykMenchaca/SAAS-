import { useQuery } from "@tanstack/react-query";

import { getBranding } from "../../api/config";
import { qk } from "../../api/query-keys";

/** Marca del local (nombre, lema, icono y color) con valores por defecto mientras carga. */
export function useBrand() {
  const query = useQuery({ queryKey: qk.branding(), queryFn: getBranding });
  const data = query.data;
  return {
    name: data?.company_name || "Ferretería",
    subtitle: data?.company_subtitle || "VRNTAS POS",
    iconKey: data?.company_logo_icon || "ShoppingCart",
    colorKey: data?.company_logo_color || "primary",
    /** Nombre real del local (sin el valor por defecto) para el título de la pestaña. */
    companyName: data?.company_name,
  };
}
