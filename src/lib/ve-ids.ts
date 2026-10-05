/**
 * Documentos y teléfonos de Venezuela.
 * - Cédula: V o E + 6 a 9 dígitos.
 * - RIF: letra (V, E, J, G, P, C) + 8 dígitos + dígito verificador (algoritmo del SENIAT).
 * - Teléfonos móviles: 0412, 0414, 0416, 0424, 0426, 0422 → +58 4xx xxx xxxx.
 */
export type IdType = "V" | "E" | "J" | "G" | "P" | "C";

const LETTER_VALUE: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5, C: 3 };
const WEIGHTS = [4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador del RIF para letra + 8 dígitos. */
export function rifCheckDigit(type: IdType, eightDigits: string): number {
  const values = [LETTER_VALUE[type], ...eightDigits.split("").map(Number)];
  const sum = values.reduce((acc, v, i) => acc + v * WEIGHTS[i], 0);
  const digit = 11 - (sum % 11);
  return digit >= 10 ? 0 : digit;
}

export type ParsedId = { type: IdType; number: string; display: string; isRif: boolean };

/**
 * Acepta "V-12345678", "v12.345.678", "J-40123456-7", "J401234567"…
 * Devuelve null si no es válido (incluido un RIF con dígito verificador errado).
 */
export function parseVeId(input: string): ParsedId | null {
  const clean = input.toUpperCase().replace(/[\s.\-]/g, "");
  const m = /^([VEJGPC])(\d{6,9})$/.exec(clean);
  if (!m) return null;
  const type = m[1] as IdType;
  const digits = m[2];

  // Cédula de persona natural: V o E con hasta 8 dígitos (sin dígito verificador).
  if ((type === "V" || type === "E") && digits.length <= 8) {
    return { type, number: digits, display: `${type}-${Number(digits).toLocaleString("es-VE")}`, isRif: false };
  }
  // RIF: 8 dígitos + dígito verificador del SENIAT.
  if (digits.length !== 9) return null;
  const body = digits.slice(0, 8);
  const check = Number(digits[8]);
  if (rifCheckDigit(type, body) !== check) return null;
  return { type, number: digits, display: `${type}-${body}-${check}`, isRif: true };
}

const MOBILE_PREFIXES = ["412", "414", "416", "422", "424", "426"];

/** Normaliza a +58XXXXXXXXXX. Acepta "0414-1234567", "+58 414 1234567", "4141234567". */
export function normalizeVePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("58") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length !== 10) return null;
  const isMobile = MOBILE_PREFIXES.includes(d.slice(0, 3));
  const isLandline = d.startsWith("2");
  if (!isMobile && !isLandline) return null;
  return `+58${d}`;
}

/** +584141234567 → "0414-123.45.67" */
export function formatVePhone(e164: string): string {
  const d = e164.replace(/^\+58/, "");
  if (d.length !== 10) return e164;
  return `0${d.slice(0, 3)}-${d.slice(3, 6)}.${d.slice(6, 8)}.${d.slice(8)}`;
}

/** Enlace de WhatsApp (wa.me) para un teléfono normalizado. */
export function whatsappLink(e164: string, text?: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** "V", "12345678" → "V-12345678"; un RIF de 9 dígitos → "J-40123456-0". */
export function formatVeId(type: string | null, number: string): string {
  const t = type ?? "V";
  return number.length === 9 ? `${t}-${number.slice(0, 8)}-${number[8]}` : `${t}-${number}`;
}
