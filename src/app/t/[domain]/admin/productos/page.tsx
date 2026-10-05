import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getStoreSettings } from "@/server/queries/store";
import { PageHeader } from "@/components/admin/page-header";
import { ProductActiveToggle } from "@/components/admin/product-active-toggle";
import { buttonPrimary, buttonSecondary, card, cn, inputClass } from "@/components/ui/styles";
import { formatUsd, toCents } from "@/lib/money";

export const metadata = { title: "Productos y stock" };

const STOCK_FILTERS = [
  { key: "", label: "Todos" },
  { key: "bajo", label: "Stock bajo" },
  { key: "agotado", label: "Agotados" },
  { key: "ocultos", label: "Ocultos" },
] as const;

export default async function ProductsPage({ params, searchParams }: PageProps<"/t/[domain]/admin/productos">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN", "SELLER"], "/admin/productos");
  const canEdit = ctx.roles.some((r) => r === "SUPER_ADMIN" || r === "TENANT_ADMIN" || r === "BRANCH_ADMIN");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const cat = typeof sp.categoria === "string" ? sp.categoria : "";
  const filter = typeof sp.stock === "string" ? sp.stock : "";
  const tdb = tenantDb(tenant.id);
  const { lowStockThreshold } = await getStoreSettings(tenant.id);

  const where: Prisma.ProductWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] } : {}),
    ...(cat ? { categoryId: cat } : {}),
    ...(filter === "ocultos" ? { isActive: false } : {}),
  };
  const [categories, rows] = await Promise.all([
    tdb.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    tdb.product.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        name: true,
        slug: true,
        priceUsd: true,
        isActive: true,
        isFeatured: true,
        category: { select: { name: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        variants: { where: { isActive: true }, select: { stock: true, reserved: true, size: { select: { label: true } }, color: { select: { hex: true, name: true } } } },
      },
    }),
  ]);

  const products = rows
    .map((p) => {
      const stock = p.variants.reduce((a, v) => a + v.stock, 0);
      const reserved = p.variants.reduce((a, v) => a + v.reserved, 0);
      const out = p.variants.filter((v) => v.stock - v.reserved <= 0).length;
      const colors = [...new Map(p.variants.filter((v) => v.color).map((v) => [v.color!.name, v.color!])).values()];
      const sizes = [...new Set(p.variants.map((v) => v.size?.label).filter(Boolean))];
      return { ...p, stock, reserved, available: stock - reserved, out, colors, sizes };
    })
    .filter((p) => (filter === "agotado" ? p.available <= 0 : filter === "bajo" ? p.available > 0 && p.available <= lowStockThreshold : true));

  const totalUnits = products.reduce((a, p) => a + p.stock, 0);
  const href = (patch: Record<string, string>) => {
    const s = new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { categoria: cat } : {}), ...(filter ? { stock: filter } : {}), ...patch });
    for (const [k, v] of [...s]) if (!v) s.delete(k);
    return `/admin/productos${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Productos y stock"
        description={`${products.length} productos · ${totalUnits} unidades en tienda. El stock es por talla y color.`}
        actions={canEdit ? <Link href="/admin/productos/nuevo" className={buttonPrimary}>+ Nuevo producto</Link> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/admin/productos" className="flex flex-1 gap-2">
          {cat ? <input type="hidden" name="categoria" value={cat} /> : null}
          {filter ? <input type="hidden" name="stock" value={filter} /> : null}
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o SKU" className={cn(inputClass, "max-w-sm")} />
          <button className={buttonSecondary}>Buscar</button>
        </form>
        <nav aria-label="Filtro de stock" className="flex gap-1">
          {STOCK_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ stock: f.key })}
              aria-current={filter === f.key ? "page" : undefined}
              className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", filter === f.key ? "bg-ink text-white" : "bg-paper hover:bg-line")}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>
      <nav aria-label="Categorías" className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        <Link href={href({ categoria: "" })} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", !cat ? "bg-brand text-on-brand" : "bg-paper hover:bg-line")}>
          Todas
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={href({ categoria: c.id })}
            className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", cat === c.id ? "bg-brand text-on-brand" : "bg-paper hover:bg-line")}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <div className={cn(card, "overflow-hidden")}>
        {products.length === 0 ? <p className="p-10 text-center text-sm text-muted">No hay productos con ese filtro.</p> : null}
        <ul className="divide-y divide-line">
          {products.map((p) => (
            <li key={p.id} className={cn("flex items-center gap-3 px-4 py-3", !p.isActive && "opacity-60")}>
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura
                <img src={p.images[0].url} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="grid h-16 w-12 shrink-0 place-items-center rounded-md bg-cream text-xs text-muted">Sin foto</span>
              )}
              <div className="min-w-0 flex-1">
                <Link href={canEdit ? `/admin/productos/${p.id}` : `/producto/${p.slug}`} className="font-semibold hover:underline">
                  {p.name}
                </Link>
                {p.isFeatured ? <span className="ml-2 text-xs" title="Destacado">⭐</span> : null}
                <p className="text-xs text-muted">
                  {p.category.name} · {formatUsd(toCents(p.priceUsd))}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {p.colors.map((c) => (
                    <span key={c.name} title={c.name} className="size-3 rounded-full border border-black/15" style={{ background: c.hex }} />
                  ))}
                  {p.sizes.length ? <span>{p.sizes.join(" · ")}</span> : null}
                </p>
              </div>
              <div className="w-28 text-right text-sm">
                <p className={cn("font-bold", p.available <= 0 ? "text-danger" : p.available <= lowStockThreshold ? "text-amber-700" : "")}>
                  {p.available <= 0 ? "Agotado" : `${p.available} disp.`}
                </p>
                <p className="text-xs text-muted">
                  {p.stock} en tienda{p.reserved ? ` · ${p.reserved} apartadas` : ""}
                </p>
                {p.out > 0 && p.available > 0 ? <p className="text-xs text-amber-700">{p.out} variantes agotadas</p> : null}
              </div>
              {canEdit ? <ProductActiveToggle id={p.id} active={p.isActive} /> : null}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
