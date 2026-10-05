import { describe, expect, it } from "vitest";
import { expectedByAccount, splitDiscount, tenderStatus, totalsByCurrency, type ClosingAccount } from "@/lib/cash";
import { priceOrder } from "@/lib/orders";

const BCV = 184.1;

describe("cobro con pagos mixtos", () => {
  it("suma pagos en Bs, USD y USDT a la tasa BCV", () => {
    // $50: Bs 4.602,50 (= $25) + $20 en efectivo + 5 USDT
    const t = tenderStatus(5000, [{ currency: "VES", cents: 460250 }, { currency: "USD", cents: 2000 }, { currency: "USDT", cents: 500 }], BCV);
    expect(t.paidUsd).toBe(5000);
    expect(t.complete).toBe(true);
    expect(t.remainingUsd).toBe(0);
  });

  it("dice cuánto falta", () => {
    const t = tenderStatus(5000, [{ currency: "USD", cents: 2000 }], BCV);
    expect(t.complete).toBe(false);
    expect(t.remainingUsd).toBe(3000);
  });

  it("calcula el vuelto en la moneda elegida", () => {
    // Total $17, paga con un billete de $20 → vuelto $3 = Bs 552,30
    const enBs = tenderStatus(1700, [{ currency: "USD", cents: 2000 }], BCV, "VES");
    expect(enBs.changeUsd).toBe(300);
    expect(enBs.change).toBe(55230);
    expect(tenderStatus(1700, [{ currency: "USD", cents: 2000 }], BCV, "USD").change).toBe(300);
  });

  it("tolera 1 centavo de redondeo al convertir Bs", () => {
    const t = tenderStatus(2500, [{ currency: "VES", cents: 460240 }], BCV);
    expect(t.complete).toBe(true);
    expect(t.changeUsd).toBe(0);
  });
});

describe("descuentos", () => {
  it("reparte el descuento proporcional y sin perder centavos", () => {
    expect(splitDiscount([3000, 1000], 400)).toEqual([300, 100]);
    expect(splitDiscount([1000, 1000, 1000], 100)).toEqual([33, 33, 34]);
    expect(splitDiscount([1000], 5000)).toEqual([1000]);
    expect(splitDiscount([1000, 2000], 0)).toEqual([0, 0]);
  });

  it("el total de la venta descuenta antes del IVA incluido", () => {
    const t = priceOrder([{ unitPriceCents: 2000, quantity: 1, ivaExempt: false, discountCents: 200 }], { ivaEnabled: true, ivaRateBp: 1600, taxMode: "PRICE_INCLUDES_TAX" }, 0, BCV);
    expect(t.totalCents).toBe(1800);
    expect(t.discountCents).toBe(200);
    expect(t.ivaCents).toBe(248);
  });
});

describe("cierre de caja", () => {
  const accounts: ClosingAccount[] = [
    { id: "pm", name: "Pago Móvil", type: "PAGO_MOVIL", currency: "VES" },
    { id: "bs", name: "Caja Bs", type: "CASH_VES", currency: "VES" },
    { id: "usd", name: "Caja USD", type: "CASH_USD", currency: "USD" },
    { id: "zelle", name: "Zelle", type: "ZELLE", currency: "USD" },
  ];

  it("efectivo = fondo + cobros + entradas − salidas; bancos = cobros del turno", () => {
    const lines = expectedByAccount(
      accounts,
      { VES: 50000, USD: 2000 },
      [
        { financialAccountId: "pm", currency: "VES", cents: 460250 },
        { financialAccountId: "usd", currency: "USD", cents: 2000 },
        { financialAccountId: "usd", currency: "USD", cents: 1000 },
      ],
      [{ financialAccountId: "bs", currency: "VES", type: "PAY_OUT", cents: 55230 }],
    );
    const by = Object.fromEntries(lines.map((l) => [l.accountId, l.expected]));
    expect(by).toEqual({ pm: 460250, bs: 50000 - 55230, usd: 5000 });
    // Zelle sin movimientos no aparece en el cierre
    expect(lines.find((l) => l.accountId === "zelle")).toBeUndefined();
  });

  it("totaliza diferencias por moneda", () => {
    const t = totalsByCurrency([
      { currency: "VES", expected: 1000, counted: 900 },
      { currency: "VES", expected: 500, counted: 500 },
      { currency: "USD", expected: 2000, counted: 2100 },
    ]);
    expect(t.VES).toEqual({ expected: 1500, counted: 1400, difference: -100 });
    expect(t.USD?.difference).toBe(100);
  });
});
