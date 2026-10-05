"use client";

import Link from "next/link";
import { useState } from "react";
import { findVariant, imagesForColor, isAvailable, type Badge, type ProductCardData } from "@/lib/catalog";
import { useBag, openBag } from "@/components/store/bag-store";
import { Price } from "@/components/store/price";
import { cn } from "@/components/ui/styles";

const BADGE_STYLE: Record<Badge["kind"], string> = {
  new: "bg-store-ink text-on-store-ink",
  sale: "bg-accent text-on-accent",
  custom: "bg-accent text-on-accent",
  "free-shipping": "bg-store-card text-store-ink ring-1 ring-store-line",
  low: "bg-amber-100 text-amber-900",
  "sold-out": "bg-store-card text-store-muted ring-1 ring-store-line",
};

export function Badges({ badges, className }: { badges: Badge[]; className?: string }) {
  return (
    <div className={cn("pointer-events-none flex flex-col items-start gap-1", className)}>
      {badges.map((b) => (
        <span key={b.label} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-sm", BADGE_STYLE[b.kind])}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Tarjeta de producto de moda: foto vertical 3:4 que cambia al pasar el
 * mouse, puntos de color, tallas rápidas, precio en USD y Bs, y etiquetas.
 */
export function ProductCard({ product: p, rate, priority }: { product: ProductCardData; rate: number | null; priority?: boolean }) {
  const firstColor = p.colors.find((c) => isAvailable(p.variants, null, c.id)) ?? p.colors[0] ?? null;
  const [colorId, setColorId] = useState<string | null>(firstColor?.id ?? null);
  const [sizeId, setSizeId] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0].id : null);
  const [added, setAdded] = useState(false);
  const [needSize, setNeedSize] = useState(false);
  const bag = useBag();

  const images = imagesForColor(p.images, colorId);
  const color = p.colors.find((c) => c.id === colorId) ?? null;
  const soldOut = p.totalAvailable <= 0;
  const href = `/producto/${p.slug}${color ? `?color=${encodeURIComponent(color.name)}` : ""}`;

  function add() {
    if (!sizeId && p.sizes.length) {
      setNeedSize(true);
      return;
    }
    const v = findVariant(p.variants, sizeId, colorId);
    if (!v || v.available <= 0) return;
    bag.add({
      variantId: v.id,
      slug: p.slug,
      name: p.name,
      imageUrl: images[0]?.url ?? null,
      size: p.sizes.find((s) => s.id === sizeId)?.label ?? null,
      color: color?.name ?? null,
      priceCents: v.priceCents,
      max: v.available,
    });
    setAdded(true);
    setNeedSize(false);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <article className="group flex h-full flex-col">
      <Link href={href} className="relative block overflow-hidden rounded-2xl bg-store-soft" aria-label={p.name}>
        <div className="relative aspect-[3/4]">
          {images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por el negocio
            <img
              src={images[0].url}
              alt={images[0].alt ?? p.name}
              loading={priority ? "eager" : "lazy"}
              className={cn("absolute inset-0 size-full object-cover transition duration-500", images[1] && "group-hover:opacity-0", soldOut && "grayscale")}
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center font-display text-5xl text-store-muted">{p.name.charAt(0)}</span>
          )}
          {images[1] ? (
            // eslint-disable-next-line @next/next/no-img-element -- segunda foto (al pasar el mouse)
            <img src={images[1].url} alt="" aria-hidden loading="lazy" className="absolute inset-0 size-full scale-105 object-cover opacity-0 transition duration-500 group-hover:scale-100 group-hover:opacity-100" />
          ) : null}
        </div>
        <Badges badges={p.badges} className="absolute left-3 top-3" />
      </Link>

      <div className="flex flex-1 flex-col pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-store-muted">{p.category}</p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-medium text-store-ink">
          <Link href={href} className="hover:underline">
            {p.name}
          </Link>
        </h3>
        <Price cents={p.priceCents} compareAtCents={p.compareAtCents} rate={rate} size="sm" className="mt-1.5" />

        {p.colors.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
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
                    if (sizeId && !isAvailable(p.variants, sizeId, c.id)) setSizeId(null);
                  }}
                  className={cn(
                    "relative size-6 rounded-full border border-black/10 transition",
                    colorId === c.id ? "ring-2 ring-store-ink ring-offset-2 ring-offset-store" : "hover:scale-110",
                    !any && "opacity-40",
                  )}
                  style={{ background: c.hex }}
                />
              );
            })}
          </div>
        ) : null}

        {p.sizes.length > 1 && !soldOut ? (
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Talla">
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
                    setNeedSize(false);
                  }}
                  aria-label={`Talla ${s.label}${ok ? "" : " (agotada)"}`}
                  className={cn(
                    "min-w-8 rounded-md border px-1.5 py-1 text-xs font-semibold transition",
                    sizeId === s.id ? "border-store-ink bg-store-ink text-on-store-ink" : "border-store-line bg-store-card text-store-ink hover:border-store-ink/50",
                    !ok && "cursor-not-allowed text-store-muted line-through opacity-50",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          {needSize ? <p className="mb-1 text-xs font-semibold text-accent">Elige tu talla</p> : null}
          <button
            type="button"
            onClick={added ? openBag : add}
            disabled={soldOut}
            className={cn(
              "w-full rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50",
              added ? "bg-ok text-white" : "bg-brand text-on-brand hover:brightness-110",
            )}
          >
            {soldOut ? "Agotado" : added ? "✓ En tu bolsa · ver" : "Agregar a la bolsa"}
          </button>
        </div>
      </div>
    </article>
  );
}
