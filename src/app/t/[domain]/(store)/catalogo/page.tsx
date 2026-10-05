import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { getCatalog, getDisplayRate } from "@/server/queries/store";
import { parseFilters } from "@/lib/catalog";
import { CatalogFilters } from "@/components/store/catalog-filters";
import { ProductCard } from "@/components/store/product-card";
import { cn } from "@/components/ui/styles";

export async function generateMetadata({ searchParams }: PageProps<"/t/[domain]/catalogo">) {
  const sp = await searchParams;
  return { title: typeof sp.q === "string" ? `Resultados para «${sp.q}»` : "Catálogo" };
}

export default async function CatalogPage({ params, searchParams }: PageProps<"/t/[domain]/catalogo">) {
  const tenant = await getTenant((await params).domain);
  const sp = await searchParams;
  const rate = await getDisplayRate(tenant.id);
  const filters = parseFilters(sp, rate);
  const catalog = await getCatalog(tenant.id, filters);

  const query: Record<string, string[]> = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v : v ? [v] : []]),
  );
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, vs] of Object.entries(query)) if (k !== "pagina") for (const v of vs) q.append(k, v);
    if (n > 1) q.set("pagina", String(n));
    return `/catalogo?${q}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav aria-label="Ruta" className="text-xs text-store-muted">
        <Link href="/" className="hover:underline">
          Inicio
        </Link>{" "}
        / <span className="text-store-ink">{catalog.category?.name ?? (filters.q ? "Búsqueda" : "Catálogo")}</span>
      </nav>
      <h1 className="mt-2 font-display text-4xl font-semibold">
        {filters.q ? `«${filters.q}»` : (catalog.category?.name ?? (filters.sort === "nuevos" ? "Novedades" : "Toda la colección"))}
      </h1>

      <div className="mt-6">
        <CatalogFilters query={query} facets={catalog.facets} categories={catalog.categories} total={catalog.total} hasVesRate={Boolean(rate)}>
          {catalog.products.length === 0 ? (
            <div className="rounded-3xl bg-store-card p-12 text-center">
              <p className="font-display text-2xl">No encontramos productos con esos filtros</p>
              <Link href="/catalogo" className="mt-4 inline-block font-semibold text-brand-strong underline">
                Ver toda la colección
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
              {catalog.products.map((p, i) => (
                <ProductCard key={p.id} product={p} rate={rate} priority={i < 4} />
              ))}
            </div>
          )}
          {catalog.pages > 1 ? (
            <nav aria-label="Páginas" className="mt-10 flex justify-center gap-1">
              {Array.from({ length: catalog.pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={pageHref(n)}
                  aria-current={n === catalog.page ? "page" : undefined}
                  className={cn("grid size-10 place-items-center rounded-full text-sm font-semibold", n === catalog.page ? "bg-store-ink text-on-store-ink" : "hover:bg-store-soft")}
                >
                  {n}
                </Link>
              ))}
            </nav>
          ) : null}
        </CatalogFilters>
      </div>
    </div>
  );
}
