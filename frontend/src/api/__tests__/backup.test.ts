import { describe, expect, it } from "vitest";

import { isMaintenanceError, restoreConfirmation } from "../backup";

describe("backup api", () => {
  it("la confirmación es RESTAURAR + nombre exacto", () => {
    expect(restoreConfirmation("a.dump")).toBe("RESTAURAR a.dump");
  });

  it("un 503 con maintenance:true es mantenimiento (se trata como sin servidor)", () => {
    expect(isMaintenanceError({ response: { status: 503, data: { maintenance: true } } })).toBe(true);
  });

  it("otros errores no son mantenimiento", () => {
    expect(isMaintenanceError({ response: { status: 503, data: { error: "x" } } })).toBe(false);
    expect(isMaintenanceError({ response: { status: 500, data: { maintenance: true } } })).toBe(false);
    expect(isMaintenanceError({ response: { status: 400, data: {} } })).toBe(false);
    expect(isMaintenanceError(new Error("red"))).toBe(false);
    expect(isMaintenanceError(null)).toBe(false);
  });
});
