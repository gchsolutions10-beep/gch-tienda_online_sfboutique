/**
 * Caja multimoneda (pura, sin BD): ventas en tienda con pagos mixtos,
 * vuelto y cierre por cuenta y por moneda.
 */
import { usdToVesCents, vesToUsdCents, type Currency } from "@/lib/money";
import { splitIgtf } from "@/lib/tax-ve";

export type AccountKind = "BANK_VES" | "PAGO_MOVIL" | "POS_TERMINAL" | "CASH_VES" | "CASH_USD" | "ZELLE" | "BANK_USD" | "CRYPTO_USDT";

/** Las cuentas de efectivo son las que se cuentan billete por billete al cerrar. */
export const isCashAccount = (type: AccountKind) => type === "CASH_VES" || type === "CASH_USD";

/** Valor en USD (centavos) de un monto en su moneda, a la tasa BCV. USDT vale 1:1. */
export function toUsdCents(currency: Currency, cents: number, bcvRate: number): number {
  return currency === "VES" ? vesToUsdCents(cents, bcvRate) : cents;
}

export function fromUsdCents(currency: Currency, usdCents: number, bcvRate: number): number {
  return currency === "VES" ? usdToVesCents(usdCents, bcvRate) : usdCents;
}

export type TenderLine = { currency: Currency; cents: number };

/**
 * Estado del cobro: cuánto falta o cuánto sobra (vuelto) en USD, y el vuelto
 * expresado en la moneda en que se va a devolver.
 *
 * IGTF (si `igtfRateBp` > 0): los pagos en Bs cubren primero; la parte del
 * total que se paga en divisas lleva el IGTF encima. El vuelto no paga IGTF.
 * `igtfByLine` reparte el impuesto entre los pagos en divisas (0 en los de Bs).
 */
export function tenderStatus(totalUsdCents: number, lines: TenderLine[], bcvRate: number, changeCurrency: Currency = "VES", igtfRateBp = 0) {
  const vesUsd = lines.filter((l) => l.currency === "VES").reduce((a, l) => a + toUsdCents(l.currency, l.cents, bcvRate), 0);
  const divisa = lines.filter((l) => l.currency !== "VES").reduce((a, l) => a + l.cents, 0);
  const split = splitIgtf(divisa, totalUsdCents - vesUsd, igtfRateBp);
  const paidUsd = vesUsd + divisa;
  const diff = paidUsd - split.igtf - totalUsdCents;
  // 1 centavo de tolerancia por el redondeo de la conversión.
  const remainingUsd = diff < -1 ? -diff : 0;
  const changeUsd = diff > 1 ? diff : 0;
  return {
    paidUsd,
    igtfUsd: split.igtf,
    /** Parte del total pagada en divisas (base del IGTF) */
    igtfBaseUsd: split.covered,
    igtfByLine: splitDiscount(lines.map((l) => (l.currency === "VES" ? 0 : l.cents)), split.igtf),
    remainingUsd,
    changeUsd,
    change: fromUsdCents(changeCurrency, changeUsd, bcvRate),
    complete: diff >= -1,
  };
}

/** Reparte un descuento total entre las líneas, proporcional a su importe (la última absorbe el redondeo). */
export function splitDiscount(lineGrossCents: number[], discountCents: number): number[] {
  const total = lineGrossCents.reduce((a, b) => a + b, 0);
  if (total <= 0 || discountCents <= 0) return lineGrossCents.map(() => 0);
  const d = Math.min(discountCents, total);
  const out = lineGrossCents.map((g) => Math.floor((g * d) / total));
  // El redondeo va a la última línea con importe (nunca a una en cero).
  const last = lineGrossCents.findLastIndex((g) => g > 0);
  out[last] += d - out.reduce((a, b) => a + b, 0);
  return out;
}

export type ClosingAccount = { id: string; name: string; type: AccountKind; currency: Currency };
export type SessionPayment = { financialAccountId: string | null; currency: Currency; cents: number };
export type SessionMovement = { financialAccountId: string | null; currency: Currency; type: "PAY_IN" | "PAY_OUT"; cents: number };
/** Fondo inicial por moneda: { VES: 50000, USD: 2000 } (centavos) */
export type OpeningFloat = Partial<Record<Currency, number>>;

export type ExpectedLine = {
  accountId: string;
  name: string;
  type: AccountKind;
  currency: Currency;
  isCash: boolean;
  opening: number;
  sales: number;
  payIn: number;
  payOut: number;
  expected: number;
};

/**
 * Lo que debería haber en cada cuenta al cerrar:
 * efectivo = fondo inicial + cobros + entradas − salidas (vuelto incluido);
 * bancos/billeteras = cobros del turno (se comparan con lo que muestra el banco).
 * El fondo inicial de cada moneda va a la primera caja de efectivo de esa moneda.
 */
export function expectedByAccount(accounts: ClosingAccount[], opening: OpeningFloat, payments: SessionPayment[], movements: SessionMovement[]): ExpectedLine[] {
  const floatOwner = new Map<Currency, string>();
  for (const a of accounts) if (isCashAccount(a.type) && !floatOwner.has(a.currency)) floatOwner.set(a.currency, a.id);

  return accounts
    .map((a) => {
      const sales = payments.filter((p) => p.financialAccountId === a.id).reduce((s, p) => s + p.cents, 0);
      const payIn = movements.filter((m) => m.financialAccountId === a.id && m.type === "PAY_IN").reduce((s, m) => s + m.cents, 0);
      const payOut = movements.filter((m) => m.financialAccountId === a.id && m.type === "PAY_OUT").reduce((s, m) => s + m.cents, 0);
      const openingCents = floatOwner.get(a.currency) === a.id ? (opening[a.currency] ?? 0) : 0;
      return {
        accountId: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        isCash: isCashAccount(a.type),
        opening: openingCents,
        sales,
        payIn,
        payOut,
        expected: openingCents + sales + payIn - payOut,
      };
    })
    .filter((l) => l.isCash || l.sales || l.payIn || l.payOut);
}

/** Totales del cierre por moneda (lo esperado y lo contado). */
export function totalsByCurrency(lines: { currency: Currency; expected: number; counted: number }[]) {
  const out: Partial<Record<Currency, { expected: number; counted: number; difference: number }>> = {};
  for (const l of lines) {
    const t = (out[l.currency] ??= { expected: 0, counted: 0, difference: 0 });
    t.expected += l.expected;
    t.counted += l.counted;
    t.difference += l.counted - l.expected;
  }
  return out;
}
