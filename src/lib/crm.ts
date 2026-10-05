/**
 * Segmentación automática del CRM (pura). Las etiquetas manuales
 * (ej. "Mayorista") conviven con estas.
 */
export type AutoSegment = "VIP" | "RECURRENT" | "NEW" | "INACTIVE";

export const SEGMENT_LABEL: Record<AutoSegment, string> = {
  VIP: "Cliente VIP",
  RECURRENT: "Recurrente",
  NEW: "Nuevo",
  INACTIVE: "Inactivo",
};

export type SegmentRules = { vipMinSpentUsdCents: number; recurrentMinOrders: number; inactiveAfterDays: number; newWithinDays?: number };

export type CustomerStats = { ordersCount: number; totalSpentUsdCents: number; firstOrderAt: Date | null; lastOrderAt: Date | null };

const DAY = 24 * 60 * 60 * 1000;

/** Segmentos que le corresponden a un cliente hoy. */
export function autoSegments(c: CustomerStats, rules: SegmentRules, now = new Date()): AutoSegment[] {
  const out: AutoSegment[] = [];
  if (c.ordersCount > 0 && c.totalSpentUsdCents >= rules.vipMinSpentUsdCents) out.push("VIP");
  if (c.ordersCount >= rules.recurrentMinOrders) out.push("RECURRENT");
  if (c.ordersCount <= 1 && c.firstOrderAt && now.getTime() - c.firstOrderAt.getTime() <= (rules.newWithinDays ?? 30) * DAY) out.push("NEW");
  if (c.lastOrderAt && now.getTime() - c.lastOrderAt.getTime() > rules.inactiveAfterDays * DAY) out.push("INACTIVE");
  return out;
}

/** Cada cuántos días compra en promedio (null si tiene menos de 2 compras). */
export function purchaseFrequencyDays(c: CustomerStats): number | null {
  if (c.ordersCount < 2 || !c.firstOrderAt || !c.lastOrderAt) return null;
  return Math.round((c.lastOrderAt.getTime() - c.firstOrderAt.getTime()) / DAY / (c.ordersCount - 1));
}

/** El método de pago que más se repite. */
export function favoriteMethod<T extends string>(methods: T[]): T | null {
  const count = new Map<T, number>();
  for (const m of methods) count.set(m, (count.get(m) ?? 0) + 1);
  let best: T | null = null;
  for (const [m, n] of count) if (best === null || n > count.get(best)!) best = m;
  return best;
}
