/**
 * Dinero sin errores de redondeo: todo se maneja en CENTAVOS enteros
 * (USD y Bs tienen 2 decimales). Las tasas son números con hasta 6 decimales.
 */
export type DecimalLike = { toString(): string } | number | string;

/** "12.5" | Decimal | 12.5 → 1250 (redondeo half-up). */
export function toCents(value: DecimalLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const str = typeof value === "number" ? value.toFixed(2) : value.toString().trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) throw new Error(`Monto inválido: ${str}`);
  const [, sign, int, frac = ""] = match;
  const cents = Number(int) * 100 + Number((frac + "00").slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return sign ? -cents : cents;
}

/** 1250 → "12.50" (para guardar en columnas Decimal). */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Convierte USD a Bs con la tasa (Bs por 1 USD). */
export function usdToVesCents(usdCents: number, rate: number): number {
  return Math.round(usdCents * rate);
}

/** Convierte Bs a USD con la tasa (Bs por 1 USD). */
export function vesToUsdCents(vesCents: number, rate: number): number {
  if (!(rate > 0)) throw new Error("Tasa inválida");
  return Math.round(vesCents / rate);
}

const number = (cents: number) =>
  new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

/** 2550 → "$25,00" */
export function formatUsd(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${number(Math.abs(cents))}`;
}

/** 123456 → "Bs. 1.234,56" */
export function formatVes(cents: number): string {
  return `${cents < 0 ? "-" : ""}Bs. ${number(Math.abs(cents))}`;
}

/** 2550 en USDT → "25,00 USDT" */
export function formatUsdt(cents: number): string {
  return `${number(cents)} USDT`;
}

export type Currency = "VES" | "USD" | "USDT";

export function formatMoney(cents: number, currency: Currency): string {
  return currency === "VES" ? formatVes(cents) : currency === "USD" ? formatUsd(cents) : formatUsdt(cents);
}

/** Tasa legible: 36.5 → "Bs. 36,50" (4 decimales si hacen falta). */
export function formatRate(rate: number): string {
  return `Bs. ${new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate)}`;
}

/**
 * Lee un monto escrito como en Venezuela o en formato internacional:
 * "1.234,56" · "3.650" (miles) · "182,25" · "182.25" → número.
 */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/\s|Bs\.?|\$/gi, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
