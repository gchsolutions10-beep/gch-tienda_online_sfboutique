/**
 * Métodos de pago de Venezuela y cómo se registran. Cada pago se guarda en
 * su moneda original con la tasa usada y sus equivalentes en USD y en Bs.
 */
import type { Currency } from "@/lib/money";
import { usdToVesCents, vesToUsdCents } from "@/lib/money";

export type PaymentMethod = "PAGO_MOVIL" | "TRANSFER_VES" | "POS_CARD" | "CASH_VES" | "CASH_USD" | "ZELLE" | "TRANSFER_USD" | "USDT";
export type FinancialAccountType = "BANK_VES" | "PAGO_MOVIL" | "POS_TERMINAL" | "CASH_VES" | "CASH_USD" | "ZELLE" | "BANK_USD" | "CRYPTO_USDT";
export type RateSource = "BCV" | "P2P";

export const PAYMENT_METHODS: Record<
  PaymentMethod,
  {
    label: string;
    icon: string;
    currency: Currency;
    /** Cuentas donde puede entrar este pago */
    accountTypes: FinancialAccountType[];
    /** El cliente debe dar un número de referencia */
    needsReference: boolean;
    /** Se puede pagar así en la tienda en línea (los demás, solo en la tienda física) */
    online: boolean;
  }
> = {
  PAGO_MOVIL: { label: "Pago Móvil", icon: "📱", currency: "VES", accountTypes: ["PAGO_MOVIL", "BANK_VES"], needsReference: true, online: true },
  TRANSFER_VES: { label: "Transferencia en Bs", icon: "🏦", currency: "VES", accountTypes: ["BANK_VES"], needsReference: true, online: true },
  POS_CARD: { label: "Punto de venta", icon: "💳", currency: "VES", accountTypes: ["POS_TERMINAL", "BANK_VES"], needsReference: false, online: false },
  CASH_VES: { label: "Efectivo Bs", icon: "💵", currency: "VES", accountTypes: ["CASH_VES"], needsReference: false, online: false },
  CASH_USD: { label: "Efectivo USD", icon: "💵", currency: "USD", accountTypes: ["CASH_USD"], needsReference: false, online: false },
  ZELLE: { label: "Zelle", icon: "⚡", currency: "USD", accountTypes: ["ZELLE", "BANK_USD"], needsReference: true, online: true },
  TRANSFER_USD: { label: "Transferencia en USD", icon: "🏦", currency: "USD", accountTypes: ["BANK_USD"], needsReference: true, online: true },
  USDT: { label: "USDT (Binance Pay)", icon: "🪙", currency: "USDT", accountTypes: ["CRYPTO_USDT"], needsReference: true, online: true },
};

export const ACCOUNT_TYPE_LABEL: Record<FinancialAccountType, string> = {
  BANK_VES: "Cuenta bancaria en Bs",
  PAGO_MOVIL: "Pago Móvil",
  POS_TERMINAL: "Punto de venta",
  CASH_VES: "Caja en Bs",
  CASH_USD: "Caja en USD",
  ZELLE: "Zelle",
  BANK_USD: "Cuenta en USD",
  CRYPTO_USDT: "Billetera USDT",
};

export type Rates = { bcv: number; p2p: number | null };

export type PaymentAmounts = {
  /** Tasa usada (Bs por USD) y de dónde salió */
  rate: number;
  rateSource: RateSource;
  /** Equivalente en USD (reportes de gestión) */
  amountUsdCents: number;
  /** Equivalente en Bs a tasa BCV (libros de venta) */
  amountVesCents: number;
};

/**
 * Equivalentes de un pago:
 * - En Bs: se convierte a USD con la tasa BCV (la oficial).
 * - En USD o USDT: 1 a 1 con el dólar; en Bs se registra a tasa BCV
 *   (para los libros) aunque el negocio use la P2P para su control.
 */
export function paymentAmounts(currency: Currency, amountCents: number, rates: Rates): PaymentAmounts {
  if (currency === "VES") {
    return { rate: rates.bcv, rateSource: "BCV", amountUsdCents: vesToUsdCents(amountCents, rates.bcv), amountVesCents: amountCents };
  }
  return {
    rate: rates.bcv,
    rateSource: "BCV",
    amountUsdCents: amountCents,
    amountVesCents: usdToVesCents(amountCents, rates.bcv),
  };
}

/**
 * Valor de gestión de un monto en Bs según la tasa P2P (lo que "de verdad"
 * vale en divisas). Sirve para comparar en los reportes; no va a los libros.
 */
export function vesValueAtP2p(vesCents: number, rates: Rates): number | null {
  return rates.p2p ? vesToUsdCents(vesCents, rates.p2p) : null;
}

/** Cuánto falta por pagar (en USD) tras varios pagos confirmados. */
export function remainingUsd(totalUsdCents: number, paidUsdCents: number[]): number {
  return Math.max(0, totalUsdCents - paidUsdCents.reduce((a, b) => a + b, 0));
}
