import { describe, expect, it } from "vitest";
import { splitIgtf, withIgtf } from "@/lib/tax-ve";
import { tenderStatus } from "@/lib/cash";
import { amountDueIn } from "@/lib/orders";
import {
  controlNumbersLeft,
  creditedQuantities,
  creditNoteFrom,
  currentMonth,
  debitNoteFrom,
  formatControlNumber,
  formatInvoiceNumber,
  invoiceFromOrder,
  monthRange,
  parseLines,
  salesBookRows,
  salesBookTotals,
  takeControlNumber,
  type BookDocument,
} from "@/lib/invoicing";

const BCV = 184.1;
const IGTF = 300; // 3 %

describe("IGTF en pagos en divisas", () => {
  it("suma el 3 % a lo que se cobra en divisas", () => {
    expect(withIgtf(10000, IGTF)).toBe(10300);
    expect(amountDueIn("USD", 10000, BCV, IGTF)).toBe(10300);
    expect(amountDueIn("VES", 10000, BCV, IGTF)).toBe(1841000); // en Bs no hay IGTF
    expect(amountDueIn("USD", 10000, BCV)).toBe(10000); // negocio sin IGTF
  });

  it("separa lo que cubre el pedido y el impuesto de un pago exacto", () => {
    expect(splitIgtf(10300, 10000, IGTF)).toEqual({ covered: 10000, igtf: 300, excess: 0 });
  });

  it("un pago parcial en divisas: todo lo que entra lleva su IGTF", () => {
    // Paga $51,50 de un pedido de $100: cubre $50 y $1,50 es IGTF.
    expect(splitIgtf(5150, 10000, IGTF)).toEqual({ covered: 5000, igtf: 150, excess: 0 });
  });

  it("lo que sobra (vuelto) no paga IGTF", () => {
    // Pedido $17, paga con $20: cubre $17, IGTF $0,51, vuelto $2,49.
    expect(splitIgtf(2000, 1700, IGTF)).toEqual({ covered: 1700, igtf: 51, excess: 249 });
  });

  it("sin IGTF todo el pago cubre el pedido", () => {
    expect(splitIgtf(2000, 1700, 0)).toEqual({ covered: 1700, igtf: 0, excess: 300 });
  });

  it("en caja: los Bs cubren primero y el IGTF va solo sobre la parte en divisas", () => {
    // $50: Bs 4.602,50 (= $25) + $25,75 en efectivo (= $25 + IGTF $0,75).
    const t = tenderStatus(5000, [{ currency: "VES", cents: 460250 }, { currency: "USD", cents: 2575 }], BCV, "VES", IGTF);
    expect(t.igtfUsd).toBe(75);
    expect(t.igtfBaseUsd).toBe(2500);
    expect(t.igtfByLine).toEqual([0, 75]);
    expect(t.complete).toBe(true);
    expect(t.changeUsd).toBe(0);
  });

  it("en caja: si paga $25 justos sin el IGTF, todavía falta", () => {
    const t = tenderStatus(5000, [{ currency: "VES", cents: 460250 }, { currency: "USD", cents: 2500 }], BCV, "VES", IGTF);
    expect(t.complete).toBe(false);
    expect(t.remainingUsd).toBe(73); // 2500 cubre 2427 + IGTF 73
  });

  it("en caja: el vuelto sale sin IGTF y el impuesto se reparte entre los pagos en divisas", () => {
    const t = tenderStatus(1700, [{ currency: "USD", cents: 1000 }, { currency: "USDT", cents: 1000 }], BCV, "USD", IGTF);
    expect(t.igtfUsd).toBe(51);
    expect(t.change).toBe(249);
    expect(t.igtfByLine.reduce((a, b) => a + b, 0)).toBe(51);
  });
});

describe("numeración", () => {
  it("formatea número de factura y de control", () => {
    expect(formatInvoiceNumber("", 25)).toBe("00000025");
    expect(formatInvoiceNumber("A", 25)).toBe("A-00000025");
    expect(formatControlNumber("00-", 1234)).toBe("00-00001234");
  });

  it("forma libre: toma el siguiente número del rango y avisa cuando se acaba", () => {
    const s = { controlMode: "FREE_FORM" as const, controlPrefix: "00-", nextControl: 150, controlTo: 151 };
    expect(takeControlNumber(s)).toEqual({ ok: true, control: "00-00000150", next: 151 });
    expect(controlNumbersLeft(s)).toBe(2);
    const done = takeControlNumber({ ...s, nextControl: 152 });
    expect(done.ok).toBe(false);
    expect(takeControlNumber({ ...s, nextControl: null }).ok).toBe(false);
  });

  it("imprenta digital: el número de control se anota después", () => {
    expect(takeControlNumber({ controlMode: "DIGITAL_PRINTER", controlPrefix: null, nextControl: null, controlTo: null })).toEqual({ ok: true, control: null, next: null });
  });
});

describe("montos de la factura en Bs", () => {
  const lines = [
    { description: "Vestido midi · M · Lila", quantity: 2, baseUsdCents: 5000, exempt: false },
    { description: "Libro de moda", quantity: 1, baseUsdCents: 1000, exempt: true },
  ];

  it("convierte a la tasa BCV, separa gravado y exento y calcula el IVA sobre la base", () => {
    const inv = invoiceFromOrder(lines, { shippingUsdCents: 300, ivaRateBp: 1600, igtfUsdCents: 0, igtfBaseUsdCents: 0, bcvRate: BCV });
    expect(inv.taxableVes).toBe(920500); // $50 × 184,10
    expect(inv.exemptVes).toBe(184100 + 55230); // libro + envío
    expect(inv.ivaVes).toBe(147280); // 16 % de 9.205,00
    expect(inv.totalVes).toBe(920500 + 239330 + 147280);
    expect(inv.lines).toHaveLength(3);
    expect(inv.lines[0].unitVes).toBe(460250);
    expect(inv.lines[2]).toMatchObject({ description: "Envío", exempt: true });
  });

  it("muestra el IGTF aparte, sin sumarlo a la base del IVA", () => {
    const inv = invoiceFromOrder(lines, { shippingUsdCents: 0, ivaRateBp: 1600, igtfUsdCents: 150, igtfBaseUsdCents: 5000, bcvRate: BCV });
    expect(inv.igtfVes).toBe(27615);
    expect(inv.igtfBaseVes).toBe(920500);
    expect(inv.totalVes).toBe(inv.taxableVes + inv.exemptVes + inv.ivaVes + inv.igtfVes);
  });

  it("con el IVA apagado todo sale exento", () => {
    const inv = invoiceFromOrder(lines, { shippingUsdCents: 0, ivaRateBp: 0, igtfUsdCents: 0, igtfBaseUsdCents: 0, bcvRate: BCV });
    expect(inv.taxableVes).toBe(0);
    expect(inv.ivaVes).toBe(0);
  });
});

describe("notas de crédito y débito", () => {
  const original = invoiceFromOrder(
    [
      { description: "Blusa", quantity: 3, baseUsdCents: 3000, exempt: false },
      { description: "Sandalia", quantity: 1, baseUsdCents: 4000, exempt: false },
    ],
    { shippingUsdCents: 0, ivaRateBp: 1600, igtfUsdCents: 0, igtfBaseUsdCents: 0, bcvRate: 100 },
  ).lines;

  it("devuelve solo lo elegido, a los precios de la factura", () => {
    const nc = creditNoteFrom(original, [1, 0], 1600);
    expect(nc.lines).toEqual([{ description: "Blusa", quantity: 1, unitVes: 100000, baseVes: 100000, exempt: false, ref: 0 }]);
    expect(nc.ivaVes).toBe(16000);
    expect(nc.totalVes).toBe(116000);
  });

  it("no devuelve más de lo facturado y lleva la cuenta de lo ya acreditado", () => {
    const nc = creditNoteFrom(original, [9, 1], 1600);
    expect(nc.lines.map((l) => l.quantity)).toEqual([3, 1]);
    expect(creditedQuantities(original, [creditNoteFrom(original, [1, 0], 1600).lines, creditNoteFrom(original, [1, 1], 1600).lines])).toEqual([2, 1]);
  });

  it("nota de débito por un cargo adicional", () => {
    const nd = debitNoteFrom("Diferencia de precio", 50000, false, 1600);
    expect(nd.taxableVes).toBe(50000);
    expect(nd.ivaVes).toBe(8000);
    expect(debitNoteFrom("Envío adicional", 50000, true, 1600).ivaVes).toBe(0);
  });

  it("lee los renglones guardados sin confiar en el JSON", () => {
    expect(parseLines(null)).toEqual([]);
    expect(parseLines([{ description: "A", quantity: "2", unitVes: 10, baseVes: 20, exempt: 0, ref: 1 }])).toEqual([
      { description: "A", quantity: 2, unitVes: 10, baseVes: 20, exempt: false, ref: 1 },
    ]);
  });
});

describe("libro de ventas", () => {
  const doc = (over: Partial<BookDocument>): BookDocument => ({
    issuedAt: new Date("2026-10-05T15:00:00Z"),
    type: "INVOICE",
    number: "00000001",
    controlNumber: "00-00000001",
    buyerName: "María González",
    buyerId: "V-18456789",
    affects: null,
    voided: false,
    taxableVes: 10000,
    exemptVes: 0,
    ivaRateBp: 1600,
    ivaVes: 1600,
    igtfVes: 0,
    totalVes: 11600,
    ...over,
  });

  it("las notas de crédito restan, los anulados salen en cero y queda ordenado por fecha", () => {
    const rows = salesBookRows([
      doc({ number: "00000002", issuedAt: new Date("2026-10-06T15:00:00Z"), type: "CREDIT_NOTE", affects: "00000001", taxableVes: 5000, ivaVes: 800, totalVes: 5800 }),
      doc({}),
      doc({ number: "00000003", issuedAt: new Date("2026-10-07T15:00:00Z"), voided: true }),
      doc({ number: "NE", type: "DELIVERY_NOTE" }),
    ]);
    expect(rows.map((r) => [r.number, r.transaction])).toEqual([
      ["00000001", "01"],
      ["00000002", "03"],
      ["00000003", "03"],
    ]);
    expect(rows[1].totalSalesVes).toBe(-5800);
    expect(rows[2].totalSalesVes).toBe(0);
    expect(salesBookTotals(rows)).toEqual({ documents: 3, taxableVes: 5000, exemptVes: 0, ivaVes: 800, igtfVes: 0, totalSalesVes: 5800 });
  });

  it("el IGTF va en su columna y no en el total de ventas", () => {
    const [r] = salesBookRows([doc({ igtfVes: 300, totalVes: 11900 })]);
    expect(r.totalSalesVes).toBe(11600);
    expect(r.igtfVes).toBe(300);
  });

  it("calcula el mes en hora de Caracas", () => {
    const r = monthRange("2026-10")!;
    expect(r.from.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(monthRange("2026-13")).toBeNull();
    // 1 de noviembre a las 2 a. m. UTC todavía es 31 de octubre en Caracas.
    expect(currentMonth(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
  });
});
