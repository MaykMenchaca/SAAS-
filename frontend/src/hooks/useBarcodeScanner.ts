import { useEffect, useRef } from "react";

/**
 * Hook to listen for barcode scanner inputs globally.
 * Uses timing analysis to separate rapid physical scanner inputs from human typing,
 * allowing cashiers to scan barcodes from any page state without focusing the search box.
 */
export function useBarcodeScanner(onScan: (barcode: string) => void) {
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

      // Scanners input keys rapidly. If >50ms elapsed between keys, reset buffer
      if (bufferRef.current.length > 0 && timeDiff > 50) {
        bufferRef.current = "";
      }

      if (isEnter) {
        const barcode = bufferRef.current.trim();
        if (barcode.length >= 3) {
          e.preventDefault();
          onScan(barcode);
        }
        bufferRef.current = "";
      } else if (isBackspace) {
        bufferRef.current = bufferRef.current.slice(0, -1);
      } else if (isPrintable) {
        // Intercept speed check if input has focus (do not hijack human typing)
        if (isInputFocused && timeDiff > 45 && bufferRef.current.length > 0) {
          bufferRef.current = "";
          return;
        }
        bufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onScan]);
}
