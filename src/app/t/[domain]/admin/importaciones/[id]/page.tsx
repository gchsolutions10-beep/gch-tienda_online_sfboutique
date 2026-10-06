import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getImportSettings } from "@/server/services/imports";
import { getDeliverySettings } from "@/server/services/orders";
import { getCurrentRates } from "@/server/queries/store";
import { PublishForm, QuoteForm, RequestNoteForm } from "@/components/admin/import-forms";
import { card, cn } from "@/components/ui/styles";
import { requestStep } from "@/lib/imports";
import { toCents } from "@/lib/money";
import { formatVeId, formatVePhone, whatsappLink } from "@/lib/ve-ids";

export const metadata = { title: "Encargo" };

export default async function ImportRequestPage({ params }: PageProps<"/t/[domain]/admin/importaciones/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], `/admin/importaciones/${id}`);
  const tdb = tenantDb(tenant.id);
  const r = await tdb.importRequest.findFirst({
    where: { id },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, idType: true, idNumber: true, phone: true, whatsapp: true, email: true } },
      batch: { select: { id: true, name: true } },
      product: { select: { id: true, title: true, isPublished: true, requests: { select: { id: true } } } },
      order: { select: { id: true, number: true, status: true, paymentStatus: true } },
    },
  });
  if (!r) notFound();
  const [settings, delivery, rates, batches] = await Promise.all([
    getImportSettings(tenant.id),
    getDeliverySettings(tenant.id),
    getCurrentRates(tenant.id),
    tdb.importBatch.findMany({ where: { status: { in: ["DRAFT", "OPEN", "IN_PROCESS"] } }, orderBy: { opensAt: "desc" }, select: { id: true, name: true, status: true } }),
  ]);
  const name = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ");
  const phone = r.customer.whatsapp ?? r.customer.phone;
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });
  const canQuote = r.status === "PENDING_REVIEW" || r.status === "QUOTED";
  const step = requestStep(r.status, r.order);
  const cents = (v: { toString(): string } | null) => (v === null ? null : toCents(v));

  return (
    <>
      <Link href="/admin/importaciones" className="text-sm font-semibold text-muted hover:text-ink">
        ← Importaciones
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold">{r.title ?? `Encargo de ${r.sourceStore}`}</h1>
        <span className="rounded-full bg-cream px-3 py-1 text-sm font-semibold">{step.label}</span>
        {r.isPrivate ? <span className="rounded-full bg-ink px-3 py-1 text-sm font-semibold text-white">🔒 Privado / discreto</span> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className={cn(card, "space-y-3 p-5 text-sm")}>
            <h2 className="text-lg font-bold">Lo que pidió</h2>
            <div className="flex flex-wrap gap-4">
              {r.photoKey ? (
                <a href={`/admin/importaciones/foto/${r.photoKey}`} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida por el panel */}
                  <img src={`/admin/importaciones/foto/${r.photoKey}`} alt="Foto que envió la clienta" className="h-48 w-36 rounded-xl object-cover" />
                </a>
              ) : null}
              <dl className="min-w-0 flex-1 space-y-1">
                <div><dt className="inline font-semibold">Tienda: </dt><dd className="inline">{r.sourceStore}</dd></div>
                <div className="break-all">
                  <dt className="inline font-semibold">Enlace: </dt>
                  <dd className="inline">
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-strong underline">
                      {r.sourceUrl}
                    </a>
                  </dd>
                </div>
                <div><dt className="inline font-semibold">Talla / color: </dt><dd className="inline">{[r.size, r.color].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="inline font-semibold">Cantidad: </dt><dd className="inline">{r.quantity}</dd></div>
                {r.notes ? <div><dt className="inline font-semibold">Notas: </dt><dd className="inline">{r.notes}</dd></div> : null}
                <div><dt className="inline font-semibold">Lote: </dt><dd className="inline">{r.batch?.name ?? "Sin lote"}</dd></div>
                <div className="text-xs text-muted">Recibido {fmt(r.createdAt)} · condiciones aceptadas {fmt(r.termsAcceptedAt)}</div>
              </dl>
            </div>
          </section>

          <QuoteForm
            requestId={r.id}
            quantity={r.quantity}
            tax={delivery.tax}
            depositPct={settings.depositPct}
            commissionPct={settings.commissionPct}
            bcvRate={rates.bcv?.rate ?? null}
            batches={batches}
            canQuote={canQuote}
            initial={{ unitCostCents: cents(r.unitCostUsd), freightCents: cents(r.freightUsd), commissionCents: cents(r.commissionUsd), note: r.quoteNote, batchId: r.batch?.id ?? null }}
          />
          {r.quotedAt ? <p className="-mt-4 text-xs text-muted">Cotizado {fmt(r.quotedAt)}{r.quotedByName ? ` por ${r.quotedByName}` : ""}.</p> : null}
          {r.status === "REJECTED" ? <p className="rounded-xl bg-red-50 p-3 text-sm text-danger">Rechazado: {r.rejectReason}</p> : null}

          <section className={cn(card, "space-y-3 p-5")}>
            <h2 className="text-lg font-bold">Galería del lote (pedido grupal)</h2>
            {r.product ? (
              <p className="text-sm">
                Publicado como «{r.product.title}» {r.product.isPublished ? "" : "(oculto)"} · {r.product.requests.length} encargo(s) unidos.{" "}
                <Link href="/admin/importaciones?vista=galeria" className="font-semibold underline">
                  Ver galería
                </Link>
              </p>
            ) : r.isPrivate ? (
              <p className="rounded-lg bg-cream p-3 text-sm">🔒 La clienta lo marcó como privado/discreto: no se puede publicar.</p>
            ) : !r.batch ? (
              <p className="text-sm text-muted">Asígnale un lote (en la cotización) para poder publicarlo.</p>
            ) : r.status === "REJECTED" || r.status === "CANCELLED" ? (
              <p className="text-sm text-muted">Este encargo no está activo.</p>
            ) : (
              <>
                <p className="text-sm text-muted">Publícalo para que otras clientas se sumen con «Unirme al pedido». Se muestra la foto, el nombre y la tienda; el enlace exacto no.</p>
                <PublishForm
                  requestId={r.id}
                  defaults={{
                    title: r.title ?? "",
                    estimatedPrice: r.unitCostUsd && r.totalUsd ? (toCents(r.totalUsd) / r.quantity / 100).toFixed(2) : "",
                    sizes: r.size ?? "",
                    colors: r.color ?? "",
                  }}
                />
              </>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className={cn(card, "space-y-2 p-5 text-sm")}>
            <h2 className="text-lg font-bold">Clienta</h2>
            <p>
              <Link href={`/admin/clientes/${r.customer.id}`} className="font-semibold underline">
                {name}
              </Link>
            </p>
            <p className="text-muted">
              {[r.customer.idNumber ? formatVeId(r.customer.idType, r.customer.idNumber) : null, phone ? formatVePhone(phone) : null, r.customer.email].filter(Boolean).join(" · ")}
            </p>
            {phone ? (
              <a
                href={whatsappLink(phone, `¡Hola ${r.customer.firstName}! Te escribimos de ${tenant.name} por tu encargo de ${r.sourceStore}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-semibold text-ok underline"
              >
                Escribir por WhatsApp
              </a>
            ) : null}
          </section>
          {r.order ? (
            <section className={cn(card, "space-y-1 p-5 text-sm")}>
              <h2 className="text-lg font-bold">Pedido</h2>
              <Link href={`/admin/pedidos/${r.order.id}`} className="font-semibold underline">
                Pedido #{r.order.number} →
              </Link>
              <p className="text-muted">Los pagos (adelanto y saldo), la factura y la entrega se manejan en el pedido.</p>
            </section>
          ) : null}
          <section className={cn(card, "p-5")}>
            <RequestNoteForm requestId={r.id} note={r.adminNote} />
          </section>
        </aside>
      </div>
    </>
  );
}
