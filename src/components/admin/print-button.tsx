"use client";

import { buttonSecondary, cn } from "@/components/ui/styles";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={cn(buttonSecondary, "print:hidden")}>
      🖨️ Imprimir
    </button>
  );
}
