import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBarcodeScanner } from "../useBarcodeScanner";

describe("useBarcodeScanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function simulateKeyPress(key: string) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true });
    window.dispatchEvent(event);
  }

  it("calls onScan when rapid barcode characters followed by Enter are received", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    act(() => {
      // Simulate rapid scanner input (<50ms intervals)
      simulateKeyPress("7");
      vi.advanceTimersByTime(10);
      simulateKeyPress("5");
      vi.advanceTimersByTime(10);
      simulateKeyPress("0");
      vi.advanceTimersByTime(10);
      simulateKeyPress("1");
      vi.advanceTimersByTime(10);
      simulateKeyPress("2");
      vi.advanceTimersByTime(10);
      simulateKeyPress("Enter");
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("75012");
  });

  it("resets buffer and ignores slow human typing (>50ms apart)", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    act(() => {
      simulateKeyPress("7");
      vi.advanceTimersByTime(100); // Exceeds 50ms threshold
      simulateKeyPress("5");
      vi.advanceTimersByTime(100);
      simulateKeyPress("Enter");
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it("does not trigger onScan for barcodes shorter than 3 characters", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    act(() => {
      simulateKeyPress("1");
      vi.advanceTimersByTime(10);
      simulateKeyPress("2");
      vi.advanceTimersByTime(10);
      simulateKeyPress("Enter");
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it("supports updating onScan callback without missing scans (latest ref pattern)", () => {
    let callback = vi.fn();
    const { rerender } = renderHook(({ cb }) => useBarcodeScanner(cb), {
      initialProps: { cb: callback },
    });

    const newCallback = vi.fn();
    rerender({ cb: newCallback });

    act(() => {
      simulateKeyPress("9");
      vi.advanceTimersByTime(10);
      simulateKeyPress("8");
      vi.advanceTimersByTime(10);
      simulateKeyPress("7");
      vi.advanceTimersByTime(10);
      simulateKeyPress("Enter");
    });

    expect(callback).not.toHaveBeenCalled();
    expect(newCallback).toHaveBeenCalledWith("987");
  });
});
