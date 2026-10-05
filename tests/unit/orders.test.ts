import { describe, expect, it } from "vitest";
import { amountDueIn, customerSteps, isFullyPaid, nextStatus, priceOrder, shippingFor, skuFor, timeLeft, type DeliverySettings } from "@/lib/orders";
import { margin, planVariants, type ExistingVariant } from "@/lib/variants";

const delivery: DeliverySettings = {
  pickupEnabled: true,
  localDeliveryEnabled: true,
  localDeliveryCents: 300,
  nationalShippingEnabled: true,
  nationalShippingCents: null,
  freeShippingFromCents: 6000,
};
const tax = { ivaEnabled: true, ivaRateBp: 1600, taxMode: "PRICE_INCLUDES_TAX" as const };

describe("pedidos", () => {
  it("calcula el envío según la entrega", () => {
    expect(shippingFor("PICKUP", 1000, false, delivery)).toMatchObject({ available: true, cents: 0 });
    expect(shippingFor("LOCAL_DELIVERY", 1000, false, delivery)).toMatchObject({ cents: 300, free: false });
    // Envío gratis desde $60 o si todo el pedido lo tiene
    expect(shippingFor("LOCAL_DELIVERY", 7300, false, delivery)).toMatchObject({ cents: 0, free: true });
    expect(shippingFor("LOCAL_DELIVERY", 1000, true, delivery)).toMatchObject({ cents: 0, free: true });
    // Envío nacional sin tarifa = cobro a destino (no cuenta como gratis)
    expect(shippingFor("NATIONAL_SHIPPING", 9000, false, delivery)).toMatchObject({ cents: 0, payAtDestination: true, free: false });
    expect(shippingFor("PICKUP", 0, false, { ...delivery, pickupEnabled: false }).available).toBe(false);
  });

  it("totaliza con IVA incluido y el envío aparte, y convierte a Bs", () => {
    const t = priceOrder(
      [
        { unitPriceCents: 3800, quantity: 1, ivaExempt: false },
        { unitPriceCents: 1500, quantity: 2, ivaExempt: true },
      ],
      tax,
      300,
      184.1,
    );
    expect(t.subtotalCents).toBe(6800);
    expect(t.exemptCents).toBe(3000);
    expect(t.taxableCents + t.ivaCents).toBe(3800);
    expect(t.ivaCents).toBe(524);
    expect(t.totalCents).toBe(7100);
    expect(t.totalVesCents).toBe(1307110);
  });

  it("sigue el flujo de estados según la entrega", () => {
    expect(nextStatus("PAID", "PICKUP")).toBe("PREPARING");
    expect(nextStatus("PREPARING", "PICKUP")).toBe("READY");
    expect(nextStatus("PREPARING", "NATIONAL_SHIPPING")).toBe("SHIPPED");
    expect(nextStatus("SHIPPED", "NATIONAL_SHIPPING")).toBe("DELIVERED");
    expect(nextStatus("PENDING", "PICKUP")).toBeNull();
    expect(nextStatus("CANCELLED", "PICKUP")).toBeNull();
    const steps = customerSteps("PAYMENT_REVIEW", "LOCAL_DELIVERY");
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(["PENDING"]);
    expect(steps.at(-2)?.label).toBe("Sale a delivery");
  });

  it("sugiere el monto en la moneda del pago y tolera 1 centavo", () => {
    expect(amountDueIn("VES", 7300, 184.1)).toBe(1343930);
    expect(amountDueIn("USDT", 7300, 184.1)).toBe(7300);
    expect(isFullyPaid(7300, 7299)).toBe(true);
    expect(isFullyPaid(7300, 7000)).toBe(false);
  });

  it("arma el SKU con producto, color y talla", () => {
    expect(skuFor("Vestido midi satinado", "Lila", "M")).toBe("VESTIDOMIDI-LILA-M");
    expect(skuFor("Bolso tote", "Azul jean", null)).toBe("BOLSOTOTE-AZULJE");
    expect(skuFor("Sandalia de tacón", null, "37")).toBe("SANDALIATACO-37");
  });

  it("muestra el tiempo de reserva restante", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    expect(timeLeft(new Date("2026-10-06T09:10:00Z"), now)).toBe("23 h 10 min");
    expect(timeLeft(new Date("2026-10-05T10:08:00Z"), now)).toBe("8 min");
    expect(timeLeft(new Date("2026-10-05T09:00:00Z"), now)).toBeNull();
  });
});

describe("matriz talla × color", () => {
  const v = (over: Partial<ExistingVariant>): ExistingVariant => ({ id: "v1", sizeId: "S", colorId: "negro", stock: 5, reserved: 0, isActive: true, sold: false, ...over });

  it("aplica el cambio como diferencia (no pisa ventas hechas mientras se editaba)", () => {
    // Se abrió con 5, se vendió 1 (quedan 4) y la encargada escribió 8: entran +3.
    const plan = planVariants([v({ stock: 4 })], [{ sizeId: "S", colorId: "negro", expectedStock: 5, stock: 8 }]);
    expect(plan.update).toEqual([{ id: "v1", delta: 3, reactivate: false }]);
  });

  it("crea, reactiva y quita variantes", () => {
    const plan = planVariants(
      [v({ id: "a" }), v({ id: "b", sizeId: "M", sold: true }), v({ id: "c", sizeId: "L", isActive: false, stock: 2 })],
      [
        { sizeId: "S", colorId: "negro", expectedStock: 5, stock: 5 },
        { sizeId: "L", colorId: "negro", expectedStock: 0, stock: 6 },
        { sizeId: "XL", colorId: "negro", expectedStock: 0, stock: 1 },
      ],
    );
    expect(plan.create).toEqual([{ sizeId: "XL", colorId: "negro", stock: 1 }]);
    expect(plan.update).toEqual([{ id: "c", delta: 4, reactivate: true }]);
    expect(plan.remove).toEqual([{ id: "b", hasSales: true, stock: 5 }]);
  });

  it("no deja el stock por debajo de lo apartado", () => {
    const plan = planVariants([v({ reserved: 3 })], [{ sizeId: "S", colorId: "negro", expectedStock: 5, stock: 2 }]);
    expect(plan.errors[0]).toMatch(/apartadas/);
    const removing = planVariants([v({ reserved: 1 })], []);
    expect(removing.errors).toHaveLength(1);
  });

  it("calcula el margen", () => {
    expect(margin(1990, 950)).toBeCloseTo(0.5226, 3);
    expect(margin(1990, null)).toBeNull();
  });
});
