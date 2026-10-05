import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatUsd, formatVes, toCents, usdToVesCents, vesToUsdCents } from "@/lib/money";
import { computeTaxes, igtfFor } from "@/lib/tax-ve";
import { formatVePhone, normalizeVePhone, parseVeId, rifCheckDigit } from "@/lib/ve-ids";
import { paymentAmounts, remainingUsd } from "@/lib/payments";
import { autoSegments, favoriteMethod, purchaseFrequencyDays } from "@/lib/crm";

describe("dinero", () => {
  it("convierte montos sin errores de redondeo", () => {
    expect(toCents("25.5")).toBe(2550);
    expect(toCents("10.005")).toBe(1001);
    expect(centsToDecimalString(123456)).toBe("1234.56");
  });
  it("convierte USD ↔ Bs con la tasa", () => {
    expect(usdToVesCents(2500, 36.5)).toBe(91250);
    expect(vesToUsdCents(91250, 36.5)).toBe(2500);
  });
  it("formatea como en Venezuela", () => {
    expect(formatUsd(2550)).toBe("$25,50");
    expect(formatVes(123456)).toBe("Bs. 1.234,56");
  });
});

describe("IVA e IGTF", () => {
  const s = { ivaEnabled: true, ivaRateBp: 1600, taxMode: "PRICE_INCLUDES_TAX" as const };
  it("separa base imponible, exento e IVA (precio con IVA incluido)", () => {
    const t = computeTaxes(
      [
        { unitPriceCents: 11600, quantity: 1, exempt: false },
        { unitPriceCents: 1000, quantity: 2, exempt: true },
      ],
      s,
    );
    expect(t.taxableCents).toBe(10000);
    expect(t.ivaCents).toBe(1600);
    expect(t.exemptCents).toBe(2000);
    expect(t.totalCents).toBe(13600);
  });
  it("IVA sumado al precio y el interruptor global", () => {
    expect(computeTaxes([{ unitPriceCents: 10000, quantity: 1, exempt: false }], { ...s, taxMode: "TAX_ADDED" }).totalCents).toBe(11600);
    expect(computeTaxes([{ unitPriceCents: 10000, quantity: 1, exempt: false }], { ...s, ivaEnabled: false }).ivaCents).toBe(0);
  });
  it("IGTF solo en divisas y si está activo", () => {
    expect(igtfFor(10000, "USD", true, 300)).toBe(300);
    expect(igtfFor(10000, "USDT", true, 300)).toBe(300);
    expect(igtfFor(10000, "VES", true, 300)).toBe(0);
    expect(igtfFor(10000, "USD", false, 300)).toBe(0);
  });
});

describe("cédula, RIF y teléfono", () => {
  it("calcula el dígito verificador del RIF", () => {
    // RIF conocido del SENIAT: G-20000303-0
    expect(rifCheckDigit("G", "20000303")).toBe(0);
    const d = rifCheckDigit("J", "40123456");
    expect(parseVeId(`J-40123456-${d}`)?.display).toBe(`J-40123456-${d}`);
    expect(parseVeId(`J-40123456-${(d + 1) % 10}`)).toBeNull();
  });
  it("acepta cédulas con o sin puntos", () => {
    expect(parseVeId("v-12.345.678")).toMatchObject({ type: "V", number: "12345678", isRif: false });
    expect(parseVeId("X-123")).toBeNull();
  });
  it("normaliza teléfonos venezolanos", () => {
    expect(normalizeVePhone("0424-590.28.03")).toBe("+584245902803");
    expect(normalizeVePhone("+58 414 123 4567")).toBe("+584141234567");
    expect(normalizeVePhone("0255-6211234")).toBe("+582556211234");
    expect(normalizeVePhone("0300-1234567")).toBeNull();
    expect(formatVePhone("+584245902803")).toBe("0424-590.28.03");
  });
});

describe("pagos multimoneda", () => {
  const rates = { bcv: 40, p2p: 45 };
  it("un pago en Bs se lleva a USD con la tasa BCV", () => {
    expect(paymentAmounts("VES", 400000, rates)).toEqual({ rate: 40, rateSource: "BCV", amountUsdCents: 10000, amountVesCents: 400000 });
  });
  it("un pago en USD o USDT queda 1 a 1 y en Bs a tasa BCV para los libros", () => {
    expect(paymentAmounts("USDT", 2500, rates)).toMatchObject({ amountUsdCents: 2500, amountVesCents: 100000 });
  });
  it("calcula lo que falta en pagos mixtos", () => {
    expect(remainingUsd(5000, [2000, 1000])).toBe(2000);
    expect(remainingUsd(5000, [6000])).toBe(0);
  });
});

describe("CRM", () => {
  const rules = { vipMinSpentUsdCents: 50000, recurrentMinOrders: 3, inactiveAfterDays: 90 };
  const now = new Date("2026-10-04T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it("segmenta automáticamente", () => {
    expect(autoSegments({ ordersCount: 5, totalSpentUsdCents: 80000, firstOrderAt: daysAgo(200), lastOrderAt: daysAgo(10) }, rules, now)).toEqual(["VIP", "RECURRENT"]);
    expect(autoSegments({ ordersCount: 1, totalSpentUsdCents: 3000, firstOrderAt: daysAgo(5), lastOrderAt: daysAgo(5) }, rules, now)).toEqual(["NEW"]);
    expect(autoSegments({ ordersCount: 2, totalSpentUsdCents: 3000, firstOrderAt: daysAgo(300), lastOrderAt: daysAgo(120) }, rules, now)).toEqual(["INACTIVE"]);
  });
  it("frecuencia de compra y método favorito", () => {
    expect(purchaseFrequencyDays({ ordersCount: 3, totalSpentUsdCents: 0, firstOrderAt: daysAgo(60), lastOrderAt: now })).toBe(30);
    expect(favoriteMethod(["ZELLE", "PAGO_MOVIL", "PAGO_MOVIL"])).toBe("PAGO_MOVIL");
  });
});
