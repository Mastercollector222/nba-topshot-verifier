"use client";

/**
 * components/Toaster.tsx
 * ---------------------------------------------------------------------------
 * Tiny zero-dependency toast system.
 *
 * API:
 *   import { toast } from "@/components/Toaster";
 *   toast("Copied!", "success");
 *   toast("Something went wrong", "error");
 *   toast("New badge unlocked");  // defaults to "info"
 *
 *   // Or via hook (same underlying function):
 *   const { toast } = useToast();
 *
 * Mount <Toaster /> once in app/layout.tsx — it renders the fixed overlay.
 *
 * Internals:
 *   A module-level Set<listener> acts as a micro event-bus so toast() can be
 *   called from anywhere without a React context Provider.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

// ---------------------------------------------------------------------------
// Module-level event bus (no React context needed)
// ---------------------------------------------------------------------------

type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();
let nextId = 1;

/** Call from anywhere to show a toast. */
export function toast(message: string, kind: ToastKind = "info") {
  const item: ToastItem = { id: nextId++, message, kind };
  listeners.forEach((fn) => fn(item));
}

/** Hook alias — returns { toast } so components can destructure. */
export function useToast() {
  return { toast };
}

// ---------------------------------------------------------------------------
// Per-toast visual
// ---------------------------------------------------------------------------

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />,
  error: <XCircle className="h-4 w-4 shrink-0 text-red-400" />,
  info: <Info className="h-4 w-4 shrink-0 text-sky-400" />,
};

const RING: Record<ToastKind, string> = {
  success: "ring-emerald-500/30",
  error: "ring-red-500/30",
  info: "ring-sky-500/20",
};

function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  // Trigger slide-in on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss after 3.5 s.
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 3500);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => onDismiss(item.id)}
      className={
        "flex cursor-pointer items-center gap-2.5 rounded-full " +
        "bg-[oklch(0.14_0.01_265/0.92)] px-4 py-2.5 shadow-xl " +
        "ring-1 backdrop-blur-md " +
        RING[item.kind] +
        " transition-all duration-300 ease-out " +
        (visible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0")
      }
    >
      {ICONS[item.kind]}
      <span className="text-xs font-medium text-zinc-100">{item.message}</span>
      <X className="ml-1 h-3 w-3 shrink-0 text-zinc-500" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// <Toaster /> — mount once in layout.tsx
// ---------------------------------------------------------------------------

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler: Listener = (item) =>
      setItems((prev) => [...prev, item]);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <Toast item={item} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

export default Toaster;
