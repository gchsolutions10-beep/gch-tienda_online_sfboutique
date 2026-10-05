import type { InvoiceLine, InvoiceType } from "@/lib/invoicing";
import { INVOICE_TYPE } from "@/lib/invoicing";
import { formatRate, formatUsd, formatVes } from "@/lib/money";

export type DocumentData = {
  type: InvoiceType;
  /** null en la vista previa (aún sin número) */
  number: string | null;
  controlNumber: string | null;
  /** Texto si el número de control está pendiente o no aplica */
  controlNote: string | null;
  issuedAt: Date;
  voided: { at: Date | null; reason: string | null } | null;
  issuer: { legalName: string; rif: string; address: string; phone: string | null; email: string | null; logoUrl: string | null };
  buyer: { name: string; id: string | null; address: string | null; phone: string | null; email: string | null };
  /** Factura afectada (notas) */
  affects: { number: string; controlNumber: string | null; date: Date } | null;
  concept: string | null;
  orderNumber: number;
  lines: InvoiceLine[];
  taxableVes: number;
  exemptVes: number;
  ivaRateBp: number;
  ivaVes: number;
  igtfBaseVes: number;
  igtfVes: number;
  totalVes: number;
  bcvRate: number;
  totalUsd: number;
};

const date = (d: Date) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Caracas" });
const time = (d: Date) => d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });

/**
 * Factura o nota imprimible (carta, blanco y negro). Lleva los datos que pide
 * la Providencia 0071: emisor con RIF y domicilio, número y número de control,
 * fecha, comprador con cédula/RIF, renglones con (E) en lo exento, base, IVA,
 * IGTF aparte, total en Bs y referencia en USD con la tasa BCV usada.
 */
export function InvoiceDocument({ d }: { d: DocumentData }) {
  const title = INVOICE_TYPE[d.type].label;
  const pct = (bp: number) => `${(bp / 100).toLocaleString("es-VE")} %`;
  return (
    <article className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-white p-6 text-[13px] leading-snug text-black print:max-w-none print:rounded-none print:border-0 print:p-0">
      {d.voided ? (
        <p aria-hidden className="pointer-events-none absolute inset-0 grid -rotate-12 place-items-center font-display text-7xl font-black text-red-600/20">ANULADA</p>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="flex items-start gap-3">
          {d.issuer.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del negocio
            <img src={d.issuer.logoUrl} alt="" className="size-14 object-contain" />
          ) : null}
          <div>
            <p className="text-base font-bold uppercase">{d.issuer.legalName}</p>
            <p className="font-semibold">RIF: {d.issuer.rif}</p>
            <p className="max-w-sm">Domicilio fiscal: {d.issuer.address}</p>
            {d.issuer.phone || d.issuer.email ? <p>{[d.issuer.phone, d.issuer.email].filter(Boolean).join(" · ")}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-black uppercase">{title}</p>
          <p>
            N.º <b>{d.number ?? "— (vista previa)"}</b>
          </p>
          <p>
            N.º de control: <b>{d.controlNumber ?? d.controlNote ?? "—"}</b>
          </p>
          <p>
            Fecha: <b>{date(d.issuedAt)}</b> · {time(d.issuedAt)}
          </p>
        </div>
      </header>

      <section className="grid gap-1 border-b border-black/30 py-3 sm:grid-cols-2">
        <p>
          <span className="text-black/60">Nombre o razón social:</span> <b>{d.buyer.name}</b>
        </p>
        <p>
          <span className="text-black/60">Cédula / RIF:</span> <b>{d.buyer.id ?? "—"}</b>
        </p>
        {d.buyer.address ? (
          <p className="sm:col-span-2">
            <span className="text-black/60">Domicilio:</span> {d.buyer.address}
          </p>
        ) : null}
        {d.buyer.phone || d.buyer.email ? (
          <p className="sm:col-span-2">
            <span className="text-black/60">Contacto:</span> {[d.buyer.phone, d.buyer.email].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {d.affects ? (
          <p className="sm:col-span-2">
            <span className="text-black/60">Factura afectada:</span> <b>N.º {d.affects.number}</b>
            {d.affects.controlNumber ? ` · control ${d.affects.controlNumber}` : ""} · del {date(d.affects.date)}
          </p>
        ) : null}
        {d.concept ? (
          <p className="sm:col-span-2">
            <span className="text-black/60">Motivo:</span> {d.concept}
          </p>
        ) : null}
        <p className="text-black/60 sm:col-span-2">Pedido #{d.orderNumber}</p>
      </section>

      <table className="mt-3 w-full">
        <thead>
          <tr className="border-b border-black text-left text-[11px] uppercase">
            <th className="py-1 pr-2 text-right">Cant.</th>
            <th className="py-1 pr-2">Descripción</th>
            <th className="py-1 pr-2 text-right">Precio unit. Bs</th>
            <th className="py-1 text-right">Monto Bs</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className="border-b border-black/10 align-top">
              <td className="py-1 pr-2 text-right">{l.quantity}</td>
              <td className="py-1 pr-2">
                {l.description}
                {l.exempt ? " (E)" : ""}
              </td>
              <td className="py-1 pr-2 text-right">{formatVes(l.unitVes).replace("Bs. ", "")}</td>
              <td className="py-1 text-right">{formatVes(l.baseVes).replace("Bs. ", "")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xs space-y-1 text-[11px] text-black/70">
          {d.lines.some((l) => l.exempt) ? <p>(E) Exento o no sujeto al IVA.</p> : null}
          <p>
            Tasa de cambio BCV: {formatRate(d.bcvRate)} por USD. Equivalente referencial: {formatUsd(d.totalUsd)}.
          </p>
          {d.igtfVes ? <p>El IGTF se calcula sobre el monto pagado en divisas y no forma parte de la base imponible del IVA.</p> : null}
        </div>
        <dl className="w-72 space-y-0.5">
          <Row label="Exento / no sujeto" value={d.exemptVes} />
          <Row label="Base imponible" value={d.taxableVes} />
          <Row label={`IVA ${pct(d.ivaRateBp)}`} value={d.ivaVes} />
          {d.igtfVes ? (
            <>
              <Row label="Subtotal" value={d.taxableVes + d.exemptVes + d.ivaVes} strong />
              <Row label={`IGTF ${d.igtfBaseVes ? pct(Math.round((d.igtfVes * 10_000) / d.igtfBaseVes)) : ""} s/ ${formatVes(d.igtfBaseVes)}`} value={d.igtfVes} />
            </>
          ) : null}
          <div className="flex justify-between border-t-2 border-black pt-1 text-base font-black">
            <dt>TOTAL Bs</dt>
            <dd>{formatVes(d.totalVes).replace("Bs. ", "")}</dd>
          </div>
        </dl>
      </div>

      {d.voided ? (
        <p className="mt-4 rounded-lg border border-red-600 p-2 text-red-700">
          Documento anulado{d.voided.at ? ` el ${date(d.voided.at)}` : ""}
          {d.voided.reason ? `: ${d.voided.reason}` : ""}.
        </p>
      ) : null}
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between border-t border-black/30 pt-0.5 font-semibold" : "flex justify-between"}>
      <dt>{label}</dt>
      <dd>{formatVes(value).replace("Bs. ", "")}</dd>
    </div>
  );
}
