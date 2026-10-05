/**
 * Impuestos de Venezuela (puros, sin BD):
 * - IVA: alícuota general 16 % (configurable). Interruptor global y
 *   productos exentos uno por uno.
 * - IGTF: 3 % sobre pagos en divisas o criptoactivos, solo si aplica al
 *   negocio (configurable). Se cobra sobre el monto pagado en esa moneda.
 * Montos en centavos de USD (la moneda de precio del catálogo).
 */
export type TaxMode = "PRICE_INCLUDES_TAX" | "TAX_ADDED";

export type TaxLine = { unitPriceCents: number; quantity: number; exempt: boolean; discountCents?: number };

export type TaxSettings = { ivaEnabled: boolean; ivaRateBp: number; taxMode: TaxMode };

export type PricedTaxLine = { baseCents: number; ivaCents: number; totalCents: number; ivaRateBp: number };

export type TaxTotals = {
  lines: PricedTaxLine[];
  /** Base imponible (gravada) */
  taxableCents: number;
  /** Ventas exentas */
  exemptCents: number;
  ivaCents: number;
  /** Total de los productos con IVA (sin envío) */
  totalCents: number;
};

/** 0.16 → 1600 puntos básicos */
export function rateToBp(rate: { toString(): string } | number): number {
  return Math.round(Number(rate.toString()) * 10_000);
}

/** Calcula base, IVA y total de cada línea y del pedido. */
export function computeTaxes(lines: TaxLine[], s: TaxSettings): TaxTotals {
  let taxableCents = 0;
  let exemptCents = 0;
  let ivaCents = 0;
  const priced = lines.map((l) => {
    const gross = l.unitPriceCents * l.quantity - (l.discountCents ?? 0);
    const rateBp = s.ivaEnabled && !l.exempt ? s.ivaRateBp : 0;
    let base: number;
    let iva: number;
    if (rateBp === 0) {
      base = gross;
      iva = 0;
    } else if (s.taxMode === "PRICE_INCLUDES_TAX") {
      base = Math.round((gross * 10_000) / (10_000 + rateBp));
      iva = gross - base;
    } else {
      base = gross;
      iva = Math.round((gross * rateBp) / 10_000);
    }
    if (rateBp === 0) exemptCents += base;
    else taxableCents += base;
    ivaCents += iva;
    return { baseCents: base, ivaCents: iva, totalCents: base + iva, ivaRateBp: rateBp };
  });
  return { lines: priced, taxableCents, exemptCents, ivaCents, totalCents: taxableCents + exemptCents + ivaCents };
}

/** ¿Este pago genera IGTF? Solo pagos en divisas o cripto, y solo si el negocio lo tiene activo. */
export function igtfApplies(currency: "VES" | "USD" | "USDT", igtfEnabled: boolean): boolean {
  return igtfEnabled && currency !== "VES";
}

/** IGTF de un pago (en la moneda del pago). */
export function igtfFor(amountCents: number, currency: "VES" | "USD" | "USDT", igtfEnabled: boolean, igtfRateBp: number): number {
  return igtfApplies(currency, igtfEnabled) ? Math.round((amountCents * igtfRateBp) / 10_000) : 0;
}
