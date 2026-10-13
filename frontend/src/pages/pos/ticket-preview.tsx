import { useMutation, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Printer } from "lucide-react";
import { useState } from "react";

import { previewSaleTicket, printResultMessage, printSaleTicket } from "../../api/printing";
import { qk } from "../../api/query-keys";
import { Button, Modal, Toast } from "../../components/ui";

/** Vista previa e impresión del ticket de una venta (F8). El ticket es texto ESC/POS de columnas fijas: va en monoespaciada. */
export function TicketPreviewModal({ onClose, saleId }: { onClose: () => void; saleId: number }) {
  const [printError, setPrintError] = useState("");
  const ticketQuery = useQuery({
    queryKey: qk.saleTicket(saleId),
    queryFn: () => previewSaleTicket(saleId),
  });

  const printMutation = useMutation({
    mutationFn: () => printSaleTicket(saleId),
    onMutate: () => setPrintError(""),
    onError: (error) => {
      if (error instanceof AxiosError) {
        setPrintError(error.response?.data?.error ?? "No se pudo imprimir el ticket.");
      } else {
        setPrintError("No se pudo imprimir el ticket.");
      }
    },
  });

  const message = printMutation.data?.sent ? printResultMessage(printMutation.data) : null;

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cerrar
          </Button>
          <Button
            disabled={ticketQuery.isLoading || printMutation.isPending}
            icon={<Printer aria-hidden="true" size={17} />}
            onClick={() => printMutation.mutate()}
          >
            {printMutation.isPending ? "Enviando…" : "Imprimir"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Ticket de venta"
    >
      <div className="grid gap-3">
        {ticketQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-ink-2">Cargando ticket…</p>
        ) : ticketQuery.error ? (
          <Toast className="text-bad" role="alert" tone="danger">
            No se pudo cargar el ticket.
          </Toast>
        ) : (
          <pre className="max-h-96 overflow-auto border border-divider bg-surface p-3 text-xs leading-relaxed text-text [font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]">
            {ticketQuery.data?.content}
          </pre>
        )}

        {message ? (
          <Toast tone={message.tone === "warning" ? "warning" : "success"}>{message.text}</Toast>
        ) : null}

        {printError ? (
          <Toast role="alert" tone="danger">
            {printError}
          </Toast>
        ) : null}
      </div>
    </Modal>
  );
}
