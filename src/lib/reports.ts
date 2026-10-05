/**
 * Reportes de gestión (puros, sin BD): periodos en hora de Caracas, márgenes,
 * comparación con el periodo anterior y el valor real de lo cobrado en Bs
 * (tasa BCV de los libros vs. tasa P2P del mercado). Montos en centavos de USD.
 */

const DAY = 86_400_000;
/** Caracas es UTC−4 todo el año (sin horario de verano). */
const OFFSET = 4 * 3_600_000;

export type PeriodKey = "hoy" | "7d" | "30d" | "mes" | "mes-pasado" | "rango";
export const PERIODS: { key: Exclude<PeriodKey, "rango">; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "mes", label: "Este mes" },
  { key: "mes-pasado", label: "Mes pasado" },
];

export type Range = { from: Date; to: Date; label: string };

/** Medianoche (Caracas) del día de `d`. */
export function caracasMidnight(d: Date): Date {
  const local = new Date(d.getTime() - OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET);
}

/** "2026-10-05" (Caracas) de una fecha. */
export function caracasDate(d: Date): string {
  return new Date(d.getTime() - OFFSET).toISOString().slice(0, 10);
}

const parseDay = (s: string | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00-04:00`);
  return Number.isNaN(d.getTime()) || caracasDate(d) !== s ? null : d;
};

/** Periodo pedido → [from, to) en UTC. `to` es exclusivo. Rango personalizado: máx. 366 días. */
export function periodRange(key: string | undefined, now = new Date(), custom?: { desde?: string; hasta?: string }): Range & { key: PeriodKey } {
  const today = caracasMidnight(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const local = new Date(today.getTime() - OFFSET);
  const monthStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + OFFSET);
  switch (key) {
    case "hoy":
      return { key, from: today, to: tomorrow, label: "Hoy" };
    case "7d":
      return { key, from: new Date(tomorrow.getTime() - 7 * DAY), to: tomorrow, label: "Últimos 7 días" };
    case "mes":
      return { key, from: monthStart, to: tomorrow, label: "Este mes" };
    case "mes-pasado": {
      const prev = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) + OFFSET);
      return { key, from: prev, to: monthStart, label: "Mes pasado" };
    }
    case "rango": {
      const from = parseDay(custom?.desde);
      const until = parseDay(custom?.hasta);
      if (from && until && until >= from && until.getTime() - from.getTime() <= 366 * DAY) {
        return { key, from, to: new Date(until.getTime() + DAY), label: `Del ${custom!.desde} al ${custom!.hasta}` };
      }
      break;
    }
  }
  return { key: "30d", from: new Date(tomorrow.getTime() - 30 * DAY), to: tomorrow, label: "Últimos 30 días" };
}

/** El periodo anterior de la misma duración (para comparar). */
export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: r.from, label: "periodo anterior" };
}

/** Cambio relativo (0.25 = +25 %); null si no hay base para comparar. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

/** Días del periodo ("2026-10-01"…), para la serie diaria. Máx. 366. */
export function daysOf(r: Range): string[] {
  const out: string[] = [];
  for (let t = r.from.getTime(); t < r.to.getTime() && out.length < 366; t += DAY) out.push(caracasDate(new Date(t)));
  return out;
}

/** Suma por día (Caracas), con los días sin ventas en cero. */
export function dailySeries(r: Range, rows: { at: Date; cents: number }[]): { day: string; cents: number; count: number }[] {
  const map = new Map(daysOf(r).map((d) => [d, { day: d, cents: 0, count: 0 }]));
  for (const row of rows) {
    const e = map.get(caracasDate(row.at));
    if (e) {
      e.cents += row.cents;
      e.count += 1;
    }
  }
  return [...map.values()];
}

export type SoldLine = {
  productId: string | null;
  name: string;
  category: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  /** Venta sin IVA (base), en centavos de USD */
  baseCents: number;
  /** Costo unitario del producto (null si no está cargado) */
  unitCostCents: number | null;
};

export type Margin = { salesCents: number; costCents: number; profitCents: number; margin: number | null; withoutCost: number };

/**
 * Utilidad bruta sobre la venta sin IVA. Solo cuenta las líneas con costo
 * cargado; `withoutCost` dice cuántas unidades quedaron fuera.
 */
export function marginOf(lines: SoldLine[]): Margin {
  let salesCents = 0;
  let costCents = 0;
  let withoutCost = 0;
  for (const l of lines) {
    if (l.unitCostCents === null) {
      withoutCost += l.quantity;
      continue;
    }
    salesCents += l.baseCents;
    costCents += l.unitCostCents * l.quantity;
  }
  const profitCents = salesCents - costCents;
  return { salesCents, costCents, profitCents, margin: salesCents > 0 ? profitCents / salesCents : null, withoutCost };
}

export type Ranked = { key: string; label: string; quantity: number; baseCents: number; profitCents: number | null };

/** Agrupa lo vendido (producto, categoría, talla o color) y ordena por venta. */
export function rankBy(lines: SoldLine[], keyOf: (l: SoldLine) => string | null, limit = 10): Ranked[] {
  const map = new Map<string, Ranked & { missingCost: boolean }>();
  for (const l of lines) {
    const key = keyOf(l);
    if (!key) continue;
    const e = map.get(key) ?? { key, label: key, quantity: 0, baseCents: 0, profitCents: 0, missingCost: false };
    e.quantity += l.quantity;
    e.baseCents += l.baseCents;
    if (l.unitCostCents === null) e.missingCost = true;
    else e.profitCents = (e.profitCents ?? 0) + l.baseCents - l.unitCostCents * l.quantity;
    map.set(key, e);
  }
  return [...map.values()]
    .map(({ missingCost, ...r }) => ({ ...r, profitCents: missingCost ? null : r.profitCents }))
    .sort((a, b) => b.baseCents - a.baseCents || b.quantity - a.quantity)
    .slice(0, limit);
}

/** Tasa vigente en una fecha (la más reciente que ya regía). `history` en orden ascendente. */
export function rateAt(history: { effectiveAt: Date; rate: number }[], at: Date): number | null {
  let found: number | null = null;
  for (const h of history) {
    if (h.effectiveAt.getTime() <= at.getTime()) found = h.rate;
    else break;
  }
  return found;
}

/**
 * Lo cobrado en bolívares: cuánto vale en USD a la tasa BCV (lo que dicen los
 * libros) y a la P2P del día de cada pago (lo que de verdad se puede comprar
 * en divisas). La diferencia es la pérdida (o ganancia) cambiaria.
 */
export function vesRealValue(payments: { at: Date; vesCents: number }[], p2pHistory: { effectiveAt: Date; rate: number }[], bcvHistory: { effectiveAt: Date; rate: number }[]) {
  let vesCents = 0;
  let atBcvUsd = 0;
  let atP2pUsd = 0;
  let withoutP2p = 0;
  for (const p of payments) {
    const bcv = rateAt(bcvHistory, p.at);
    const p2p = rateAt(p2pHistory, p.at);
    if (!bcv) continue;
    if (!p2p) {
      withoutP2p += 1;
      continue;
    }
    vesCents += p.vesCents;
    atBcvUsd += Math.round(p.vesCents / bcv);
    atP2pUsd += Math.round(p.vesCents / p2p);
  }
  return { vesCents, atBcvUsd, atP2pUsd, differenceUsd: atP2pUsd - atBcvUsd, withoutP2p };
}

/** Prendas con stock que no se venden hace `days` días (o nunca). */
export function slowMovers<T extends { stock: number; lastSoldAt: Date | null; createdAt: Date }>(items: T[], now = new Date(), days = 60): T[] {
  const limit = now.getTime() - days * DAY;
  return items
    .filter((i) => i.stock > 0 && (i.lastSoldAt ?? i.createdAt).getTime() < limit)
    .sort((a, b) => (a.lastSoldAt ?? a.createdAt).getTime() - (b.lastSoldAt ?? b.createdAt).getTime());
}
