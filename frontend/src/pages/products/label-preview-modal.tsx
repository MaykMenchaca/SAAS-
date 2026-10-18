import { useMutation, useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { previewProductLabel, printProductLabel } from "../../api/printing";
import { qk } from "../../api/query-keys";
import { Button, Modal } from "../../components/ui";

export function LabelPreviewModal({ productId, onClose }: { productId: number; onClose: () => void }) {
  const previewQuery = useQuery({
    queryKey: qk.labelPreview(productId),
    queryFn: () => previewProductLabel(productId),
  });

  const printMutation = useMutation({
    mutationFn: () => printProductLabel(productId),
  });

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cerrar
          </Button>
          <Button
            disabled={printMutation.isPending || previewQuery.isLoading}
            icon={<Printer aria-hidden="true" size={18} />}
            onClick={() => printMutation.mutate()}
          >
            {printMutation.isPending ? "Imprimiendo..." : "Imprimir"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Vista previa de etiqueta"
    >
      {previewQuery.isLoading ? (
        <div className="py-8 text-center text-sm text-ink-2">Generando vista previa...</div>
      ) : previewQuery.isError ? (
        <div className="border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
          No se pudo generar la vista previa.
        </div>
      ) : (
        <pre className="max-h-80 overflow-auto bg-line-soft p-4 [font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-xs leading-relaxed text-text">
          {previewQuery.data?.content ?? ""}
        </pre>
      )}
      {printMutation.isSuccess ? (
        <div className="mt-3 border border-ok bg-ok-tint px-3 py-2 text-sm font-medium text-ok">
          Etiqueta enviada a impresión.
        </div>
      ) : null}
      {printMutation.isError ? (
        <div className="mt-3 border border-bad bg-bad-tint px-3 py-2 text-sm font-medium text-bad" role="alert">
          Error al imprimir la etiqueta.
        </div>
      ) : null}
    </Modal>
  );
}
