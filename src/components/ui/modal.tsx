"use client";

import { useEffect, useId, type ReactNode } from "react";
import { cn } from "@/components/ui/styles";

/** Ventana sobre la página (cierra con Esc o tocando fuera). */
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={cn("flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-2xl bg-paper text-ink shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={id} className="font-display text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
