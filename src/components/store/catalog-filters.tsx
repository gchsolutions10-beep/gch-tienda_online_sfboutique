"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatUsd } from "@/lib/money";
import { cn } from "@/components/ui/styles";

type Query = Record<string, string[]>;
type Facets = {
  sizes: { label: string; kind: string }[];
  colors: { name: string; hex: string }[];
  minCents: number;
  maxCents: number;
};

const SORTS = [
  ["relevancia", "Destacados"],
  ["nuevos", "Más nuevos"],
  ["precio-asc", "Precio: menor a mayor"],
  ["precio-desc", "Precio: mayor a menor"],
] as const;

function toSearch(q: Query) {
  const sp = new URLSearchParams();
  for (const [k, vs] of Object.entries(q)) for (const v of vs) if (v) sp.append(k, v);
  return sp.toString();
}

/** Filtros facetados del catálogo: cambian la URL (se puede compartir y volver atrás). */
export function CatalogFilters({
  query,
  facets,
  categories,
  total,
  hasVesRate,
  children,
}: {
  children: React.ReactNode;
  query: Query;
  facets: Facets;
  categories: { name: string; slug: string; count: number }[];
  total: number;
  hasVesRate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState(query.moneda?.[0] === "bs" ? "bs" : "usd");
  const [min, setMin] = useState(query.min?.[0] ?? "");
  const [max, setMax] = useState(query.max?.[0] ?? "");

  const push = (next: Query) =>
    startTransition(() => {
      const { pagina: _page, ...rest } = next;
      void _page;
      router.replace(`/catalogo?${toSearch(rest)}`, { scroll: false });
    });
  const toggle = (key: string, value: string) => {
    const current = query[key] ?? [];
    push({ ...query, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
  };
  const set = (key: string, value: string | null) => push({ ...query, [key]: value ? [value] : [] });

  const active = [
    ...(query.talla ?? []).map((v) => ({ key: "talla", value: v, label: `Talla ${v}` })),
    ...(query.color ?? []).map((v) => ({ key: "color", value: v, label: v })),
    ...(query.disponible?.[0] ? [{ key: "disponible", value: "1", label: "Disponibles" }] : []),
    ...(query.min?.[0] || query.max?.[0]
      ? [{ key: "precio", value: "", label: `Precio ${query.min?.[0] || "0"}–${query.max?.[0] || "∞"} ${query.moneda?.[0] === "bs" ? "Bs" : "USD"}` }]
      : []),
  ];

  const panel = (
    <div className={cn("space-y-7 text-sm", pending && "opacity-60")}>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-store-muted">Categoría</h3>
        <ul className="space-y-1">
          <li>
            <button type="button" onClick={() => set("categoria", null)} className={cn("w-full rounded-lg px-2 py-1.5 text-left hover:bg-store-soft", !query.categoria?.[0] && "font-semibold text-brand-strong")}>
              Todo
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => set("categoria", c.slug)}
                className={cn("flex w-full justify-between rounded-lg px-2 py-1.5 text-left hover:bg-store-soft", query.categoria?.[0] === c.slug && "font-semibold text-brand-strong")}
              >
                {c.name} <span className="text-store-muted">{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {facets.sizes.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-store-muted">Talla</h3>
          <div className="flex flex-wrap gap-1.5">
            {facets.sizes.map((s) => {
              const on = query.talla?.includes(s.label);
              return (
                <button
                  key={s.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle("talla", s.label)}
                  className={cn("min-w-10 rounded-lg border px-2 py-1.5 text-xs font-semibold", on ? "border-store-ink bg-store-ink text-on-store-ink" : "border-store-line bg-store-card hover:border-store-ink/50")}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {facets.colors.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-store-muted">Color</h3>
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => {
              const on = query.color?.includes(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle("color", c.name)}
                  title={c.name}
                  className={cn("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs", on ? "border-store-ink bg-store-soft font-semibold" : "border-store-line bg-store-card hover:border-store-ink/50")}
                >
                  <span className="size-5 rounded-full border border-black/10" style={{ background: c.hex }} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-store-muted">Precio</h3>
        {hasVesRate ? (
          <div className="mb-2 inline-flex rounded-full border border-store-line p-0.5 text-xs" role="group" aria-label="Moneda del precio">
            {(["usd", "bs"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)} className={cn("rounded-full px-3 py-1 font-semibold", currency === c ? "bg-store-ink text-on-store-ink" : "")}>
                {c === "usd" ? "USD" : "Bs"}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            push({ ...query, min: min ? [min] : [], max: max ? [max] : [], moneda: currency === "bs" ? ["bs"] : [] });
          }}
        >
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="Mín" aria-label="Precio mínimo" className="w-full rounded-lg border border-store-line bg-store-card px-2 py-1.5" />
          <span>–</span>
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="Máx" aria-label="Precio máximo" className="w-full rounded-lg border border-store-line bg-store-card px-2 py-1.5" />
          <button className="rounded-lg bg-store-ink px-3 py-1.5 text-xs font-semibold text-on-store-ink">OK</button>
        </form>
        <p className="mt-1 text-xs text-store-muted">
          De {formatUsd(facets.minCents)} a {formatUsd(facets.maxCents)}
        </p>
      </section>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(query.disponible?.[0])} onChange={(e) => set("disponible", e.target.checked ? "1" : null)} className="size-4 accent-[var(--brand)]" />
        Solo disponibles
      </label>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
      <aside aria-label="Filtros" className="hidden lg:block">
        {panel}
      </aside>
      <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-store-line bg-store-card px-4 py-2 text-sm font-semibold lg:hidden">
          Filtrar {active.length ? `(${active.length})` : ""}
        </button>
        <p className="text-sm text-store-muted" aria-live="polite">
          {total} {total === 1 ? "producto" : "productos"}
        </p>
        {active.map((a) => (
          <button
            key={`${a.key}-${a.value}`}
            type="button"
            onClick={() => (a.key === "precio" ? push({ ...query, min: [], max: [], moneda: [] }) : toggle(a.key, a.value))}
            className="rounded-full bg-store-soft px-3 py-1 text-xs font-semibold"
          >
            {a.label} ✕
          </button>
        ))}
        {active.length ? (
          <Link href={`/catalogo${query.categoria?.[0] ? `?categoria=${query.categoria[0]}` : ""}`} className="text-xs font-semibold text-brand-strong underline">
            Limpiar
          </Link>
        ) : null}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-store-muted">Ordenar</span>
          <select value={query.orden?.[0] ?? "relevancia"} onChange={(e) => set("orden", e.target.value === "relevancia" ? null : e.target.value)} className="rounded-full border border-store-line bg-store-card px-3 py-1.5">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {children}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm overflow-y-auto bg-store-card p-5 text-store-ink">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Filtrar</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar filtros" className="grid size-10 place-items-center rounded-full hover:bg-store-soft">
                ✕
              </button>
            </div>
            {panel}
            <button type="button" onClick={() => setOpen(false)} className="mt-6 w-full rounded-full bg-brand py-3 font-semibold text-on-brand">
              Ver {total} productos
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
