import { describe, expect, it } from "vitest";
import { caracasDate, change, dailySeries, marginOf, periodRange, previousRange, rankBy, rateAt, slowMovers, vesRealValue, type SoldLine } from "@/lib/reports";

// 5 de octubre de 2026, 10:00 p. m. en Caracas (ya es 6 de octubre en UTC).
const now = new Date("2026-10-06T02:00:00Z");

describe("periodos en hora de Caracas", () => {
  it("hoy es el día de Caracas aunque en UTC ya sea mañana", () => {
    const r = periodRange("hoy", now);
    expect(r.from.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-06T04:00:00.000Z");
    expect(caracasDate(now)).toBe("2026-10-05");
  });

  it("este mes, mes pasado y por defecto 30 días", () => {
    expect(periodRange("mes", now).from.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    const prev = periodRange("mes-pasado", now);
    expect(prev.from.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(prev.to.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    const def = periodRange("cualquiera", now);
    expect(def.key).toBe("30d");
    expect((def.to.getTime() - def.from.getTime()) / 86_400_000).toBe(30);
  });

  it("rango personalizado (incluye el último día) y rechaza fechas malas", () => {
    const r = periodRange("rango", now, { desde: "2026-09-10", hasta: "2026-09-12" });
    expect(r.key).toBe("rango");
    expect(r.to.toISOString()).toBe("2026-09-13T04:00:00.000Z");
    expect(periodRange("rango", now, { desde: "2026-09-12", hasta: "2026-09-10" }).key).toBe("30d");
    expect(periodRange("rango", now, { desde: "2026-02-30", hasta: "2026-03-01" }).key).toBe("30d");
  });

  it("compara con el periodo anterior de la misma duración", () => {
    const r = periodRange("7d", now);
    const p = previousRange(r);
    expect(p.to).toEqual(r.from);
    expect(r.from.getTime() - p.from.getTime()).toBe(7 * 86_400_000);
    expect(change(150, 100)).toBe(0.5);
    expect(change(10, 0)).toBeNull();
  });

  it("serie diaria con los días sin ventas en cero", () => {
    const r = periodRange("rango", now, { desde: "2026-10-01", hasta: "2026-10-03" });
    const s = dailySeries(r, [
      { at: new Date("2026-10-01T15:00:00Z"), cents: 1000 },
      { at: new Date("2026-10-02T03:30:00Z"), cents: 500 }, // 11:30 p. m. del 1 en Caracas
      { at: new Date("2026-10-03T12:00:00Z"), cents: 700 },
    ]);
    expect(s.map((d) => [d.day, d.cents, d.count])).toEqual([
      ["2026-10-01", 1500, 2],
      ["2026-10-02", 0, 0],
      ["2026-10-03", 700, 1],
    ]);
  });
});

const line = (over: Partial<SoldLine>): SoldLine => ({ productId: "p1", name: "Vestido", category: "Vestidos", size: "M", color: "Lila", quantity: 1, baseCents: 3000, unitCostCents: 1200, ...over });

describe("márgenes y lo más vendido", () => {
  it("calcula la utilidad solo con las prendas que tienen costo", () => {
    const m = marginOf([line({ quantity: 2, baseCents: 6000 }), line({ name: "Blusa", unitCostCents: null, quantity: 3 })]);
    expect(m).toEqual({ salesCents: 6000, costCents: 2400, profitCents: 3600, margin: 0.6, withoutCost: 3 });
    expect(marginOf([]).margin).toBeNull();
  });

  it("agrupa y ordena por venta; sin costo, la utilidad queda en blanco", () => {
    const r = rankBy(
      [line({}), line({ size: "S", baseCents: 9000, quantity: 3 }), line({ size: "S", unitCostCents: null })],
      (l) => l.size,
    );
    expect(r.map((x) => [x.key, x.quantity, x.baseCents, x.profitCents])).toEqual([
      ["S", 4, 12000, null],
      ["M", 1, 3000, 1800],
    ]);
  });
});

describe("valor real de lo cobrado en bolívares", () => {
  const bcv = [
    { effectiveAt: new Date("2026-10-01T12:00:00Z"), rate: 180 },
    { effectiveAt: new Date("2026-10-03T12:00:00Z"), rate: 185 },
  ];
  const p2p = [{ effectiveAt: new Date("2026-10-01T12:00:00Z"), rate: 220 }];

  it("usa la tasa vigente en la fecha de cada pago", () => {
    expect(rateAt(bcv, new Date("2026-10-02T00:00:00Z"))).toBe(180);
    expect(rateAt(bcv, new Date("2026-10-04T00:00:00Z"))).toBe(185);
    expect(rateAt(bcv, new Date("2026-09-30T00:00:00Z"))).toBeNull();
  });

  it("compara lo que dicen los libros (BCV) con lo que vale en el mercado (P2P)", () => {
    const v = vesRealValue(
      [
        { at: new Date("2026-10-02T15:00:00Z"), vesCents: 1_800_000 }, // Bs 18.000 = $100 BCV, $81,82 P2P
        { at: new Date("2026-09-20T15:00:00Z"), vesCents: 1_000_000 }, // sin tasas cargadas: no cuenta
      ],
      p2p,
      bcv,
    );
    expect(v.atBcvUsd).toBe(10000);
    expect(v.atP2pUsd).toBe(8182);
    expect(v.differenceUsd).toBe(-1818);
  });
});

describe("prendas que no se mueven", () => {
  it("lista las que tienen stock y no se venden hace 60 días, las más viejas primero", () => {
    const old = new Date("2026-07-01T00:00:00Z");
    const items = [
      { id: "a", stock: 3, lastSoldAt: null, createdAt: old },
      { id: "b", stock: 0, lastSoldAt: null, createdAt: old },
      { id: "c", stock: 2, lastSoldAt: new Date("2026-10-01T00:00:00Z"), createdAt: old },
      { id: "d", stock: 1, lastSoldAt: new Date("2026-06-01T00:00:00Z"), createdAt: old },
    ];
    expect(slowMovers(items, now).map((i) => i.id)).toEqual(["d", "a"]);
  });
});
