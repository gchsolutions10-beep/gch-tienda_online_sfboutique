"use client";

import Link from "next/link";
import { useState } from "react";
import { useBag, openBag } from "@/components/store/bag-store";
import { SearchBox } from "@/components/store/search-box";
import { TenantLogo } from "@/components/tenant-logo";
import { cn } from "@/components/ui/styles";

type Category = { name: string; slug: string };

/** Cabecera de la boutique: logo, categorías, buscador con autocompletado y bolsa. */
export function SiteHeader({ name, logoUrl, categories, rateLabel }: { name: string; logoUrl: string | null; categories: Category[]; rateLabel: string | null }) {
  const bag = useBag();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);

  return (
    <header className="sticky top-0 z-40">
      {rateLabel ? (
        <p className="bg-store-ink px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-on-store-ink">{rateLabel}</p>
      ) : null}
      <div className="border-b border-store-line bg-store-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Menú" aria-expanded={menu} className="grid size-10 place-items-center rounded-full hover:bg-store-soft lg:hidden">
            {menu ? "✕" : "☰"}
          </button>
          <Link href="/" className="flex items-center gap-2" aria-label={`${name}, inicio`}>
            {logoUrl ? <TenantLogo src={logoUrl} alt="" className="size-11" sizes="44px" preload /> : null}
            <span className="font-display text-2xl font-semibold tracking-tight text-brand-strong">{name}</span>
          </Link>
          <nav aria-label="Categorías" className="ml-6 hidden items-center gap-5 lg:flex">
            <Link href="/catalogo?orden=nuevos" className="text-sm font-medium hover:text-brand-strong">
              Novedades
            </Link>
            {categories.slice(0, 6).map((c) => (
              <Link key={c.slug} href={`/catalogo?categoria=${c.slug}`} className="text-sm font-medium hover:text-brand-strong">
                {c.name}
              </Link>
            ))}
            <Link href="/blog" className="text-sm font-medium hover:text-brand-strong">
              Blog
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <SearchBox className="hidden w-64 xl:block" />
            <button type="button" onClick={() => setSearch((v) => !v)} aria-label="Buscar" className="grid size-10 place-items-center rounded-full text-lg hover:bg-store-soft xl:hidden">
              ⌕
            </button>
            <Link href="/mi-cuenta" aria-label="Mi cuenta" title="Mi cuenta y Credi-SF" className="grid size-10 place-items-center rounded-full hover:bg-store-soft">
              <UserIcon />
            </Link>
            <button type="button" onClick={openBag} aria-label={`Bolsa: ${bag.count} productos`} className="relative grid size-10 place-items-center rounded-full hover:bg-store-soft">
              <BagIcon />
              {bag.count ? (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent">{bag.count}</span>
              ) : null}
            </button>
          </div>
        </div>
        {search ? (
          <div className="px-4 pb-3 xl:hidden">
            <SearchBox autoFocus />
          </div>
        ) : null}
        <nav aria-label="Categorías (celular)" className={cn("border-t border-store-line px-4 py-2 lg:hidden", !menu && "hidden")}>
          {[{ name: "Novedades", slug: "" }, ...categories].map((c) => (
            <Link
              key={c.slug || "nuevos"}
              href={c.slug ? `/catalogo?categoria=${c.slug}` : "/catalogo?orden=nuevos"}
              onClick={() => setMenu(false)}
              className="block rounded-xl px-3 py-2.5 font-medium hover:bg-store-soft"
            >
              {c.name}
            </Link>
          ))}
          <Link href="/blog" onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-medium hover:bg-store-soft">
            Blog
          </Link>
          <Link href="/credito" onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-medium hover:bg-store-soft">
            Credi-SF: compra a crédito
          </Link>
        </nav>
      </div>
    </header>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
