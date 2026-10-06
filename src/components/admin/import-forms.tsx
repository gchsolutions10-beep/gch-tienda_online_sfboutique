"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  changeBatchStatus,
  moderateReview,
  publishRequest,
  quoteRequest,
  rejectRequest,
  saveBatch,
  saveImportSettings,
  saveRequestNote,
  setProductPublished,
} from "@/server/actions/admin/imports";
import { BATCH_STATUS, NOT_ACCEPTED, quoteFor, suggestedCommission, type BatchStatus } from "@/lib/imports";
import { formatUsd, formatVes, parseAmount, usdToVesCents } from "@/lib/money";
import type { TaxSettings } from "@/lib/tax-ve";
import { buttonPrimary, buttonSecondary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, feedback, run };
}

function Feedback({ value }: { value: { ok: boolean; text: string } | null }) {
  if (!value) return null;
  return (
    <p role={value.ok ? "status" : "alert"} className={cn("rounded-lg p-2 text-sm font-medium", value.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-danger")}>
      {value.text}
    </p>
  );
}

const toCents = (v: string) => {
  const n = parseAmount(v);
  return n === null ? 0 : Math.round(n * 100);
};
const dec = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

/**
 * Cotizador: costo del producto + flete + comisión → total en USD y Bs, y el
 * adelanto. La comisión se sugiere con el % configurado y se puede ajustar.
 */
export function QuoteForm({
  requestId,
  quantity,
  tax,
  depositPct,
  commissionPct,
  bcvRate,
  batches,
  initial,
  canQuote,
}: {
  requestId: string;
  quantity: number;
  tax: TaxSettings;
  depositPct: number;
  commissionPct: number;
  bcvRate: number | null;
  batches: { id: string; name: string; status: BatchStatus }[];
  initial: { unitCostCents: number | null; freightCents: number | null; commissionCents: number | null; note: string | null; batchId: string | null };
  canQuote: boolean;
}) {
  const { pending, feedback, run } = useRun();
  const [unitCost, setUnitCost] = useState(dec(initial.unitCostCents));
  const [freight, setFreight] = useState(dec(initial.freightCents));
  const [commission, setCommission] = useState(dec(initial.commissionCents));
  const [touched, setTouched] = useState(initial.commissionCents !== null);
  const [note, setNote] = useState(initial.note ?? "");
  const [batchId, setBatchId] = useState(initial.batchId ?? "");
  const [reason, setReason] = useState("");

  const products = toCents(unitCost) * quantity;
  const suggested = suggestedCommission(products, toCents(freight), commissionPct);
  const commissionCents = touched ? toCents(commission) : suggested;
  const q = quoteFor({ unitCostCents: toCents(unitCost), quantity, freightCents: toCents(freight), commissionCents }, tax, depositPct);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(() => quoteRequest(requestId, { unitCost, freight, commission: dec(commissionCents), note, batchId }));
  }

  return (
    <section className={cn(card, "space-y-4 p-5")}>
      <h2 className="text-lg font-bold">Cotización</h2>
      <form onSubmit={submit} method="post" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="unitCost">Costo por unidad (USD)</label>
            <input id="unitCost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="12,00" className={inputClass} disabled={!canQuote} />
            <p className="mt-0.5 text-xs text-muted">× {quantity} ud. = {formatUsd(products)}</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="freight">Flete y envío (USD)</label>
            <input id="freight" inputMode="decimal" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="8,00" className={inputClass} disabled={!canQuote} />
          </div>
          <div>
            <label className={labelClass} htmlFor="commission">Comisión (USD)</label>
            <input
              id="commission"
              inputMode="decimal"
              value={touched ? commission : dec(suggested)}
              onChange={(e) => {
                setTouched(true);
                setCommission(e.target.value);
              }}
              className={inputClass}
              disabled={!canQuote}
            />
            <p className="mt-0.5 text-xs text-muted">
              Sugerida {commissionPct} %: {formatUsd(suggested)}
              {touched && canQuote ? (
                <button type="button" onClick={() => setTouched(false)} className="ml-1 font-semibold underline">
                  usar
                </button>
              ) : null}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="batch">Lote</label>
            <select id="batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={inputClass} disabled={!canQuote}>
              <option value="">— Sin cambiar —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {BATCH_STATUS[b.status].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="note">Nota para la clienta</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Llega en 20–25 días" className={inputClass} disabled={!canQuote} />
          </div>
        </div>

        <dl className="grid gap-1 rounded-xl bg-cream p-3 text-sm">
          <div className="flex justify-between"><dt>Productos + flete</dt><dd>{formatUsd(q.productsCents + q.freightCents)}</dd></div>
          <div className="flex justify-between"><dt>Comisión (servicio)</dt><dd>{formatUsd(q.commissionCents)}</dd></div>
          {q.ivaCents ? <div className="flex justify-between text-muted"><dt>+ IVA de la comisión</dt><dd>{formatUsd(q.ivaCents)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-1 font-bold">
            <dt>Total</dt>
            <dd>
              {formatUsd(q.totalCents)}
              {bcvRate ? <span className="ml-1 font-normal text-muted">≈ {formatVes(usdToVesCents(q.totalCents, bcvRate))}</span> : null}
            </dd>
          </div>
          <div className="flex justify-between font-semibold text-brand-strong">
            <dt>Adelanto ({depositPct} %)</dt>
            <dd>
              {formatUsd(q.depositCents)}
              {bcvRate ? <span className="ml-1 font-normal text-muted">≈ {formatVes(usdToVesCents(q.depositCents, bcvRate))}</span> : null}
            </dd>
          </div>
          <div className="flex justify-between text-muted"><dt>Saldo al llegar</dt><dd>{formatUsd(q.balanceCents)}</dd></div>
        </dl>
        {canQuote ? (
          <button disabled={pending || q.totalCents <= 0} className={buttonPrimary}>
            {initial.unitCostCents === null ? "✓ Aprobar y enviar cotización" : "Actualizar cotización"}
          </button>
        ) : null}
      </form>

      {canQuote ? (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-sm font-semibold">¿No se puede traer?</p>
          <p className="text-xs text-muted">No gestionamos: {NOT_ACCEPTED.join(" · ")}.</p>
          <div className="flex flex-wrap gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Motivo (lo ve la clienta)" aria-label="Motivo del rechazo" className={cn(inputClass, "flex-1")} />
            <button type="button" disabled={pending} onClick={() => run(() => rejectRequest(requestId, reason))} className={cn(buttonSecondary, "border-danger text-danger")}>
              Rechazar
            </button>
          </div>
        </div>
      ) : null}
      <Feedback value={feedback} />
    </section>
  );
}

/** Publicar el encargo en la galería del lote (para el pedido grupal). */
export function PublishForm({ requestId, defaults }: { requestId: string; defaults: { title: string; estimatedPrice: string; sizes: string; colors: string } }) {
  const { pending, feedback, run } = useRun();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    run(() => publishRequest(requestId, { title: get("title"), description: get("description"), estimatedPrice: get("estimatedPrice"), sizes: get("sizes"), colors: get("colors") }));
  }
  return (
    <form onSubmit={submit} method="post" className="space-y-3">
      <div>
        <label className={labelClass} htmlFor="p-title">Nombre en la galería</label>
        <input id="p-title" name="title" defaultValue={defaults.title} required maxLength={120} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="p-description">Descripción</label>
        <input id="p-description" name="description" maxLength={400} className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="p-price">Precio estimado c/u (USD)</label>
          <input id="p-price" name="estimatedPrice" inputMode="decimal" defaultValue={defaults.estimatedPrice} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-sizes">Tallas (separadas por coma)</label>
          <input id="p-sizes" name="sizes" defaultValue={defaults.sizes} placeholder="S, M, L" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-colors">Colores</label>
          <input id="p-colors" name="colors" defaultValue={defaults.colors} placeholder="Negro, Beige" className={inputClass} />
        </div>
      </div>
      <Feedback value={feedback} />
      <button disabled={pending} className={buttonSecondary}>
        📣 Publicar en la galería
      </button>
    </form>
  );
}

export function RequestNoteForm({ requestId, note }: { requestId: string; note: string | null }) {
  const { pending, feedback, run } = useRun();
  const [value, setValue] = useState(note ?? "");
  return (
    <div className="space-y-2">
      <label className={labelClass} htmlFor="admin-note">Nota interna (no la ve la clienta)</label>
      <textarea id="admin-note" rows={2} value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} className={inputClass} />
      <Feedback value={feedback} />
      <button type="button" disabled={pending} onClick={() => run(() => saveRequestNote(requestId, value))} className={buttonSecondary}>
        Guardar nota
      </button>
    </div>
  );
}

/** Crear o editar un lote (fechas en hora de Caracas). */
export function BatchForm({
  batch,
}: {
  batch?: { id: string; name: string; description: string | null; opensAt: string; closesAt: string; estimatedArrival: string };
}) {
  const { pending, feedback, run } = useRun();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={batch ? "text-sm font-semibold text-brand-strong underline" : buttonPrimary}>
        {batch ? "Editar" : "+ Nuevo lote"}
      </button>
    );
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    run(
      () => saveBatch(batch?.id ?? null, { name: get("name"), description: get("description"), opensAt: get("opensAt"), closesAt: get("closesAt"), estimatedArrival: get("estimatedArrival") }),
      () => setOpen(false),
    );
  }
  const k = batch?.id ?? "new";
  return (
    <form onSubmit={submit} method="post" className={cn(card, "space-y-3 p-4")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`name-${k}`}>Nombre</label>
          <input id={`name-${k}`} name="name" defaultValue={batch?.name} required maxLength={80} placeholder="Lote Navidad 2026" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`desc-${k}`}>Descripción</label>
          <input id={`desc-${k}`} name="description" defaultValue={batch?.description ?? ""} maxLength={400} className={inputClass} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor={`opens-${k}`}>Abre</label>
          <input id={`opens-${k}`} name="opensAt" type="date" defaultValue={batch?.opensAt} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`closes-${k}`}>Cierra (último día)</label>
          <input id={`closes-${k}`} name="closesAt" type="date" defaultValue={batch?.closesAt} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`arrival-${k}`}>Llegada estimada</label>
          <input id={`arrival-${k}`} name="estimatedArrival" type="date" defaultValue={batch?.estimatedArrival} className={inputClass} />
        </div>
      </div>
      <Feedback value={feedback} />
      <div className="flex gap-2">
        <button disabled={pending} className={buttonPrimary}>Guardar</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondary}>Cancelar</button>
      </div>
    </form>
  );
}

const NEXT: Record<BatchStatus, { to: BatchStatus; label: string; confirm?: string }[]> = {
  DRAFT: [{ to: "OPEN", label: "Abrir (recibir pedidos)" }, { to: "CANCELLED", label: "Cancelar" }],
  OPEN: [
    { to: "IN_PROCESS", label: "Cerrar y pasar a «En proceso»", confirm: "Se cierra el lote. Los encargos con el adelanto pagado pasan a «Preparando» (comprado / en tránsito). ¿Seguir?" },
    { to: "DRAFT", label: "Volver a borrador" },
  ],
  IN_PROCESS: [{ to: "DELIVERED", label: "Marcar entregado (historial)", confirm: "El lote pasa al historial público y las clientas que recibieron pueden opinar. ¿Seguir?" }],
  DELIVERED: [],
  CANCELLED: [{ to: "DRAFT", label: "Recuperar como borrador" }],
};

export function BatchStatusButtons({ batchId, status }: { batchId: string; status: BatchStatus }) {
  const { pending, feedback, run } = useRun();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {NEXT[status].map((n) => (
          <button
            key={n.to}
            type="button"
            disabled={pending}
            onClick={() => (!n.confirm || confirm(n.confirm)) && run(() => changeBatchStatus(batchId, n.to))}
            className={n.to === "CANCELLED" || n.to === "DRAFT" ? buttonSecondary : buttonPrimary}
          >
            {n.label}
          </button>
        ))}
      </div>
      <Feedback value={feedback} />
    </div>
  );
}

export function ProductToggle({ productId, published }: { productId: string; published: boolean }) {
  const { pending, feedback, run } = useRun();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => run(() => setProductPublished(productId, !published))} className="text-sm font-semibold text-brand-strong underline">
        {published ? "Ocultar" : "Mostrar"}
      </button>
      <Feedback value={feedback?.ok ? null : feedback} />
    </div>
  );
}

export function ReviewButtons({ reviewId, approved }: { reviewId: string; approved: boolean }) {
  const { pending, feedback, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!approved ? (
        <button type="button" disabled={pending} onClick={() => run(() => moderateReview(reviewId, true))} className={cn(buttonPrimary, "bg-ok")}>
          Publicar
        </button>
      ) : null}
      <button type="button" disabled={pending} onClick={() => confirm("¿Eliminar esta reseña?") && run(() => moderateReview(reviewId, false))} className={cn(buttonSecondary, "border-danger text-danger")}>
        Eliminar
      </button>
      <Feedback value={feedback?.ok ? null : feedback} />
    </div>
  );
}

export function ImportSettingsForm({ depositPct, commissionPct }: { depositPct: number; commissionPct: number }) {
  const { pending, feedback, run } = useRun();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => saveImportSettings({ depositPct: f.get("depositPct"), commissionPct: f.get("commissionPct") }));
  }
  return (
    <form onSubmit={submit} method="post" className={cn(card, "max-w-xl space-y-3 p-5")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="depositPct">Adelanto para procesar (%)</label>
          <input id="depositPct" name="depositPct" type="number" min={10} max={100} defaultValue={depositPct} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="commissionPct">Comisión sugerida (%)</label>
          <input id="commissionPct" name="commissionPct" type="number" min={0} max={100} defaultValue={commissionPct} className={inputClass} />
          <p className="mt-0.5 text-xs text-muted">Sobre productos + flete. Se puede ajustar en cada cotización.</p>
        </div>
      </div>
      <Feedback value={feedback} />
      <button disabled={pending} className={buttonPrimary}>Guardar</button>
    </form>
  );
}
