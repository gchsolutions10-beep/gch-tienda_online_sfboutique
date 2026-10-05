"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { suggest } from "@/server/actions/store/search";
import { formatUsd } from "@/lib/money";
import { cn } from "@/components/ui/styles";

type Results = Awaited<ReturnType<typeof suggest>>;

/** Búsqueda en vivo con autocompletado; Enter abre el catálogo con los resultados. */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = await suggest(term);
      if (!cancelled) {
        setResults(r);
        setActive(-1);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const shown = q.trim().length >= 2 ? results : null;
  const items = shown ? [...shown.categories.map((c) => `/catalogo?categoria=${c.slug}`), ...shown.products.map((p) => `/producto/${p.slug}`)] : [];
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && items[active]) return go(items[active]);
          if (q.trim()) go(`/catalogo?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Buscar productos
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(items.length - 1, a + 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(-1, a - 1));
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Busca vestidos, jeans, sandalias…"
          role="combobox"
          aria-expanded={open && Boolean(shown)}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          className="w-full rounded-full border border-store-line bg-store-card py-2.5 pl-10 pr-4 text-sm text-store-ink outline-none placeholder:text-store-muted focus:border-brand"
        />
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-store-muted">
          ⌕
        </span>
      </form>

      {open && shown ? (
        <div id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-store-line bg-store-card text-store-ink shadow-2xl">
          {shown.categories.length === 0 && shown.products.length === 0 ? (
            <p className="px-4 py-3 text-sm text-store-muted">Sin resultados para «{q.trim()}».</p>
          ) : null}
          {shown.categories.map((c, i) => (
            <Link
              key={c.slug}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={active === i}
              href={`/catalogo?categoria=${c.slug}`}
              onClick={() => setOpen(false)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm", active === i ? "bg-store-soft" : "hover:bg-store-soft")}
            >
              <span className="text-store-muted">Categoría</span> <b>{c.name}</b>
            </Link>
          ))}
          {shown.products.map((p, j) => {
            const i = shown.categories.length + j;
            return (
              <Link
                key={p.slug}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={active === i}
                href={`/producto/${p.slug}`}
                onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 px-4 py-2", active === i ? "bg-store-soft" : "hover:bg-store-soft")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-12 w-9 rounded-md object-cover" /> : null}
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <span className="font-display text-sm font-semibold">{formatUsd(p.priceCents)}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => go(`/catalogo?q=${encodeURIComponent(q.trim())}`)} className="w-full border-t border-store-line px-4 py-2.5 text-left text-sm font-semibold text-brand-strong hover:bg-store-soft">
            Ver todos los resultados →
          </button>
        </div>
      ) : null}
    </div>
  );
}
