import { describe, expect, it } from "vitest";
import { acceptingOrders, averageRating, groupCount, IMPORT_DISCLAIMER, parseProductLink, quoteFor, requestStep, suggestedCommission } from "@/lib/imports";

describe("enlaces de productos", () => {
  it("reconoce la tienda de origen", () => {
    expect(parseProductLink("https://us.shein.com/Vestido-p-123.html?src=x")?.store).toBe("SHEIN");
    expect(parseProductLink("https://www.alibaba.com/product-detail/abc.html")?.store).toBe("Alibaba");
    expect(parseProductLink("https://es.aliexpress.com/item/1.html")?.store).toBe("AliExpress");
    expect(parseProductLink("https://www.temu.com/x.html")?.store).toBe("Temu");
    expect(parseProductLink("https://www.amazon.com/dp/B000")?.store).toBe("Amazon");
    expect(parseProductLink("https://tiendita.com.ve/blusa")?.store).toBe("Otra tienda");
  });

  it("rechaza lo que no es un enlace web", () => {
    expect(parseProductLink("vestido rojo")).toBeNull();
    expect(parseProductLink("javascript:alert(1)")).toBeNull();
    expect(parseProductLink("ftp://shein.com/x")).toBeNull();
    expect(parseProductLink("https://usuario:clave@shein.com/x")).toBeNull();
    expect(parseProductLink("http://localhost/x")).toBeNull();
  });
});

describe("cotización", () => {
  const sinIva = { ivaEnabled: false, ivaRateBp: 1600, taxMode: "PRICE_INCLUDES_TAX" as const };
  const ivaSumado = { ivaEnabled: true, ivaRateBp: 1600, taxMode: "TAX_ADDED" as const };
  const ivaIncluido = { ivaEnabled: true, ivaRateBp: 1600, taxMode: "PRICE_INCLUDES_TAX" as const };

  it("suma productos, flete y comisión, y pide 50 % de adelanto", () => {
    const q = quoteFor({ unitCostCents: 1200, quantity: 2, freightCents: 800, commissionCents: 480 }, sinIva, 50);
    expect(q).toEqual({ productsCents: 2400, freightCents: 800, commissionCents: 480, ivaCents: 0, totalCents: 3680, depositCents: 1840, balanceCents: 1840 });
  });

  it("el IVA va solo sobre la comisión (servicio), no sobre los productos ni el flete", () => {
    const q = quoteFor({ unitCostCents: 1000, quantity: 1, freightCents: 500, commissionCents: 1000 }, ivaSumado, 50);
    expect(q.ivaCents).toBe(160);
    expect(q.totalCents).toBe(2660);
    // Con precios con IVA incluido, el total no cambia.
    expect(quoteFor({ unitCostCents: 1000, quantity: 1, freightCents: 500, commissionCents: 1000 }, ivaIncluido, 50).totalCents).toBe(2500);
  });

  it("comisión sugerida sobre productos + flete", () => {
    expect(suggestedCommission(2400, 800, 15)).toBe(480);
  });
});

describe("lotes y encargos", () => {
  const now = new Date("2026-11-10T15:00:00Z");
  const lote = { status: "OPEN" as const, opensAt: new Date("2026-11-01T04:00:00Z"), closesAt: new Date("2026-11-21T03:59:59Z") };

  it("un lote recibe pedidos solo abierto y dentro de sus fechas", () => {
    expect(acceptingOrders(lote, now)).toBe(true);
    expect(acceptingOrders({ ...lote, status: "IN_PROCESS" }, now)).toBe(false);
    expect(acceptingOrders(lote, new Date("2026-11-21T05:00:00Z"))).toBe(false);
    expect(acceptingOrders(lote, new Date("2026-10-30T15:00:00Z"))).toBe(false);
  });

  it("cuenta personas distintas y unidades, sin rechazados ni cancelados", () => {
    expect(
      groupCount([
        { customerId: "a", status: "QUOTED", quantity: 2 },
        { customerId: "a", status: "ACCEPTED", quantity: 1 },
        { customerId: "b", status: "PENDING_REVIEW", quantity: 1 },
        { customerId: "c", status: "REJECTED", quantity: 5 },
      ]),
    ).toEqual({ people: 2, units: 4 });
  });

  it("el paso del encargo sigue al pedido después de aceptar", () => {
    expect(requestStep("QUOTED", null).tone).toBe("warn");
    expect(requestStep("ACCEPTED", { status: "PENDING", paymentStatus: "UNPAID" }).label).toMatch(/adelanto/);
    expect(requestStep("ACCEPTED", { status: "PREPARING", paymentStatus: "PARTIAL" }).label).toMatch(/tránsito/);
    expect(requestStep("ACCEPTED", { status: "READY", paymentStatus: "PARTIAL" }).label).toMatch(/saldo/);
    expect(requestStep("ACCEPTED", { status: "DELIVERED", paymentStatus: "PAID" }).tone).toBe("done");
  });

  it("promedio de estrellas y descargo con el nombre de la tienda", () => {
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([])).toBeNull();
    expect(IMPORT_DISCLAIMER("SF Boutique")).toContain("ni realizamos cambios de talla");
  });
});
