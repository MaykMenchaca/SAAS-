import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { invalidateInventory } from "../../api/invalidate";
import type { ImportPreview, ImportPreviewRow, ImportRowState } from "../../api/inventory";
import { applyInventoryImport, previewInventoryImport } from "../../api/inventory";
import { Badge, Button, FilterChip, Modal, Toast } from "../../components/ui";

const STATE: Record<ImportRowState, { label: string; tone: "accent" | "warning" | "success" | "danger" }> = {
  nuevo: { label: "Nuevo", tone: "accent" },
  cambio: { label: "Cambia", tone: "warning" },
  igual: { label: "Sin cambios", tone: "success" },
  error: { label: "Error", tone: "danger" },
};

function errorText(error: unknown, fallback: string) {
  return error instanceof AxiosError ? (error.response?.data?.error ?? fallback) : fallback;
}

function RowDetail({ row }: { row: ImportPreviewRow }) {
  return (
    <li className="border-b border-line-soft px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATE[row.estado].tone}>{STATE[row.estado].label}</Badge>
        <span className="font-medium">{row.nombre ?? "—"}</span>
        <span className="text-sm text-ink-2">
          {row.sku || "sin SKU"} · fila {row.fila}
        </span>
      </div>
      {row.errores.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-sm text-bad">
          {row.errores.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      ) : null}
      {row.estado !== "error" && row.cambios.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-sm">
          {row.cambios.map((c) => (
            <li key={c.campo}>
              <span className="text-ink-2">{c.campo}:</span>{" "}
              {row.estado === "nuevo" ? (
                <strong>{c.despues}</strong>
              ) : (
                <>
                  <span className="text-ink-2 line-through">{c.antes}</span> → <strong>{c.despues}</strong>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Importar el inventario desde Excel: primero una vista previa clara, y solo sin errores se aplica (todo o nada). */
export function ExcelImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filter, setFilter] = useState<ImportRowState | "todos">("todos");
  const [error, setError] = useState("");

  const previewMutation = useMutation({
    mutationFn: (f: File) => previewInventoryImport(f),
    onMutate: () => {
      setError("");
      setPreview(null);
    },
    onSuccess: (data) => {
      setPreview(data);
      setFilter(data.resumen.errores ? "error" : data.resumen.cambios ? "cambio" : data.resumen.nuevos ? "nuevo" : "todos");
    },
    onError: (e) => setError(errorText(e, "No se pudo revisar el archivo.")),
  });

  const applyMutation = useMutation({
    mutationFn: () => applyInventoryImport(file as File, (preview as ImportPreview).plan_hash),
    onSuccess: async (data) => {
      await invalidateInventory(queryClient);
      const { nuevos, cambios } = data.resumen;
      toast.success(
        `Inventario actualizado: ${nuevos} producto${nuevos === 1 ? "" : "s"} nuevo${nuevos === 1 ? "" : "s"} y ${cambios} con cambios.`,
      );
      onClose();
    },
    onError: (e) => {
      // 409: el inventario cambió desde la vista previa; se vuelve a revisar con el mismo archivo
      if (e instanceof AxiosError && e.response?.status === 409 && file) {
        toast.warning(errorText(e, "El inventario cambió. Revisa la vista previa otra vez."));
        previewMutation.mutate(file);
        return;
      }
      setError(errorText(e, "No se pudo aplicar la importación."));
    },
  });

  function choose(f: File | null) {
    setFile(f);
    if (f) previewMutation.mutate(f);
  }

  const r = preview?.resumen;
  const aplicables = r ? r.nuevos + r.cambios : 0;
  const filas = preview?.filas.filter((f) => filter === "todos" || f.estado === filter) ?? [];

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={!preview || r!.errores > 0 || aplicables === 0 || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? "Aplicando…" : aplicables ? `Aplicar ${aplicables} cambio${aplicables === 1 ? "" : "s"}` : "Aplicar"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      size="wide"
      title="Importar inventario desde Excel"
    >
      <div className="grid gap-4">
        <p className="text-sm text-ink-2">
          Usa el archivo de «Exportar a Excel» como plantilla. Las existencias del Excel <strong>reemplazan</strong> a las
          del sistema (como un conteo físico). Nada se guarda hasta que pulses «Aplicar».
        </p>
        <label className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 font-medium">
            <FileSpreadsheet aria-hidden="true" size={18} /> Archivo de Excel (.xlsx)
          </span>
          <input
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Archivo de Excel"
            className="text-sm"
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            type="file"
          />
        </label>

        {previewMutation.isPending ? <p className="text-sm text-ink-2" role="status">Revisando el archivo…</p> : null}
        {error ? (
          <Toast tone="danger">
            <span role="alert">{error}</span>
          </Toast>
        ) : null}

        {preview && r ? (
          <>
            <div aria-label="Resumen de la importación" className="grid grid-cols-2 gap-px border border-divider bg-divider sm:grid-cols-4">
              {[
                ["Nuevos", r.nuevos, "text-acc-text"],
                ["Con cambios", r.cambios, "text-warn"],
                ["Sin cambios", r.sin_cambios, "text-ok"],
                ["Con errores", r.errores, "text-bad"],
              ].map(([label, n, tone]) => (
                <div className="bg-bg p-3" key={label as string}>
                  <div className="text-xs uppercase tracking-wide text-ink-2">{label}</div>
                  <div className={`font-heading text-3xl font-semibold tabular-nums ${tone}`}>{n}</div>
                </div>
              ))}
            </div>

            {r.errores > 0 ? (
              <Toast tone="danger">
                Hay {r.errores} fila{r.errores === 1 ? "" : "s"} con errores. Corrígelas en el Excel y vuelve a subirlo:
                no se aplicará nada mientras haya errores.
              </Toast>
            ) : aplicables === 0 ? (
              <Toast tone="success">El Excel coincide con el inventario: no hay nada que cambiar.</Toast>
            ) : null}
            {preview.categorias_nuevas.length > 0 ? (
              <p className="text-sm text-ink-2">Se crearán las categorías: {preview.categorias_nuevas.join(", ")}.</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {(["todos", "nuevo", "cambio", "igual", "error"] as const).map((k) => (
                <FilterChip
                  active={filter === k}
                  key={k}
                  label={k === "todos" ? `Todos (${r.filas})` : `${STATE[k].label} (${
                    { nuevo: r.nuevos, cambio: r.cambios, igual: r.sin_cambios, error: r.errores }[k]
                  })`}
                  onClick={() => setFilter(k)}
                />
              ))}
            </div>
            <ul aria-label="Filas del Excel" className="max-h-[45vh] overflow-y-auto border border-divider">
              {filas.length === 0 ? <li className="px-4 py-6 text-center text-sm text-ink-2">Sin filas en este grupo.</li> : null}
              {filas.map((row) => (
                <RowDetail key={`${row.fila}-${row.sku}`} row={row} />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
