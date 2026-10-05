"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBag, OPEN_BAG_EVENT } from "@/components/store/bag-store";
import { formatUsd, formatVes, usdToVesCents } from "@/lib/money";
import { whatsappLink } from "@/lib/ve-ids";
import { cn } from "@/components/ui/styles";

/**
 * Bolsa lateral: lleva al checkout, o termina el pedido por WhatsApp con el
 * detalle y los totales en USD y Bs.
 */
export function BagDrawer({ rate, whatsapp, storeName }: { rate: number | null; whatsapp: string | null; storeName: string }) {
  const bag = useBag();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(OPEN_BAG_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_BAG_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const message = [
    `¡Hola ${storeName}! Quiero hacer este pedido:`,
    ...bag.lines.map((l) => `• ${l.quantity} × ${l.name}${l.size ? ` · Talla ${l.size}` : ""}${l.color ? ` · ${l.color}` : ""} — ${formatUsd(l.priceCents * l.quantity)}`),
    `Total: ${formatUsd(bag.cents)}${rate ? ` (${formatVes(usdToVesCents(bag.cents, rate))} a la tasa de hoy)` : ""}`,
  ].join("\n");

  return (
    <div className={cn("fixed inset-0 z-50", !open && "pointer-events-none")} aria-hidden={!open}>
      <div onClick={() => setOpen(false)} className={cn("absolute inset-0 bg-black/40 transition-opacity", open ? "opacity-100" : "opacity-0")} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Tu bolsa"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-store-card text-store-ink shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-store-line px-5 py-4">
          <h2 className="font-display text-xl font-semibold">Tu bolsa ({bag.count})</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-10 place-items-center rounded-full hover:bg-store-soft">
            ✕
          </button>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-store-line overflow-y-auto px-5">
          {bag.lines.length === 0 ? (
            <li className="py-16 text-center text-sm text-store-muted">
              Tu bolsa está vacía.
              <br />
              <Link href="/catalogo" onClick={() => setOpen(false)} className="mt-3 inline-block font-semibold text-brand-strong underline">
                Ver la colección
              </Link>
            </li>
          ) : null}
          {bag.lines.map((l) => (
            <li key={l.variantId} className="flex gap-3 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
              {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-24 w-[4.5rem] shrink-0 rounded-lg object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <Link href={`/producto/${l.slug}`} onClick={() => setOpen(false)} className="text-sm font-medium hover:underline">
                  {l.name}
                </Link>
                <p className="text-xs text-store-muted">{[l.size && `Talla ${l.size}`, l.color].filter(Boolean).join(" · ")}</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-full border border-store-line">
                    <button type="button" onClick={() => bag.setQty(l.variantId, l.quantity - 1)} aria-label={`Quitar uno de ${l.name}`} className="grid size-8 place-items-center">
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                    <button
                      type="button"
                      onClick={() => bag.setQty(l.variantId, l.quantity + 1)}
                      disabled={l.quantity >= l.max}
                      aria-label={`Agregar otro ${l.name}`}
                      className="grid size-8 place-items-center disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-display font-semibold">{formatUsd(l.priceCents * l.quantity)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {bag.lines.length ? (
          <div className="space-y-3 border-t border-store-line px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Subtotal</span>
              <span className="text-right">
                <span className="block font-display text-2xl font-semibold">{formatUsd(bag.cents)}</span>
                {rate ? <span className="text-xs text-store-muted">{formatVes(usdToVesCents(bag.cents, rate))}</span> : null}
              </span>
            </div>
            <p className="text-xs text-store-muted">El envío y el monto final en bolívares se calculan en el siguiente paso.</p>
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              className="block w-full rounded-full bg-brand px-4 py-3 text-center font-semibold text-on-brand hover:brightness-110"
            >
              Finalizar compra
            </Link>
            {whatsapp ? (
              <a
                href={whatsappLink(whatsapp, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-full border-2 border-store-ink px-4 py-2.5 text-center text-sm font-semibold hover:bg-store-ink hover:text-on-store-ink"
              >
                O pedir por WhatsApp
              </a>
            ) : null}
            <button type="button" onClick={bag.clear} className="w-full text-xs font-semibold text-store-muted hover:text-danger">
              Vaciar bolsa
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
