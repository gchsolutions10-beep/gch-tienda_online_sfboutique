"use client";

import Link from "next/link";
import { useState } from "react";
import { useBag, openBag } from "@/components/store/bag-store";
import { SearchBox } from "@/components/store/search-box";
import { TenantLogo } from "@/components/tenant-logo";
import { cn } from "@/components/ui/styles";

type Category = { name: string; slug: string };

const navLink = "text-sm font-medium hover:text-brand-strong";
const menuLink = "block rounded-xl px-3 py-2 text-sm font-medium hover:bg-store-soft";

/** Cabecera de la boutique: logo, categorías, buscador con autocompletado y bolsa. */
/** Secciones que dependen de los módulos encendidos en Administración > Módulos. */
export type HeaderModules = { imports: boolean; credit: boolean };

export function SiteHeader({
  name,
  logoUrl,
  categories,
  rateLabel,
  modules,
}: {
  name: string;
  logoUrl: string | null;
  categories: Category[];
  rateLabel: string | null;
  modules: HeaderModules;
}) {
  const bag = useBag();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);

  return (
    <header className="sticky top-0 z-40">
      {rateLabel ? (
        <p className="bg-store-ink px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-on-store-ink">{rateLabel}</p>
      ) : null}
      <div className="border-b border-store-line bg-store-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[90rem] items-center gap-3 px-4 py-3 xl:gap-5">
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Menú" aria-expanded={menu} className="grid size-10 place-items-center rounded-full hover:bg-store-soft lg:hidden">
            {menu ? "✕" : "☰"}
          </button>
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${name}, inicio`}>
            {logoUrl ? <TenantLogo src={logoUrl} alt="" className="size-11" sizes="44px" preload /> : null}
            <span className="whitespace-nowrap font-display text-2xl font-semibold tracking-tight text-brand-strong">{name}</span>
          </Link>
          {/* Los nombres nunca se parten: se muestran las categorías que caben y el resto va en «Más». */}
          <nav aria-label="Categorías" className="ml-2 hidden min-w-0 items-center gap-4 whitespace-nowrap lg:flex xl:ml-4 xl:gap-5">
            <Link href="/catalogo?orden=nuevos" className={navLink}>
              Novedades
            </Link>
            {categories.slice(0, 6).map((c, i) => (
              <Link key={c.slug} href={`/catalogo?categoria=${c.slug}`} className={cn(navLink, i >= 4 ? "hidden 2xl:inline" : i >= 2 ? "hidden xl:inline" : null)}>
                {c.name}
              </Link>
            ))}
            {modules.imports ? (
              <Link href="/importaciones" className={cn(navLink, "hidden 2xl:inline")}>
                Importaciones
              </Link>
            ) : null}
            <details className="group relative">
              <summary className={cn(navLink, "flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden")}>
                Más <span aria-hidden className="text-xs transition group-open:rotate-180">▾</span>
              </summary>
              <div className="absolute left-0 top-full z-50 mt-3 w-60 rounded-2xl border border-store-line bg-store-card p-2 shadow-lg">
                {/* Las que ya se ven en la barra no se repiten aquí. */}
                {categories.map((c, i) =>
                  i < 2 ? null : (
                    <Link key={c.slug} href={`/catalogo?categoria=${c.slug}`} className={cn(menuLink, i < 4 ? "xl:hidden" : i < 6 ? "2xl:hidden" : null)}>
                      {c.name}
                    </Link>
                  ),
                )}
                <Link href="/blog" className={menuLink}>Blog y lookbook</Link>
                {modules.imports ? <Link href="/importaciones" className={cn(menuLink, "2xl:hidden")}>✈️ Importaciones por encargo</Link> : null}
                {modules.credit ? <Link href="/credito" className={menuLink}>🗓️ Credi-SF: compra a crédito</Link> : null}
              </div>
            </details>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <SearchBox className="hidden w-56 xl:block 2xl:w-64" />
            <button type="button" onClick={() => setSearch((v) => !v)} aria-label="Buscar" className="grid size-10 place-items-center rounded-full text-lg hover:bg-store-soft xl:hidden">
              ⌕
            </button>
            {modules.imports || modules.credit ? (
              <Link href="/mi-cuenta" aria-label="Mi cuenta" title="Mi cuenta" className="grid size-10 place-items-center rounded-full hover:bg-store-soft">
                <UserIcon />
              </Link>
            ) : null}
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
          {modules.imports ? (
            <Link href="/importaciones" onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-medium hover:bg-store-soft">
              ✈️ Importaciones por encargo
            </Link>
          ) : null}
          {modules.credit ? (
            <Link href="/credito" onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-medium hover:bg-store-soft">
              🗓️ Credi-SF: compra a crédito
            </Link>
          ) : null}
          {modules.imports || modules.credit ? (
            <Link href="/mi-cuenta" onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-medium hover:bg-store-soft">
              👤 Mi cuenta
            </Link>
          ) : null}
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
