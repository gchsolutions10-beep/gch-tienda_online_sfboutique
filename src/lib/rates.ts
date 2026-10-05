import { parseAmount } from "@/lib/money";

/**
 * Reglas puras de las tasas de cambio (Bs por 1 USD).
 * - BCV: la oficial; es la que va a los libros y a la factura.
 * - P2P: la del mercado (USDT/efectivo); solo para gestión y reportes.
 */

/** Cambio porcentual entre dos tasas (0.05 = +5 %). */
export function rateChange(previous: number, next: number): number {
  return previous > 0 ? (next - previous) / previous : 0;
}

/** Brecha entre P2P y BCV (0.18 = la P2P está 18 % por encima). */
export function spread(bcv: number, p2p: number): number {
  return bcv > 0 ? (p2p - bcv) / bcv : 0;
}

/** ¿Hay que actualizar la tasa? (más de 24 h sin cambio). */
export function isStale(effectiveAt: Date, now = new Date(), hours = 24): boolean {
  return now.getTime() - effectiveAt.getTime() > hours * 3_600_000;
}

/** Un salto mayor a este límite pide confirmación (posible error de tipeo, ej. 1825 en vez de 182.5). */
export const SUSPICIOUS_CHANGE = 0.2;

/** "182,25" | "182.25" | "1.182,25" → 182.25 (formato venezolano o internacional). */
export function parseRate(input: string): number | null {
  const n = parseAmount(input);
  return n !== null && n > 0 && n < 100_000_000 ? Math.round(n * 1_000_000) / 1_000_000 : null;
}

export const percent = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`;
