import { describe, expect, it } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";

import { isReachableHealthError, isServerUnavailable } from "../connectivity";

const http = (status: number, data: unknown = {}) =>
  new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, { status, data } as AxiosResponse);

describe("conectividad (RF-10)", () => {
  it("sin respuesta, 502, 503, 504 y mantenimiento: el servidor no procesó la petición", () => {
    expect(isServerUnavailable(new AxiosError("Network Error", "ERR_NETWORK"))).toBe(true);
    for (const status of [502, 503, 504]) expect(isServerUnavailable(http(status))).toBe(true);
  });

  it("4xx y 500 genérico: sí respondió el servidor", () => {
    for (const status of [400, 401, 404, 422, 500]) expect(isServerUnavailable(http(status))).toBe(false);
    expect(isServerUnavailable(new Error("otra cosa"))).toBe(false);
  });

  it("ping a /api/health: un 5xx (base caída, proxy sin backend) cuenta como sin servidor", () => {
    expect(isReachableHealthError(http(401))).toBe(true);
    expect(isReachableHealthError(http(500))).toBe(false);
    expect(isReachableHealthError(http(503))).toBe(false);
    expect(isReachableHealthError(new AxiosError("Network Error", "ERR_NETWORK"))).toBe(false);
  });
});
