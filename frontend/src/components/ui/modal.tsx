import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "./button";
import { Corners } from "./corners";
import { cn } from "../../lib/cn";

type ModalProps = {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: "md" | "lg" | "xl";
  title: string;
};

const sizeClasses = {
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({ children, footer, onClose, open, size = "md", title }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap + restore focus
  useEffect(() => {
    if (!open) return;

    // Save currently focused element to restore later
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus the panel itself (or first focusable element)
    const timer = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (first) first.focus();
      else panel.focus();
    });

    return () => {
      cancelAnimationFrame(timer);
      // Restore focus to the element that triggered the modal
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Tab trap inside the modal
  useEffect(() => {
    if (!open) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-overlay fade-in"
        onClick={onClose}
      />

      {/* Panel: objeto blueprint (borde fino + marcas "+") con la elevación más alta */}
      <section
        className={cn(
          "blueprint relative flex max-h-[90vh] w-full flex-col bg-bg text-text shadow-lg",
          "scale-in",
          sizeClasses[size],
        )}
        ref={panelRef}
        tabIndex={-1}
      >
        <Corners />
        <header className="flex shrink-0 min-h-14 items-center justify-between border-b border-divider px-5">
          <h2 className="text-2xl" id={titleId}>{title}</h2>
          <Button aria-label="Cerrar" className="h-11 w-11 px-0" onClick={onClose} variant="ghost">
            <X aria-hidden="true" size={18} />
          </Button>
        </header>
        <div className="min-h-0 overflow-x-hidden overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-divider p-4">{footer}</footer> : null}
      </section>
    </div>
  );
}
