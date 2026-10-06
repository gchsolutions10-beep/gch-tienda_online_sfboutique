import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getImportSettings } from "@/server/services/imports";
import { PageHeader } from "@/components/admin/page-header";
import { BatchForm, BatchStatusButtons, ImportSettingsForm, ProductToggle, ReviewButtons } from "@/components/admin/import-forms";
import { card, cn } from "@/components/ui/styles";
import { BATCH_STATUS, groupCount, requestStep } from "@/lib/imports";
import { formatUsd, toCents } from "@/lib/money";
import { caracasDay } from "@/lib/credit";

export const metadata = { title: "Importaciones" };

const REQUEST_STATUS = {
  PENDING_REVIEW: ["Por revisar", "bg-brand-soft text-brand-strong"],
  QUOTED: ["Cotizado · espera a la clienta", "bg-amber-100 text-amber-900"],
  ACCEPTED: ["Aceptado", "bg-emerald-100 text-emerald-900"],
  REJECTED: ["Rechazado", "bg-cream text-muted"],
  CANCELLED: ["Cancelado", "bg-cream text-muted"],
} as const;

const TABS = [
  ["bandeja", "Bandeja de encargos"],
  ["lotes", "Lotes"],
  ["galeria", "Galería"],
  ["resenas", "Reseñas"],
  ["configuracion", "Configuración"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Importaciones por encargo: bandeja con el cotizador, lotes, galería pública y reseñas. */
export default async function ImportsAdminPage({ params, searchParams }: PageProps<"/t/[domain]/admin/importaciones">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], "/admin/importaciones");
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.vista) ? (sp.vista as Tab) : "bandeja";
  const filter = sp.estado === "todos" ? "todos" : "abiertos";
  const tdb = tenantDb(tenant.id);
  const settings = await getImportSettings(tenant.id);
  const [pending, quoted, reviewsPending] = await Promise.all([
    tdb.importRequest.count({ where: { status: "PENDING_REVIEW" } }),
    tdb.importRequest.count({ where: { status: "QUOTED" } }),
    tdb.importReview.count({ where: { isApproved: false } }),
  ]);
  const fmt = (d: Date) => d.toLocaleDateString("es-VE", { day: "numeric", month: "short", timeZone: "America/Caracas" });

  return (
    <>
      <PageHeader title="Importaciones" description="Encargos de SHEIN, Alibaba y otras tiendas: cotizar, lotes, galería grupal y reseñas." />
      {!settings.enabled ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          Las importaciones están <b>apagadas</b>: la tienda no muestra la sección.{" "}
          {isTenantAdmin(ctx) ? (
            <Link href="/admin/modulos" className="font-semibold underline">
              Activarlas en Módulos
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Link href="/admin/importaciones" className={cn(card, "p-4 hover:border-brand", pending > 0 && "border-brand")}>
          <p className="text-xs font-semibold text-muted">Por revisar y cotizar</p>
          <p className="text-2xl font-bold">{pending}</p>
        </Link>
        <div className={cn(card, "p-4")}>
          <p className="text-xs font-semibold text-muted">Cotizados, esperando a la clienta</p>
          <p className="text-2xl font-bold">{quoted}</p>
        </div>
        <Link href="/admin/importaciones?vista=resenas" className={cn(card, "p-4 hover:border-brand")}>
          <p className="text-xs font-semibold text-muted">Reseñas por aprobar</p>
          <p className="text-2xl font-bold">{reviewsPending}</p>
        </Link>
      </div>

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Vistas">
        {TABS.filter(([k]) => k !== "configuracion" || isTenantAdmin(ctx)).map(([k, label]) => (
          <Link key={k} href={`/admin/importaciones?vista=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", tab === k ? "bg-ink text-white" : "bg-paper hover:bg-line")}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "bandeja" ? <Inbox tenantId={tenant.id} filter={filter} fmt={fmt} /> : null}
      {tab === "lotes" ? <Batches tenantId={tenant.id} fmt={fmt} /> : null}
      {tab === "galeria" ? <Gallery tenantId={tenant.id} /> : null}
      {tab === "resenas" ? <Reviews tenantId={tenant.id} fmt={fmt} /> : null}
      {tab === "configuracion" && isTenantAdmin(ctx) ? <ImportSettingsForm depositPct={settings.depositPct} commissionPct={settings.commissionPct} /> : null}
    </>
  );
}

async function Inbox({ tenantId, filter, fmt }: { tenantId: string; filter: "todos" | "abiertos"; fmt: (d: Date) => string }) {
  const requests = await tenantDb(tenantId).importRequest.findMany({
    where: filter === "abiertos" ? { status: { in: ["PENDING_REVIEW", "QUOTED", "ACCEPTED"] }, OR: [{ orderId: null }, { order: { status: { notIn: ["DELIVERED", "CANCELLED"] } } }] } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 150,
    select: {
      id: true,
      status: true,
      title: true,
      sourceStore: true,
      size: true,
      color: true,
      quantity: true,
      isPrivate: true,
      totalUsd: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true } },
      batch: { select: { name: true } },
      order: { select: { number: true, status: true, paymentStatus: true } },
    },
  });
  return (
    <div className={cn(card, "overflow-hidden")}>
      <div className="flex gap-3 border-b border-line px-4 py-2 text-sm">
        <Link href="/admin/importaciones" className={cn("font-semibold", filter === "abiertos" ? "text-ink" : "text-muted")}>
          En curso
        </Link>
        <Link href="/admin/importaciones?estado=todos" className={cn("font-semibold", filter === "todos" ? "text-ink" : "text-muted")}>
          Todos
        </Link>
      </div>
      {requests.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted">No hay encargos {filter === "abiertos" ? "en curso" : "todavía"}.</p>
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/importaciones/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-cream">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {r.title ?? `Producto de ${r.sourceStore}`}
                    {r.isPrivate ? <span className="ml-1 text-xs font-normal text-muted">🔒 privado</span> : null}
                  </span>
                  <span className="block text-xs text-muted">
                    {[r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ")} · {r.sourceStore} ·{" "}
                    {[r.size && `talla ${r.size}`, r.color, `${r.quantity} ud.`].filter(Boolean).join(" · ")}
                    {r.batch ? ` · ${r.batch.name}` : ""} · {fmt(r.createdAt)}
                  </span>
                </span>
                {r.totalUsd ? <span className="text-sm font-semibold">{formatUsd(toCents(r.totalUsd))}</span> : null}
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", REQUEST_STATUS[r.status][1])}>
                  {r.status === "ACCEPTED" && r.order ? `#${r.order.number} · ${requestStep(r.status, r.order).label}` : REQUEST_STATUS[r.status][0]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function Batches({ tenantId, fmt }: { tenantId: string; fmt: (d: Date) => string }) {
  const batches = await tenantDb(tenantId).importBatch.findMany({
    orderBy: [{ opensAt: "desc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      opensAt: true,
      closesAt: true,
      estimatedArrival: true,
      _count: { select: { products: true } },
      requests: { select: { status: true, order: { select: { status: true, paidUsd: true, totalUsd: true } } } },
    },
  });
  return (
    <div className="space-y-4">
      <BatchForm />
      {batches.length === 0 ? <p className={cn(card, "p-10 text-center text-sm text-muted")}>Crea el primer lote: tendrá fecha de apertura y de cierre.</p> : null}
      {batches.map((b) => {
        const accepted = b.requests.filter((r) => r.status === "ACCEPTED" && r.order && r.order.status !== "CANCELLED");
        const deposits = accepted.filter((r) => r.order && r.order.status !== "PENDING" && r.order.status !== "PAYMENT_REVIEW").length;
        const sold = accepted.reduce((a, r) => a + toCents(r.order!.totalUsd), 0);
        const collected = accepted.reduce((a, r) => a + toCents(r.order!.paidUsd), 0);
        return (
          <section key={b.id} className={cn(card, "space-y-3 p-5")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{b.name}</h2>
                <p className="text-sm text-muted">
                  Recibe pedidos del {fmt(b.opensAt)} al {fmt(b.closesAt)}
                  {b.estimatedArrival ? ` · llegada estimada ${fmt(b.estimatedArrival)}` : ""}
                </p>
              </div>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", BATCH_STATUS[b.status].tone)}>{BATCH_STATUS[b.status].label}</span>
            </div>
            <p className="text-sm">
              {b.requests.filter((r) => r.status === "PENDING_REVIEW" || r.status === "QUOTED").length} por cotizar o aceptar · {accepted.length} aceptados ({deposits} con adelanto) ·{" "}
              {b._count.products} en la galería · vendido {formatUsd(sold)}, cobrado {formatUsd(collected)}
            </p>
            <BatchStatusButtons batchId={b.id} status={b.status} />
            <BatchForm
              batch={{
                id: b.id,
                name: b.name,
                description: b.description,
                opensAt: caracasDay(b.opensAt),
                closesAt: caracasDay(b.closesAt),
                estimatedArrival: b.estimatedArrival ? caracasDay(b.estimatedArrival) : "",
              }}
            />
          </section>
        );
      })}
    </div>
  );
}

async function Gallery({ tenantId }: { tenantId: string }) {
  const products = await tenantDb(tenantId).importProduct.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      sourceStore: true,
      sourceUrl: true,
      imageUrl: true,
      estimatedPriceUsd: true,
      isPublished: true,
      batch: { select: { name: true } },
      requests: { select: { customerId: true, status: true, quantity: true } },
    },
  });
  if (!products.length) {
    return <p className={cn(card, "p-10 text-center text-sm text-muted")}>Aún no hay productos publicados. Publica un encargo (que no sea privado) desde su ficha en la bandeja.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => {
        const g = groupCount(p.requests);
        return (
          <li key={p.id} className={cn(card, "flex gap-3 p-3", !p.isPublished && "opacity-60")}>
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura
              <img src={p.imageUrl} alt="" className="h-24 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid h-24 w-20 shrink-0 place-items-center rounded-lg bg-cream text-2xl">📦</span>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{p.title}</p>
              <p className="text-xs text-muted">
                {p.batch.name} · {p.sourceStore}
                {p.estimatedPriceUsd ? ` · ≈ ${formatUsd(toCents(p.estimatedPriceUsd))}` : ""}
              </p>
              <p className="text-xs">
                {g.people} {g.people === 1 ? "clienta" : "clientas"} · {g.units} ud.
              </p>
              <div className="mt-1 flex items-center gap-3">
                <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-xs font-semibold underline">
                  Ver en {p.sourceStore}
                </a>
                <ProductToggle productId={p.id} published={p.isPublished} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function Reviews({ tenantId, fmt }: { tenantId: string; fmt: (d: Date) => string }) {
  const reviews = await tenantDb(tenantId).importReview.findMany({
    orderBy: [{ isApproved: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, rating: true, body: true, isApproved: true, createdAt: true, batch: { select: { name: true } }, customer: { select: { firstName: true, lastName: true } } },
  });
  if (!reviews.length) return <p className={cn(card, "p-10 text-center text-sm text-muted")}>Aún no hay reseñas. Las clientas opinan cuando su lote se marca como entregado.</p>;
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className={cn(card, "space-y-2 p-4")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">
              {[r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ")} · {r.batch.name}
            </span>
            <span className="text-amber-600">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
          </div>
          <p className="text-sm">«{r.body}»</p>
          <p className="text-xs text-muted">
            {fmt(r.createdAt)} · {r.isApproved ? "Publicada" : "Por aprobar"}
          </p>
          <ReviewButtons reviewId={r.id} approved={r.isApproved} />
        </li>
      ))}
    </ul>
  );
}
