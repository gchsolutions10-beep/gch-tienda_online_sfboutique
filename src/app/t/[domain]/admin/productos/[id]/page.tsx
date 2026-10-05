import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { getCatalogOptions, getProductForEdit } from "@/server/queries/admin-products";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImages } from "@/components/admin/product-images";
import { card, cn } from "@/components/ui/styles";

export const metadata = { title: "Editar producto" };

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE: "Entrada",
  SALE: "Venta",
  RETURN: "Devolución",
  ADJUSTMENT: "Ajuste",
  DAMAGE: "Daño/pérdida",
  RESERVATION_RELEASE: "Liberado",
};

export default async function EditProductPage({ params }: PageProps<"/t/[domain]/admin/productos/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], `/admin/productos/${id}`);
  const [data, options] = await Promise.all([getProductForEdit(tenant.id, id), getCatalogOptions(tenant.id)]);
  if (!data) notFound();
  const usedColorIds = new Set(data.variants.map((v) => v.colorId));
  const fmt = (d: Date) => d.toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" });

  return (
    <>
      <Link href="/admin/productos" className="text-sm font-semibold text-muted hover:text-ink">
        ← Productos
      </Link>
      <PageHeader
        title={data.product.name}
        actions={
          <Link href={`/producto/${data.product.slug}`} target="_blank" className="text-sm font-semibold text-brand-strong underline">
            Ver en la tienda ↗
          </Link>
        }
      />
      <div className="space-y-6">
        <ProductImages productId={data.product.id} images={data.images} colors={options.colors.filter((c) => usedColorIds.has(c.id))} />
        <ProductForm product={data.product} variants={data.variants} {...options} />

        <section className={cn(card, "p-5")}>
          <h2 className="text-lg font-bold">Movimientos de stock</h2>
          {data.movements.length === 0 ? <p className="mt-2 text-sm text-muted">Sin movimientos todavía.</p> : null}
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                <span className={cn("w-12 font-bold", m.quantity > 0 ? "text-ok" : "text-danger")}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
                <span className="w-28 font-semibold">{MOVEMENT_LABEL[m.type] ?? m.type}</span>
                <span className="min-w-0 flex-1 text-muted">
                  {[m.variant.color?.name, m.variant.size && `Talla ${m.variant.size.label}`].filter(Boolean).join(" · ")} · quedan {m.stockAfter}
                  {m.order ? (
                    <>
                      {" · "}
                      <Link href={`/admin/pedidos/${m.order.id}`} className="underline">
                        pedido #{m.order.number}
                      </Link>
                    </>
                  ) : null}
                  {m.reason ? ` · ${m.reason}` : ""}
                </span>
                <span className="text-xs text-muted">
                  {fmt(m.createdAt)}
                  {m.user ? ` · ${m.user.name ?? m.user.email}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
