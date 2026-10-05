import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { getDisplayRate, getProduct, getStoreSettings } from "@/server/queries/store";
import { ProductDetail } from "@/components/store/product-detail";
import { ProductCard } from "@/components/store/product-card";

export async function generateMetadata({ params }: PageProps<"/t/[domain]/producto/[slug]">) {
  const { domain, slug } = await params;
  const tenant = await getTenant(domain);
  const p = await getProduct(tenant.id, slug);
  if (!p) return { title: "Producto no encontrado" };
  return {
    title: p.seoTitle ?? p.card.name,
    description: p.seoDescription ?? p.description ?? undefined,
    openGraph: { images: p.card.images[0] ? [p.card.images[0].url] : [] },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/t/[domain]/producto/[slug]">) {
  const { domain, slug } = await params;
  const tenant = await getTenant(domain);
  const [product, rate, settings] = await Promise.all([getProduct(tenant.id, slug), getDisplayRate(tenant.id), getStoreSettings(tenant.id)]);
  if (!product) notFound();
  const color = (await searchParams).color;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav aria-label="Ruta" className="mb-6 text-xs text-store-muted">
        <Link href="/" className="hover:underline">
          Inicio
        </Link>{" "}
        /{" "}
        <Link href={`/catalogo?categoria=${product.categorySlug}`} className="hover:underline">
          {product.card.category}
        </Link>{" "}
        / <span className="text-store-ink">{product.card.name}</span>
      </nav>
      <ProductDetail
        product={product.card}
        rate={rate}
        initialColor={typeof color === "string" ? color : null}
        description={product.description}
        details={product.details}
        whatsapp={tenant.contactPhone}
        lowStockThreshold={settings.lowStockThreshold}
      />
      {product.related.length ? (
        <section aria-labelledby="related" className="mt-16">
          <h2 id="related" className="font-display text-3xl font-semibold">
            También te puede gustar
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {product.related.map((r) => (
              <ProductCard key={r.id} product={r} rate={rate} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
