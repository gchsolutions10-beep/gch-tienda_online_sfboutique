"use client";

import { useState } from "react";
import { findVariant, isAvailable, type ProductCardData } from "@/lib/catalog";
import { useBag, openBag } from "@/components/store/bag-store";
import { Badges } from "@/components/store/product-card";
import { Price } from "@/components/store/price";
import { whatsappLink } from "@/lib/ve-ids";
import { cn } from "@/components/ui/styles";

/** Ficha de producto: galería por color, talla, cantidad y agregar a la bolsa. */
export function ProductDetail({
  product: p,
  rate,
  initialColor,
  description,
  details,
  whatsapp,
  lowStockThreshold,
}: {
  product: ProductCardData;
  rate: number | null;
  initialColor: string | null;
  description: string | null;
  details: string | null;
  whatsapp: string | null;
  lowStockThreshold: number;
}) {
  const start = p.colors.find((c) => c.name === initialColor) ?? p.colors.find((c) => isAvailable(p.variants, null, c.id)) ?? p.colors[0] ?? null;
  const [colorId, setColorId] = useState<string | null>(start?.id ?? null);
  const [sizeId, setSizeId] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0].id : null);
  const [shown, setShown] = useState(0);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const bag = useBag();

  // Fotos del color elegido; si ese color no tiene fotos propias, todas.
  const own = p.images.filter((i) => i.colorId === colorId);
  const images = own.length ? own : p.images;
  const color = p.colors.find((c) => c.id === colorId) ?? null;
  const size = p.sizes.find((s) => s.id === sizeId) ?? null;
  const variant = findVariant(p.variants, sizeId, colorId);
  const left = variant?.available ?? 0;

  function add() {
    if (!variant || left <= 0) {
      setMessage(p.sizes.length && !sizeId ? "Elige tu talla" : "Esa combinación está agotada");
      return;
    }
    bag.add({ variantId: variant.id, slug: p.slug, name: p.name, imageUrl: images[0]?.url ?? null, size: size?.label ?? null, color: color?.name ?? null, priceCents: variant.priceCents, max: left }, qty);
    setMessage(null);
    openBag();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
      {/* Galería */}
      <div className="grid gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
        <div className="no-scrollbar order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setShown(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={shown === i}
              className={cn("h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-xl border-2", shown === i ? "border-store-ink" : "border-transparent opacity-80 hover:opacity-100")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
              <img src={img.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
        <div className="relative order-1 overflow-hidden rounded-3xl bg-store-soft sm:order-2">
          <div className="aspect-[3/4]">
            {images[shown] ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto del producto
              <img src={images[shown].url} alt={images[shown].alt ?? p.name} className="size-full object-cover" />
            ) : null}
          </div>
          <Badges badges={p.badges} className="absolute left-4 top-4" />
        </div>
      </div>

      {/* Información */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">{p.category}</p>
        <h1 className="mt-1 font-display text-4xl font-semibold leading-tight">{p.name}</h1>
        <Price cents={variant?.priceCents ?? p.priceCents} compareAtCents={p.compareAtCents} rate={rate} size="lg" className="mt-4" />
        {rate ? <p className="mt-1 text-xs text-store-muted">Monto en bolívares a la tasa del día; se confirma al pagar.</p> : null}

        {p.colors.length ? (
          <div className="mt-6">
            <p className="text-sm">
              Color: <b>{color?.name}</b>
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
              {p.colors.map((c) => {
                const any = isAvailable(p.variants, null, c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={colorId === c.id}
                    aria-label={`${c.name}${any ? "" : " (agotado)"}`}
                    title={c.name}
                    onClick={() => {
                      setColorId(c.id);
                      setShown(0);
                      if (sizeId && !isAvailable(p.variants, sizeId, c.id)) setSizeId(null);
                    }}
                    className={cn("size-9 rounded-full border border-black/10", colorId === c.id ? "ring-2 ring-store-ink ring-offset-2 ring-offset-store" : "", !any && "opacity-40")}
                    style={{ background: c.hex }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {p.sizes.length > 1 || (p.sizes[0] && p.sizes[0].kind !== "ONE_SIZE") ? (
          <div className="mt-6">
            <p className="text-sm">
              Talla: <b>{size?.label ?? "elige una"}</b>
            </p>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-7" role="radiogroup" aria-label="Talla">
              {p.sizes.map((s) => {
                const ok = isAvailable(p.variants, s.id, colorId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={sizeId === s.id}
                    disabled={!ok}
                    onClick={() => {
                      setSizeId(s.id);
                      setQty(1);
                      setMessage(null);
                    }}
                    aria-label={`Talla ${s.label}${ok ? "" : " (agotada)"}`}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-semibold",
                      sizeId === s.id ? "border-store-ink bg-store-ink text-on-store-ink" : "border-store-line bg-store-card hover:border-store-ink/50",
                      !ok && "cursor-not-allowed text-store-muted line-through opacity-50",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {variant && left > 0 && left <= lowStockThreshold ? (
          <p className="mt-3 text-sm font-semibold text-accent">¡Solo {left === 1 ? "queda 1" : `quedan ${left}`} en esta talla y color!</p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <div className="flex items-center rounded-full border border-store-line bg-store-card">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos" className="grid size-12 place-items-center text-lg">
              −
            </button>
            <span className="w-8 text-center font-semibold" aria-live="polite">
              {qty}
            </span>
            <button type="button" onClick={() => setQty((q) => Math.min(Math.max(1, left), q + 1))} aria-label="Más" className="grid size-12 place-items-center text-lg">
              +
            </button>
          </div>
          <button type="button" onClick={add} disabled={p.totalAvailable <= 0} className="flex-1 rounded-full bg-brand px-6 font-semibold text-on-brand transition hover:brightness-110 disabled:opacity-50">
            {p.totalAvailable <= 0 ? "Agotado" : "Agregar a la bolsa"}
          </button>
        </div>
        {message ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-accent">
            {message}
          </p>
        ) : null}
        {whatsapp ? (
          <a
            href={whatsappLink(whatsapp, `¡Hola! Me interesa «${p.name}»${color ? ` en ${color.name}` : ""}${size ? `, talla ${size.label}` : ""}. ¿Está disponible?`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block rounded-full border border-store-line bg-store-card py-3 text-center text-sm font-semibold hover:border-store-ink/50"
          >
            💬 Preguntar por WhatsApp
          </a>
        ) : null}

        {description ? <p className="mt-8 leading-relaxed text-store-ink">{description}</p> : null}
        {details ? (
          <details className="mt-4 rounded-2xl bg-store-card p-4" open>
            <summary className="cursor-pointer font-semibold">Detalles y cuidados</summary>
            <p className="mt-2 text-sm text-store-muted">{details}</p>
          </details>
        ) : null}
        <ul className="mt-4 space-y-1.5 text-sm text-store-muted">
          <li>🚚 Envíos a toda Venezuela por encomienda o delivery en la ciudad</li>
          <li>💳 Pago Móvil, transferencia, Zelle, USDT, efectivo o punto de venta</li>
        </ul>
      </div>
    </div>
  );
}
