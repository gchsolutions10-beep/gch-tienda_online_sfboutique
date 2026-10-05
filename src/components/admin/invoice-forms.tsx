"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  creditNoteAction,
  debitNoteAction,
  issueInvoiceAction,
  saveFiscalSettings,
  saveSeries,
  setControlNumberAction,
  voidDocumentAction,
} from "@/server/actions/admin/invoices";
import { CONTROL_MODE, type ControlMode } from "@/lib/invoicing";
import { formatVes } from "@/lib/money";
import { buttonPrimary, buttonSecondary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Result>, after?: (r: Extract<Result, { ok: true }>) => void) =>
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) {
        after?.(r);
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

const get = (f: FormData, k: string) => String(f.get(k) ?? "");

// ───────────────────────────── Emitir ─────────────────────────────

export type BuyerValues = { name: string; idDoc: string; address: string; phone: string; email: string };

/** Datos del comprador y botón para emitir la factura del pedido. */
export function IssueInvoiceForm({ orderId, buyer, totalLabel }: { orderId: string; buyer: BuyerValues; totalLabel: string }) {
  const router = useRouter();
  const { pending, feedback, run } = useAction();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () => issueInvoiceAction(orderId, { name: get(f, "name"), idDoc: get(f, "idDoc"), address: get(f, "address"), phone: get(f, "phone"), email: get(f, "email") }),
      (r) => r.id && router.push(`/admin/facturacion/${r.id}`),
    );
  }

  return (
    <form onSubmit={submit} method="post" className={cn(card, "space-y-3 p-5")}>
      <h2 className="text-lg font-bold">Comprador</h2>
      <div>
        <label className={labelClass} htmlFor="name">Nombre o razón social</label>
        <input id="name" name="name" required defaultValue={buyer.name} className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="idDoc">Cédula o RIF</label>
          <input id="idDoc" name="idDoc" required defaultValue={buyer.idDoc} placeholder="V-12345678 o J-40123456-7" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="phone">Teléfono (opcional)</label>
          <input id="phone" name="phone" defaultValue={buyer.phone} placeholder="0414-1234567" className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="address">Domicilio fiscal (obligatorio si es RIF)</label>
        <input id="address" name="address" defaultValue={buyer.address} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="email">Correo (opcional)</label>
        <input id="email" name="email" type="email" defaultValue={buyer.email} className={inputClass} />
      </div>
      <Feedback value={feedback} />
      <button disabled={pending} className={cn(buttonPrimary, "w-full py-3")}>
        {pending ? "Emitiendo…" : `Emitir factura por ${totalLabel}`}
      </button>
      <p className="text-xs text-muted">Una vez emitida no se edita: si hay un error se corrige con una nota de crédito.</p>
    </form>
  );
}

// ───────────────────────────── Documento ─────────────────────────────

export function ControlNumberForm({ invoiceId }: { invoiceId: string }) {
  const { pending, feedback, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => setControlNumberAction(invoiceId, get(f, "control")));
      }}
      method="post"
      className="space-y-2 rounded-xl bg-amber-50 p-3 print:hidden"
    >
      <label className={labelClass} htmlFor="control">Número de control que asignó la imprenta digital</label>
      <div className="flex gap-2">
        <input id="control" name="control" required placeholder="00-00001234" className={inputClass} />
        <button disabled={pending} className={buttonPrimary}>Guardar</button>
      </div>
      <Feedback value={feedback} />
    </form>
  );
}

type NoteLine = { description: string; available: number; unitVes: number };

/** Acciones sobre una factura: nota de crédito, nota de débito y anular. */
export function InvoiceActions({ invoiceId, lines, canVoid, isInvoice, owner }: { invoiceId: string; lines: NoteLine[]; canVoid: boolean; isInvoice: boolean; owner: boolean }) {
  const router = useRouter();
  const { pending, feedback, run } = useAction();
  const [panel, setPanel] = useState<"credit" | "debit" | "void" | null>(null);
  const [qty, setQty] = useState<number[]>(lines.map(() => 0));
  const goTo = (r: { id?: string }) => {
    setPanel(null);
    if (r.id) router.push(`/admin/facturacion/${r.id}`);
  };
  const anyLeft = lines.some((l) => l.available > 0);

  return (
    <section className={cn(card, "space-y-3 p-5 print:hidden")}>
      <h2 className="text-lg font-bold">Acciones</h2>
      <Feedback value={feedback} />

      {isInvoice && panel === "credit" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => creditNoteAction(invoiceId, qty, get(f, "concept")), goTo);
          }}
          method="post"
          className="space-y-2 rounded-xl bg-cream p-3"
        >
          <p className="text-sm font-semibold">Nota de crédito (devolución o descuento)</p>
          <ul className="space-y-1.5">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {l.description}
                  <span className="block text-xs text-muted">{formatVes(l.unitVes)} c/u · quedan {l.available}</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={l.available}
                  value={qty[i]}
                  disabled={!l.available}
                  onChange={(e) => setQty((q) => q.map((x, j) => (j === i ? Math.max(0, Math.min(l.available, Math.floor(Number(e.target.value) || 0))) : x)))}
                  aria-label={`Unidades a devolver de ${l.description}`}
                  className={cn(inputClass, "w-20 text-right")}
                />
              </li>
            ))}
          </ul>
          <input name="concept" required minLength={3} placeholder="Motivo: devolución por talla, prenda defectuosa…" aria-label="Motivo" className={inputClass} />
          <p className="text-xs text-muted">No mueve el stock: si la prenda vuelve a la tienda, súmala en el producto.</p>
          <div className="flex gap-2">
            <button disabled={pending || !qty.some((q) => q > 0)} className={cn(buttonPrimary, "flex-1")}>Emitir nota de crédito</button>
            <button type="button" onClick={() => setPanel(null)} className={buttonSecondary}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {isInvoice && panel === "debit" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => debitNoteAction(invoiceId, { concept: get(f, "concept"), amount: get(f, "amount"), exempt: f.get("exempt") === "on" }), goTo);
          }}
          method="post"
          className="space-y-2 rounded-xl bg-cream p-3"
        >
          <p className="text-sm font-semibold">Nota de débito (cargo adicional)</p>
          <input name="concept" required minLength={3} placeholder="Concepto: diferencia de precio, envío adicional…" aria-label="Concepto" className={inputClass} />
          <input name="amount" required inputMode="decimal" placeholder="Monto en Bs, sin IVA" aria-label="Monto en Bs sin IVA" className={inputClass} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="exempt" className="size-4" /> Exento de IVA
          </label>
          <div className="flex gap-2">
            <button disabled={pending} className={cn(buttonPrimary, "flex-1")}>Emitir nota de débito</button>
            <button type="button" onClick={() => setPanel(null)} className={buttonSecondary}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {panel === "void" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => voidDocumentAction(invoiceId, get(f, "reason")), () => setPanel(null));
          }}
          method="post"
          className="space-y-2 rounded-xl bg-red-50 p-3"
        >
          <label className={labelClass} htmlFor="reason">Motivo de la anulación</label>
          <input id="reason" name="reason" required minLength={3} className={inputClass} />
          <p className="text-xs text-red-900">Queda en el libro de ventas como anulado (montos en cero). Guarda el formato físico con todas sus copias.</p>
          <div className="flex gap-2">
            <button disabled={pending} className={cn(buttonPrimary, "flex-1 bg-danger text-white")}>Anular documento</button>
            <button type="button" onClick={() => setPanel(null)} className={buttonSecondary}>Volver</button>
          </div>
        </form>
      ) : null}

      {panel === null ? (
        <div className="flex flex-col gap-2">
          {isInvoice ? (
            <>
              <button type="button" disabled={!anyLeft} onClick={() => setPanel("credit")} className={buttonSecondary}>
                ↩️ Nota de crédito (devolución)
              </button>
              <button type="button" onClick={() => setPanel("debit")} className={buttonSecondary}>
                ➕ Nota de débito (cargo adicional)
              </button>
            </>
          ) : null}
          {owner && canVoid ? (
            <button type="button" onClick={() => setPanel("void")} className="text-sm font-semibold text-muted hover:text-danger">
              Anular documento
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ───────────────────────────── Configuración ─────────────────────────────

export type FiscalValues = {
  legalName: string;
  rif: string;
  fiscalAddress: string;
  ivaEnabled: boolean;
  ivaRate: string;
  taxMode: "PRICE_INCLUDES_TAX" | "TAX_ADDED";
  isSpecialTaxpayer: boolean;
  igtfEnabled: boolean;
  igtfRate: string;
};

export function FiscalSettingsForm({ values }: { values: FiscalValues }) {
  const { pending, feedback, run } = useAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const on = (k: string) => f.get(k) === "on";
    run(() =>
      saveFiscalSettings({
        legalName: get(f, "legalName"),
        rif: get(f, "rif"),
        fiscalAddress: get(f, "fiscalAddress"),
        ivaEnabled: on("ivaEnabled"),
        ivaRate: get(f, "ivaRate"),
        taxMode: get(f, "taxMode"),
        isSpecialTaxpayer: on("isSpecialTaxpayer"),
        igtfEnabled: on("igtfEnabled"),
        igtfRate: get(f, "igtfRate"),
      }),
    );
  }
  return (
    <form onSubmit={submit} method="post" className={cn(card, "space-y-4 p-5")}>
      <h2 className="text-lg font-bold">Datos fiscales del negocio</h2>
      <p className="text-sm text-muted">Salen en cada factura tal como están en el RIF.</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <label className={labelClass} htmlFor="legalName">Razón social</label>
          <input id="legalName" name="legalName" required defaultValue={values.legalName} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rif">RIF</label>
          <input id="rif" name="rif" required defaultValue={values.rif} placeholder="J-40123456-7" className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="fiscalAddress">Domicilio fiscal</label>
        <textarea id="fiscalAddress" name="fiscalAddress" required rows={2} defaultValue={values.fiscalAddress} className={inputClass} />
      </div>

      <h3 className="border-t border-line pt-4 font-bold">IVA</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ivaEnabled" defaultChecked={values.ivaEnabled} className="size-4" /> Cobro IVA (cada producto puede marcarse exento)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="ivaRate">Alícuota general (%)</label>
          <input id="ivaRate" name="ivaRate" inputMode="decimal" defaultValue={values.ivaRate} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="taxMode">Los precios del catálogo…</label>
          <select id="taxMode" name="taxMode" defaultValue={values.taxMode} className={inputClass}>
            <option value="PRICE_INCLUDES_TAX">ya incluyen el IVA</option>
            <option value="TAX_ADDED">no lo incluyen (se suma al cobrar)</option>
          </select>
        </div>
      </div>

      <h3 className="border-t border-line pt-4 font-bold">IGTF (pagos en divisas)</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isSpecialTaxpayer" defaultChecked={values.isSpecialTaxpayer} className="size-4" /> Soy contribuyente especial (designado por el SENIAT)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="igtfEnabled" defaultChecked={values.igtfEnabled} className="size-4" /> Cobro IGTF sobre los pagos en dólares, euros o USDT
      </label>
      <div className="max-w-48">
        <label className={labelClass} htmlFor="igtfRate">Alícuota del IGTF (%)</label>
        <input id="igtfRate" name="igtfRate" inputMode="decimal" defaultValue={values.igtfRate} className={inputClass} />
      </div>
      <p className="rounded-lg bg-cream p-3 text-xs text-muted">
        Con el IGTF activo, a todo pago en divisas se le suma el {values.igtfRate || "3"} % sobre la parte que paga el pedido (el vuelto no lo lleva). En la factura sale aparte, fuera de la base del IVA.
        Quién debe cobrarlo depende de tu condición ante el SENIAT: <b>confírmalo con tu contador</b>.
      </p>

      <Feedback value={feedback} />
      <button disabled={pending} className={buttonPrimary}>{pending ? "Guardando…" : "Guardar datos fiscales"}</button>
    </form>
  );
}

export type SeriesValues = {
  id: string;
  label: string;
  series: string;
  nextNumber: number;
  controlMode: ControlMode;
  controlPrefix: string;
  nextControl: number | null;
  controlTo: number | null;
  lastIssued: number | null;
  /** Solo la serie de facturas define el número de control; las notas lo comparten. */
  controlEditable: boolean;
};

export function SeriesForm({ values }: { values: SeriesValues }) {
  const { pending, feedback, run } = useAction();
  const [mode, setMode] = useState<ControlMode>(values.controlMode);
  const n = (s: string) => (s.trim() ? Math.floor(Number(s.replace(/\D/g, ""))) : null);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() =>
      saveSeries({
        id: values.id,
        series: get(f, "series"),
        nextNumber: n(get(f, "nextNumber")) ?? 0,
        controlMode: mode,
        controlPrefix: get(f, "controlPrefix"),
        nextControl: n(get(f, "nextControl")),
        controlTo: n(get(f, "controlTo")),
      }),
    );
  }
  const idp = values.id;
  return (
    <form onSubmit={submit} method="post" className={cn(card, "space-y-3 p-5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{values.label}</h3>
        <span className="text-xs text-muted">{values.lastIssued ? `Último emitido: N.º ${values.lastIssued}` : "Sin documentos todavía"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`series-${idp}`}>Serie (opcional)</label>
          <input id={`series-${idp}`} name="series" defaultValue={values.series} maxLength={3} placeholder="Sin serie" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`next-${idp}`}>Próximo número</label>
          <input id={`next-${idp}`} name="nextNumber" inputMode="numeric" defaultValue={values.nextNumber} className={inputClass} />
        </div>
      </div>
      {values.controlEditable ? (
        <fieldset>
          <legend className={labelClass}>Número de control (lo comparten facturas y notas)</legend>
          <div className="space-y-1.5">
            {(Object.keys(CONTROL_MODE) as ControlMode[]).map((m) => (
              <label key={m} className={cn("flex gap-2 rounded-lg border p-2.5 text-sm", mode === m ? "border-brand bg-brand-soft" : "border-line")}>
                <input type="radio" name={`mode-${idp}`} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5" />
                <span>
                  <b>{CONTROL_MODE[m].label}</b>
                  <span className="block text-xs text-muted">{CONTROL_MODE[m].help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-muted">Número de control: {CONTROL_MODE[mode].label.toLowerCase()}, el mismo de las facturas (un solo consecutivo para todos los documentos).</p>
      )}
      {values.controlEditable && mode === "FREE_FORM" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor={`prefix-${idp}`}>Prefijo</label>
            <input id={`prefix-${idp}`} name="controlPrefix" defaultValue={values.controlPrefix || "00-"} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor={`from-${idp}`}>Siguiente a usar</label>
            <input id={`from-${idp}`} name="nextControl" inputMode="numeric" defaultValue={values.nextControl ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor={`to-${idp}`}>Último del rango</label>
            <input id={`to-${idp}`} name="controlTo" inputMode="numeric" defaultValue={values.controlTo ?? ""} className={inputClass} />
          </div>
        </div>
      ) : null}
      <Feedback value={feedback} />
      <button disabled={pending} className={buttonSecondary}>{pending ? "Guardando…" : "Guardar numeración"}</button>
    </form>
  );
}

