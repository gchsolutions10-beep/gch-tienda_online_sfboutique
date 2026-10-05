"use client";

import { useOptimistic, useTransition } from "react";
import { setProductActive } from "@/server/actions/admin/products";
import { cn } from "@/components/ui/styles";

/** Interruptor «Visible en la tienda» de la lista de productos. */
export function ProductActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [shown, setShown] = useOptimistic(active);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={shown ? "Visible en la tienda" : "Oculto en la tienda"}
      title={shown ? "Visible en la tienda" : "Oculto en la tienda"}
      onClick={() =>
        start(async () => {
          setShown(!shown);
          await setProductActive(id, !shown);
        })
      }
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition", shown ? "bg-ok" : "bg-line")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", shown ? "left-[1.375rem]" : "left-0.5")} />
    </button>
  );
}
