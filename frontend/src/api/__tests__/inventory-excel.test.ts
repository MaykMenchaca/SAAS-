import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("../client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a), get: vi.fn() } }));

import { applyInventoryImport, previewInventoryImport } from "../inventory";

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: {} });
});

describe("importar inventario: el archivo viaja como multipart", () => {
  it("la vista previa envía el archivo en FormData con Content-Type multipart (no JSON)", async () => {
    const file = new File(["x"], "inventario.xlsx");
    await previewInventoryImport(file);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe("/inventory/import/preview");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("archivo")).toBe(file);
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
  });

  it("aplicar envía el archivo y el plan revisado", async () => {
    const file = new File(["x"], "inventario.xlsx");
    await applyInventoryImport(file, "abc123");
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe("/inventory/import/apply");
    expect((body as FormData).get("plan_hash")).toBe("abc123");
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
  });
});
