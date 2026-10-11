import { describe, expect, it } from "vitest";

import { saleStatusMeta } from "../sales";

describe("estado de venta (FE-106)", () => {
  it("una devolución no se muestra como cancelación", () => {
    expect(saleStatusMeta("devolucion_parcial")).toEqual({ label: "Devolución parcial", tone: "warning" });
    expect(saleStatusMeta("devolucion_total").label).toBe("Devuelta");
    expect(saleStatusMeta("cancelada")).toEqual({ label: "Cancelada", tone: "danger" });
  });

  it("un estado desconocido se muestra tal cual en tono neutro", () => {
    expect(saleStatusMeta("otro")).toEqual({ label: "otro", tone: "neutral" });
  });
});
