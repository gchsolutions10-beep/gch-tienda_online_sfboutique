import Link from "next/link";
import { customerImports } from "@/server/queries/imports";
import { BatchReviewForm, QuoteActions } from "@/components/store/import-forms";
import { requestStep } from "@/lib/imports";
import { formatUsd, toCents, type DecimalLike } from "@/lib/money";
import { cn } from "@/components/ui/styles";

const TONE = {
  warn: "bg-accent/15 text-accent",
  info: "bg-store-soft",
  ok: "bg-ok/15 text-ok",
  done: "bg-brand/15 text-brand-strong",
  off: "bg-store-soft text-store-muted",
} as const;

/** «Mis encargos» en la cuenta de la clienta (cotizaciones, pagos y reseñas). */
export async function MyImportRequests({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const { requests, reviewable } = await customerImports(tenantId, customerId);
  const usd = (v: DecimalLike | null) => formatUsd(toCents(v));

  return (
    <section id="encargos" className="scroll-mt-24 rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold">Mis encargos</h2>
        <Link href="/importaciones/encargar" className="text-sm font-semibold text-brand-strong underline">
          + Nuevo encargo
        </Link>
      </div>
      {requests.length === 0 ? (
        <p className="mt-2 text-sm text-store-muted">
          Aún no tienes encargos. Mira el lote abierto en{" "}
          <Link href="/importaciones" className="underline">
            Importaciones
          </Link>{" "}
          o pega el enlace de lo que quieras traer.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-store-line">
          {requests.map((r) => {
            const step = requestStep(r.status, r.order);
            return (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.title ?? `Producto de ${r.sourceStore}`}
                      {r.isPrivate ? <span className="ml-1 text-xs font-normal text-store-muted">🔒 privado</span> : null}
                    </p>
                    <p className="text-xs text-store-muted">
                      {[r.sourceStore, r.size && `Talla ${r.size}`, r.color, `${r.quantity} ud.`, r.batch?.name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[step.tone])}>{step.label}</span>
                </div>

                {r.status === "QUOTED" && r.totalUsd ? (
                  <div className="mt-3 rounded-2xl bg-store-soft p-4 text-sm">
                    <dl className="space-y-1">
                      <div className="flex justify-between"><dt>Producto{r.quantity > 1 ? `s (${r.quantity})` : ""}</dt><dd>{formatUsd(toCents(r.unitCostUsd) * r.quantity)}</dd></div>
                      <div className="flex justify-between"><dt>Flete y envío</dt><dd>{usd(r.freightUsd)}</dd></div>
                      <div className="flex justify-between"><dt>Gestión de compra e importación</dt><dd>{usd(r.commissionUsd)}</dd></div>
                      <div className="flex justify-between border-t border-store-line pt-1 font-semibold"><dt>Total</dt><dd>{usd(r.totalUsd)}</dd></div>
                      <div className="flex justify-between font-semibold text-accent"><dt>Adelanto para procesarlo</dt><dd>{usd(r.depositUsd)}</dd></div>
                    </dl>
                    {r.quoteNote ? <p className="mt-2 text-store-muted">💬 {r.quoteNote}</p> : null}
                    <QuoteActions requestId={r.id} canAccept />
                  </div>
                ) : r.status === "PENDING_REVIEW" ? (
                  <QuoteActions requestId={r.id} canAccept={false} />
                ) : r.status === "REJECTED" && r.rejectReason ? (
                  <p className="mt-2 text-sm text-store-muted">Motivo: {r.rejectReason}</p>
                ) : null}

                {r.order && r.status === "ACCEPTED" ? (
                  <Link href={`/pedido/${r.order.trackingToken}`} className="mt-2 inline-block text-sm font-semibold text-brand-strong underline">
                    Pedido #{r.order.number} · pagado {formatUsd(toCents(r.order.paidUsd))} de {usd(r.totalUsd)} →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {reviewable.length ? (
        <div className="mt-4 space-y-3">
          {reviewable.map((b) => (
            <BatchReviewForm key={b.id} batchId={b.id} batchName={b.name} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
