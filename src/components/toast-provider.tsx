"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastContextValue = { showToast: (message: string, tone?: "success" | "error") => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    if (timeout.current) clearTimeout(timeout.current);
    setToast({ message, tone });
    timeout.current = setTimeout(() => setToast(null), 3600);
  }, []);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);

  return <ToastContext.Provider value={{ showToast }}>{children}{toast && <div aria-live="polite" role="status" className={`fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${toast.tone === "success" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>{toast.tone === "success" ? "✓ " : "! "}{toast.message}</div>}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast deve ser usado dentro de ToastProvider.");
  return context;
}
