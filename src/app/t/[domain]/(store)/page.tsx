import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { getDisplayRate, getHome } from "@/server/queries/store";
import { ProductCard } from "@/components/store/product-card";

export default async function StoreHome({ params }: PageProps<"/t/[domain]">) {
  const tenant = await getTenant((await params).domain);
  const [home, rate] = await Promise.all([getHome(tenant.id), getDisplayRate(tenant.id)]);

  return (
    <>
      {/* Portada: tarjetas verticales grandes con foto (Moda Mujer, Calzado, Colección Nueva) */}
      <section aria-label="Colecciones" className="mx-auto max-w-7xl pt-6 md:px-4">
        {/* En el celular se deslizan de lado; en pantallas grandes, las tres juntas. */}
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {home.heroCards.map((c, i) => (
            <Link
              key={c.id}
              href={c.linkUrl}
              className="group relative block w-[78%] shrink-0 snap-center overflow-hidden rounded-3xl bg-store-soft md:w-auto"
            >
              <div className="relative aspect-[3/4] md:aspect-[4/5]">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto de portada del negocio
                  <img src={c.imageUrl} alt="" loading={i === 0 ? "eager" : "lazy"} className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-105" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  {c.subtitle ? <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-90">{c.subtitle}</p> : null}
                  <h2 className="mt-1 font-display text-3xl font-semibold">{c.title}</h2>
                  <span className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition group-hover:bg-brand group-hover:text-on-brand">
                    Ver ahora →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Promociones del momento: cada banner sale solo entre sus fechas */}
      {home.banners.some((b) => b.imageUrl) ? (
        <section aria-label="Promociones" className="mx-auto max-w-7xl pt-6 md:px-4">
          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 md:px-0">
            {home.banners
              .filter((b) => b.imageUrl)
              .map((b, i, list) => {
                const image = (
                  // eslint-disable-next-line @next/next/no-img-element -- banner del negocio
                  <img src={b.imageUrl} alt={b.title} loading={i === 0 ? "eager" : "lazy"} className="aspect-[16/7] size-full object-cover sm:aspect-[16/5]" />
                );
                return (
                  <div key={b.id} className={`shrink-0 snap-center overflow-hidden rounded-3xl bg-store-soft ${list.length > 1 ? "w-[88%] md:w-[80%]" : "w-full"}`}>
                    {b.linkUrl ? (
                      <Link href={b.linkUrl} className="block">
                        {image}
                      </Link>
                    ) : (
                      image
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ) : null}

      {/* Categorías en círculos */}
      <nav aria-label="Categorías" className="mx-auto max-w-7xl px-4 pt-10">
        <ul className="no-scrollbar flex gap-5 overflow-x-auto pb-2 sm:justify-center">
          {home.categories.map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/catalogo?categoria=${c.slug}`} className="group flex w-24 flex-col items-center text-center">
                <span className="block size-20 overflow-hidden rounded-full bg-store-soft ring-2 ring-transparent transition group-hover:ring-brand sm:size-24">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto de la categoría
                    <img src={c.imageUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="mt-2 text-xs font-semibold">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ProductRow title="Recién llegado" subtitle="Lo último de la tienda" href="/catalogo?orden=nuevos" products={home.newest} rate={rate} />
      <ProductRow title="Favoritos de la boutique" subtitle="Los que más nos piden" href="/catalogo" products={home.featured} rate={rate} />

      {/* Ventajas */}
      <section aria-label="Por qué comprar aquí" className="mx-auto mt-14 max-w-7xl px-4">
        <ul className="grid gap-4 rounded-3xl bg-store-card p-6 text-sm shadow-sm sm:grid-cols-3">
          {[
            ["🚚", "Envíos a toda Venezuela", "MRW, Zoom, Tealca o delivery en la ciudad"],
            ["💳", "Paga como prefieras", "Pago Móvil, Zelle, USDT, efectivo o punto"],
            ["💬", "Atención por WhatsApp", "Te asesoramos con tu talla y tu look"],
          ].map(([icon, title, text]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden className="text-2xl">
                {icon}
              </span>
              <span>
                <b className="block">{title}</b>
                <span className="text-store-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {home.posts.length ? (
        <section aria-labelledby="blog-title" className="mx-auto mt-14 max-w-7xl px-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Lookbook</p>
              <h2 id="blog-title" className="font-display text-3xl font-semibold">Tendencias y outfits</h2>
            </div>
            <Link href="/blog" className="text-sm font-semibold text-brand-strong hover:underline">
              Ver el blog →
            </Link>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {home.posts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-store-soft">
                  {p.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- portada del artículo
                    <img src={p.coverImageUrl} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : null}
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">{p.category?.name ?? "Blog"}</p>
                <h3 className="font-display text-xl font-semibold group-hover:underline">{p.title}</h3>
                {p.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-store-muted">{p.excerpt}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ProductRow({
  title,
  subtitle,
  href,
  products,
  rate,
}: {
  title: string;
  subtitle: string;
  href: string;
  products: Awaited<ReturnType<typeof getHome>>["newest"];
  rate: number | null;
}) {
  if (!products.length) return null;
  return (
    <section aria-label={title} className="mx-auto mt-14 max-w-7xl px-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">{subtitle}</p>
          <h2 className="font-display text-3xl font-semibold">{title}</h2>
        </div>
        <Link href={href} className="text-sm font-semibold text-brand-strong hover:underline">
          Ver todo →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} rate={rate} priority={i < 4} />
        ))}
      </div>
    </section>
  );
}
