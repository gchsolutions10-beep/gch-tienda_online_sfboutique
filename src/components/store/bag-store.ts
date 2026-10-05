"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Bolsa de compras en el navegador (localStorage). Es solo una comodidad:
 * al pedir, el servidor vuelve a calcular precios, tasa y stock.
 */
export type BagLine = {
  variantId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  size: string | null;
  color: string | null;
  /** Precio mostrado (USD, centavos). El real lo calcula el servidor. */
  priceCents: number;
  quantity: number;
  /** Máximo disponible cuando se agregó */
  max: number;
};

const EMPTY: BagLine[] = [];
const listeners = new Set<() => void>();
let cache: BagLine[] | null = null;
const key = () => `gch-bag:v1:${window.location.host}`;

function read(): BagLine[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key()) ?? "null");
    cache = Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.variantId === "string" && l.quantity > 0) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache!;
}

function write(lines: BagLine[]) {
  cache = lines;
  try {
    if (lines.length) window.localStorage.setItem(key(), JSON.stringify(lines));
    else window.localStorage.removeItem(key());
  } catch {
    // sin almacenamiento: la bolsa vive solo durante la visita
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("gch-bag:")) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useBag() {
  const lines = useSyncExternalStore(subscribe, read, () => EMPTY);

  const add = useCallback((line: Omit<BagLine, "quantity">, quantity = 1) => {
    const current = read();
    const same = current.find((l) => l.variantId === line.variantId);
    write(
      same
        ? current.map((l) => (l === same ? { ...l, ...line, quantity: Math.min(line.max, l.quantity + quantity) } : l))
        : [...current, { ...line, quantity: Math.min(line.max, quantity) }],
    );
  }, []);
  const setQty = useCallback((variantId: string, quantity: number) => {
    write(quantity <= 0 ? read().filter((l) => l.variantId !== variantId) : read().map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(l.max, quantity) } : l)));
  }, []);
  const clear = useCallback(() => write([]), []);

  const totals = useMemo(
    () => ({ count: lines.reduce((a, l) => a + l.quantity, 0), cents: lines.reduce((a, l) => a + l.priceCents * l.quantity, 0) }),
    [lines],
  );
  return { lines, add, setQty, clear, ...totals };
}

/** Para abrir la bolsa desde cualquier botón (la escucha el panel lateral). */
export const OPEN_BAG_EVENT = "gch:open-bag";
export function openBag() {
  window.dispatchEvent(new Event(OPEN_BAG_EVENT));
}
