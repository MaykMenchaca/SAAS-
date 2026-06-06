import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "./button";

type ModalProps = {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Modal({ children, footer, onClose, open, title }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-text-primary/40 p-4">
      <section className="w-full max-w-lg rounded-lg border border-neutral-border bg-neutral-surface">
        <header className="flex min-h-14 items-center justify-between border-b border-neutral-border px-4">
          <h2 className="text-base font-semibold text-neutral-text-primary">{title}</h2>
          <Button aria-label="Cerrar" className="h-11 w-11 px-0" onClick={onClose} variant="ghost">
            <X aria-hidden="true" size={18} />
          </Button>
        </header>
        <div className="p-4">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-neutral-border p-4">{footer}</footer> : null}
      </section>
    </div>
  );
}
