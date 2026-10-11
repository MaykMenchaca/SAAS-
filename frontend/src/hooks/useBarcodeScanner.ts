import { useEffect, useRef } from "react";

/**
 * Hook to listen for barcode scanner inputs globally.
 * Uses timing analysis to separate rapid physical scanner inputs from human typing,
 * allowing cashiers to scan barcodes from any page state without focusing the search box.
 */
export type BarcodeScannerOptions = {
  /** Máximo de ms entre teclas para considerarlas del lector (por defecto 50). */
  maxIntervalMs?: number;
  /** Longitud mínima del código (por defecto 3). */
  minLength?: number;
};

export function useBarcodeScanner(onScan: (barcode: string) => void, options: BarcodeScannerOptions = {}) {
  const maxIntervalMs = options.maxIntervalMs ?? 50;
  const minLength = options.minLength ?? 3;
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const isPrintable = e.key.length === 1;
      const isEnter = e.key === "Enter";
      const isBackspace = e.key === "Backspace";

      if (!isPrintable && !isEnter && !isBackspace) return;

      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true");

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Scanners input keys rapidly. If more than maxIntervalMs elapsed between keys, reset buffer
      if (bufferRef.current.length > 0 && timeDiff > maxIntervalMs) {
        bufferRef.current = "";
      }

      if (isEnter) {
        const barcode = bufferRef.current.trim();
        if (barcode.length >= minLength) {
          e.preventDefault();
          onScanRef.current(barcode);
        }
        bufferRef.current = "";
      } else if (isBackspace) {
        bufferRef.current = bufferRef.current.slice(0, -1);
      } else if (isPrintable) {
        // Intercept speed check if input has focus (do not hijack human typing)
        if (isInputFocused && timeDiff > maxIntervalMs - 5 && bufferRef.current.length > 0) {
          bufferRef.current = "";
          return;
        }
        // Ya es una ráfaga del lector (3.ª tecla rápida en adelante): que no se escriba en el campo con foco (H-41)
        if (bufferRef.current.length >= 2 && timeDiff <= maxIntervalMs) {
          e.preventDefault();
        }
        bufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [maxIntervalMs, minLength]);
}

