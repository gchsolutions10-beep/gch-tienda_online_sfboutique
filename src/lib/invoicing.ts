/**
 * Facturación de Venezuela (pura, sin BD). Referencia: Providencia SNAT/2011/0071
 * (facturas, notas de crédito y débito, número de control) y Reglamento de la
 * Ley del IVA (libro de ventas). VALIDAR CON EL CONTADOR antes de facturar.
 *
 * - La factura se expresa en bolívares a la tasa BCV del día de emisión; el
 *   monto en USD sale solo como referencia.
 * - El número de control lo asigna una imprenta digital autorizada por el
 *   SENIAT (modo DIGITAL_PRINTER: se anota el que ella devuelve) o viene en
 *   los formatos preimpresos de forma libre (modo FREE_FORM: el sistema toma
 *   el siguiente del rango). El sistema NO sustituye a la imprenta digital.
 * - El IGTF se muestra aparte: no forma parte de la base del IVA.
 * Montos en centavos de Bs (enteros).
 */
import { usdToVesCents } from "@/lib/money";

export type InvoiceType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "DELIVERY_NOTE";
export type ControlMode = "DIGITAL_PRINTER" | "FREE_FORM" | "NONE";

export const INVOICE_TYPE: Record<InvoiceType, { label: string; short: string; bookCode: string }> = {
  INVOICE: { label: "Factura", short: "FAC", bookCode: "01" },
  DEBIT_NOTE: { label: "Nota de débito", short: "N/D", bookCode: "02" },
  CREDIT_NOTE: { label: "Nota de crédito", short: "N/C", bookCode: "03" },
  DELIVERY_NOTE: { label: "Nota de entrega", short: "N/E", bookCode: "" },
};

export const CONTROL_MODE: Record<ControlMode, { label: string; help: string }> = {
  DIGITAL_PRINTER: {
    label: "Imprenta digital autorizada",
    help: "La imprenta digital (autorizada por el SENIAT) asigna el número de control. Emites aquí y anotas el número que ella te devuelve.",
  },
  FREE_FORM: {
    label: "Formatos de forma libre (preimpresos)",
    help: "Usas talonarios o formatos con el número de control ya impreso por una imprenta autorizada. El sistema toma el siguiente número del rango.",
  },
  NONE: {
    label: "Sin número de control",
    help: "Solo para pruebas o documentos internos: sin número de control la factura no tiene validez fiscal.",
  },
};

/** "A", 25 → "A-00000025"; sin serie → "00000025". */
export function formatInvoiceNumber(series: string, number: number): string {
  const n = String(number).padStart(8, "0");
  return series ? `${series}-${n}` : n;
}

/** "00-", 1234 → "00-00001234". */
export function formatControlNumber(prefix: string | null, number: number): string {
  return `${prefix ?? "00-"}${String(number).padStart(8, "0")}`;
}

export type ControlState = { controlMode: ControlMode; controlPrefix: string | null; nextControl: number | null; controlTo: number | null };

/**
 * Número de control para el próximo documento. Forma libre: el siguiente del
 * rango (error si se acabó). Imprenta digital y sin control: null (se anota después
 * o no aplica).
 */
export function takeControlNumber(s: ControlState): { ok: true; control: string | null; next: number | null } | { ok: false; error: string } {
  if (s.controlMode !== "FREE_FORM") return { ok: true, control: null, next: s.nextControl };
  if (!s.nextControl) return { ok: false, error: "Configura el rango de números de control de tus formatos (Facturación > Configuración)." };
  if (s.controlTo !== null && s.nextControl > s.controlTo) {
    return { ok: false, error: "Se acabaron los números de control de tus formatos. Pide más a la imprenta y carga el nuevo rango." };
  }
  return { ok: true, control: formatControlNumber(s.controlPrefix, s.nextControl), next: s.nextControl + 1 };
}

/** Números de control que quedan en el rango de forma libre (null si no aplica). */
export function controlNumbersLeft(s: ControlState): number | null {
  if (s.controlMode !== "FREE_FORM" || !s.nextControl || s.controlTo === null) return null;
  return Math.max(0, s.controlTo - s.nextControl + 1);
}

// ───────────────────────────── Montos ─────────────────────────────

/** Renglón del documento (copia fija: no cambia aunque cambie el producto). */
export type InvoiceLine = {
  description: string;
  quantity: number;
  /** Precio unitario sin IVA, en Bs */
  unitVes: number;
  /** Base del renglón (cantidad × precio, menos descuento), sin IVA, en Bs */
  baseVes: number;
  /** Exento o no sujeto a IVA: se marca (E) en la factura */
  exempt: boolean;
  /** En notas de crédito: renglón de la factura original que se devuelve */
  ref?: number;
};

export type InvoiceAmounts = {
  lines: InvoiceLine[];
  /** Base imponible (gravada) */
  taxableVes: number;
  /** Exento / no sujeto */
  exemptVes: number;
  ivaRateBp: number;
  ivaVes: number;
  /** Monto pagado en divisas sobre el que se calcula el IGTF */
  igtfBaseVes: number;
  igtfVes: number;
  /** Total a pagar: base + exento + IVA + IGTF */
  totalVes: number;
};

function totals(lines: InvoiceLine[], ivaRateBp: number, igtfBaseVes = 0, igtfVes = 0): InvoiceAmounts {
  const taxableVes = lines.filter((l) => !l.exempt).reduce((a, l) => a + l.baseVes, 0);
  const exemptVes = lines.filter((l) => l.exempt).reduce((a, l) => a + l.baseVes, 0);
  // El IVA se calcula sobre la base total en Bs: así base × alícuota cuadra en la factura.
  const ivaVes = Math.round((taxableVes * ivaRateBp) / 10_000);
  return { lines, taxableVes, exemptVes, ivaRateBp, ivaVes, igtfBaseVes, igtfVes, totalVes: taxableVes + exemptVes + ivaVes + igtfVes };
}

export type OrderLineForInvoice = { description: string; quantity: number; baseUsdCents: number; exempt: boolean };

/**
 * Montos de la factura de un pedido, convertidos a Bs con la tasa BCV del día
 * de emisión. El envío va como renglón no sujeto a IVA (igual que en el pedido).
 */
export function invoiceFromOrder(
  lines: OrderLineForInvoice[],
  o: { shippingUsdCents: number; ivaRateBp: number; igtfUsdCents: number; igtfBaseUsdCents: number; bcvRate: number },
): InvoiceAmounts {
  const out: InvoiceLine[] = lines.map((l) => {
    const baseVes = usdToVesCents(l.baseUsdCents, o.bcvRate);
    return { description: l.description, quantity: l.quantity, unitVes: Math.round(baseVes / Math.max(1, l.quantity)), baseVes, exempt: l.exempt || o.ivaRateBp === 0 };
  });
  if (o.shippingUsdCents > 0) {
    const baseVes = usdToVesCents(o.shippingUsdCents, o.bcvRate);
    out.push({ description: "Envío", quantity: 1, unitVes: baseVes, baseVes, exempt: true });
  }
  return totals(out, o.ivaRateBp, usdToVesCents(o.igtfBaseUsdCents, o.bcvRate), usdToVesCents(o.igtfUsdCents, o.bcvRate));
}

/**
 * Nota de crédito (devolución o descuento posterior) sobre una factura: por
 * cada renglón, la cantidad que se devuelve. Usa los mismos precios en Bs de la
 * factura original (misma tasa). El IGTF ya pagado no se acredita.
 */
export function creditNoteFrom(original: InvoiceLine[], quantities: number[], ivaRateBp: number): InvoiceAmounts {
  const lines = original.flatMap((l, i): InvoiceLine[] => {
    const q = Math.min(l.quantity, Math.max(0, Math.floor(quantities[i] ?? 0)));
    if (q <= 0) return [];
    const baseVes = q === l.quantity ? l.baseVes : Math.round((l.baseVes * q) / l.quantity);
    return [{ ...l, quantity: q, unitVes: Math.round(baseVes / q), baseVes, ref: i }];
  });
  return totals(lines, ivaRateBp);
}

/** Nota de débito (cargo adicional sobre una factura): un concepto y su base en Bs. */
export function debitNoteFrom(concept: string, baseVes: number, exempt: boolean, ivaRateBp: number): InvoiceAmounts {
  return totals([{ description: concept, quantity: 1, unitVes: baseVes, baseVes, exempt }], exempt ? 0 : ivaRateBp);
}

/** Lo que ya se acreditó de cada renglón en notas de crédito previas (para no devolver dos veces). */
export function creditedQuantities(original: InvoiceLine[], notes: InvoiceLine[][]): number[] {
  return original.map((_, i) => notes.flat().reduce((a, x) => a + (x.ref === i ? x.quantity : 0), 0));
}

/** Lee los renglones guardados (JSON) sin confiar en su forma. */
export function parseLines(json: unknown): InvoiceLine[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null)
    .map((l) => ({
      description: String(l.description ?? ""),
      quantity: Number(l.quantity) || 0,
      unitVes: Number(l.unitVes) || 0,
      baseVes: Number(l.baseVes) || 0,
      exempt: Boolean(l.exempt),
      ...(typeof l.ref === "number" ? { ref: l.ref } : {}),
    }));
}

// ───────────────────────────── Libro de ventas ─────────────────────────────

export type BookDocument = {
  issuedAt: Date;
  type: InvoiceType;
  number: string;
  controlNumber: string | null;
  buyerName: string;
  buyerId: string | null;
  /** Número de la factura afectada (notas) */
  affects: string | null;
  voided: boolean;
  taxableVes: number;
  exemptVes: number;
  ivaRateBp: number;
  ivaVes: number;
  igtfVes: number;
  totalVes: number;
};

export type BookRow = BookDocument & {
  /** 01 registro · 02 complemento (nota de débito) · 03 anulación (nota de crédito, documento anulado) */
  transaction: "01" | "02" | "03";
  /** Total de ventas con IVA (sin IGTF), con signo */
  totalSalesVes: number;
  sign: 1 | -1;
};

/**
 * Renglones del libro de ventas: las notas de crédito restan y los documentos
 * anulados salen con montos en cero (se registran para no dejar saltos en la numeración).
 */
export function salesBookRows(docs: BookDocument[]): BookRow[] {
  return docs
    .filter((d) => d.type !== "DELIVERY_NOTE")
    .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
    .map((d) => {
      const sign: 1 | -1 = d.type === "CREDIT_NOTE" ? -1 : 1;
      const z = (n: number) => (d.voided ? 0 : sign * n);
      return {
        ...d,
        sign,
        transaction: d.voided || d.type === "CREDIT_NOTE" ? "03" : d.type === "DEBIT_NOTE" ? "02" : "01",
        taxableVes: z(d.taxableVes),
        exemptVes: z(d.exemptVes),
        ivaVes: z(d.ivaVes),
        igtfVes: z(d.igtfVes),
        totalVes: z(d.totalVes),
        totalSalesVes: z(d.taxableVes + d.exemptVes + d.ivaVes),
      };
    });
}

export function salesBookTotals(rows: BookRow[]) {
  const sum = (k: "taxableVes" | "exemptVes" | "ivaVes" | "igtfVes" | "totalSalesVes") => rows.reduce((a, r) => a + r[k], 0);
  return {
    documents: rows.length,
    taxableVes: sum("taxableVes"),
    exemptVes: sum("exemptVes"),
    ivaVes: sum("ivaVes"),
    igtfVes: sum("igtfVes"),
    totalSalesVes: sum("totalSalesVes"),
  };
}

/** "2026-10" → inicio y fin del mes en hora de Caracas (UTC−4, sin horario de verano). */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { from: new Date(Date.UTC(y, mo - 1, 1, 4)), to: new Date(Date.UTC(y, mo, 1, 4)) };
}

/** Mes actual en Caracas: "2026-10". */
export function currentMonth(now = new Date()): string {
  const d = new Date(now.getTime() - 4 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
