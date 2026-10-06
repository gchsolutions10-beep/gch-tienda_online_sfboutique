import { describe, expect, it } from "vitest";
import {
  allocatePayments,
  caracasDay,
  checkEligibility,
  endOfCaracasDay,
  evaluateLevel,
  installmentState,
  lateFeeDue,
  planFor,
  remindersDue,
  type CreditSettings,
} from "@/lib/credit";
import { contractText, CONTRACT_VERSION } from "@/lib/credit-contract";

// 5 de octubre de 2026, 3:00 p. m. en Caracas.
const bought = new Date("2026-10-05T19:00:00Z");
const settings: CreditSettings = {
  enabled: true,
  lateFeeCents: 500,
  graceDays: 5,
  maxByLevel: { 1: 10000, 2: 25000, 3: 50000 },
  upgradeAfter: 3,
  vipAfter: 6,
  oneOpenAtATime: true,
};

describe("planes por nivel", () => {
  it("Nivel 1: 60 % de inicial + 2 cuotas del 20 %, cada 15 días", () => {
    const p = planFor(10000, 1, bought);
    expect(p.downCents).toBe(6000);
    expect(p.installments.map((i) => i.amountCents)).toEqual([2000, 2000]);
    expect(p.installments.map((i) => caracasDay(i.dueDate))).toEqual(["2026-10-20", "2026-11-04"]);
    // Vence al final del día en Caracas.
    expect(p.installments[0].dueDate.toISOString()).toBe("2026-10-21T03:59:59.000Z");
  });

  it("Nivel 2: 50 % + 3 cuotas iguales; el redondeo va a la última", () => {
    const p = planFor(10001, 2, bought);
    expect(p.downCents).toBe(5001);
    expect(p.installments.map((i) => i.amountCents)).toEqual([1666, 1666, 1668]);
    expect(p.downCents + p.financedCents).toBe(10001);
  });

  it("Nivel 3: 40 % + 4 cuotas iguales", () => {
    const p = planFor(10000, 3, bought);
    expect(p.downCents).toBe(4000);
    expect(p.installments.map((i) => i.amountCents)).toEqual([1500, 1500, 1500, 1500]);
    expect(caracasDay(p.installments[3].dueDate)).toBe("2026-12-04");
  });

  it("fin del día en Caracas", () => {
    expect(endOfCaracasDay(new Date("2026-10-06T02:00:00Z")).toISOString()).toBe("2026-10-06T03:59:59.000Z");
  });
});

describe("quién puede comprar a crédito", () => {
  const base = { status: "APPROVED" as const, level: 1 as const, financedCents: 4000, openPlans: 0, overdue: false, settings };
  it("aprobada, dentro del límite y sin créditos abiertos", () => {
    expect(checkEligibility(base)).toEqual({ ok: true });
  });
  it("respeta el límite del nivel, la solicitud y la mora", () => {
    expect(checkEligibility({ ...base, financedCents: 10001 }).ok).toBe(false);
    expect(checkEligibility({ ...base, level: 2, financedCents: 20000 }).ok).toBe(true);
    expect(checkEligibility({ ...base, status: "PENDING" }).ok).toBe(false);
    expect(checkEligibility({ ...base, status: "NONE" }).ok).toBe(false);
    expect(checkEligibility({ ...base, overdue: true }).ok).toBe(false);
    expect(checkEligibility({ ...base, openPlans: 1 }).ok).toBe(false);
    expect(checkEligibility({ ...base, openPlans: 1, settings: { ...settings, oneOpenAtATime: false } }).ok).toBe(true);
    expect(checkEligibility({ ...base, settings: { ...settings, enabled: false } }).ok).toBe(false);
  });
});

describe("pagos, mora y recordatorios", () => {
  it("lo pagado cubre primero la inicial y luego las cuotas en orden, con su recargo", () => {
    const inst = [
      { amountCents: 2000, lateFeeCents: 500 },
      { amountCents: 2000, lateFeeCents: 0 },
    ];
    expect(allocatePayments(6000, inst, 5000)).toMatchObject({ downPaid: 5000, paid: [0, 0], remainingCents: 5500 });
    expect(allocatePayments(6000, inst, 8000)).toMatchObject({ downPaid: 6000, paid: [2000, 0], remainingCents: 2500 });
    expect(allocatePayments(6000, inst, 11000)).toMatchObject({ downPaid: 6000, paid: [2500, 2000], remainingCents: 0, overpaidCents: 500 });
  });

  const due = new Date("2026-10-21T03:59:59Z"); // vence el 20 de octubre (Caracas)
  const at = (iso: string) => new Date(iso);

  it("estado de la cuota: por vencer, vence hoy, gracia y mora desde el día 6", () => {
    expect(installmentState({ dueDate: due, paid: false }, at("2026-10-18T15:00:00Z"), 5).state).toBe("upcoming");
    expect(installmentState({ dueDate: due, paid: false }, at("2026-10-20T15:00:00Z"), 5).state).toBe("due-today");
    expect(installmentState({ dueDate: due, paid: false }, at("2026-10-25T15:00:00Z"), 5)).toEqual({ state: "grace", daysLate: 5 });
    expect(installmentState({ dueDate: due, paid: false }, at("2026-10-26T15:00:00Z"), 5)).toEqual({ state: "late", daysLate: 6 });
    expect(installmentState({ dueDate: due, paid: true }, at("2026-10-26T15:00:00Z"), 5).state).toBe("paid");
  });

  it("el recargo se aplica una sola vez, a partir del día 6", () => {
    const i = { dueDate: due, paid: false, lateFeeApplied: false };
    expect(lateFeeDue(i, at("2026-10-25T15:00:00Z"), 5)).toBe(false);
    expect(lateFeeDue(i, at("2026-10-26T15:00:00Z"), 5)).toBe(true);
    expect(lateFeeDue({ ...i, lateFeeApplied: true }, at("2026-10-26T15:00:00Z"), 5)).toBe(false);
    expect(lateFeeDue({ ...i, paid: true }, at("2026-10-26T15:00:00Z"), 5)).toBe(false);
  });

  it("recordatorios: 2 días antes, el día del pago y al 3.er día de retraso, sin repetir", () => {
    const i = { dueDate: due, paid: false, remindedBeforeAt: null, remindedDueAt: null, remindedLateAt: null };
    expect(remindersDue(i, at("2026-10-17T15:00:00Z"))).toEqual([]);
    expect(remindersDue(i, at("2026-10-18T15:00:00Z"))).toEqual(["before"]);
    expect(remindersDue(i, at("2026-10-20T15:00:00Z"))).toEqual(["due"]);
    expect(remindersDue(i, at("2026-10-23T15:00:00Z"))).toEqual(["late"]);
    expect(remindersDue({ ...i, remindedLateAt: new Date() }, at("2026-10-24T15:00:00Z"))).toEqual([]);
    expect(remindersDue({ ...i, paid: true }, at("2026-10-20T15:00:00Z"))).toEqual([]);
  });
});

describe("niveles de crédito", () => {
  const now = new Date("2026-10-05T15:00:00Z");
  const paid = (wentLate = false, createdAt = new Date("2026-08-01T00:00:00Z")) => ({ status: "PAID" as const, wentLate, createdAt });
  const s = { upgradeAfter: 3, vipAfter: 6 };

  it("asciende con créditos pagados a tiempo y nunca baja sola", () => {
    expect(evaluateLevel({ current: 1, manual: false, plans: [paid(), paid()], overdueNow: false, settings: s }, now).level).toBe(1);
    expect(evaluateLevel({ current: 1, manual: false, plans: [paid(), paid(), paid()], overdueNow: false, settings: s }, now)).toEqual({ level: 2, reason: "upgrade" });
    expect(evaluateLevel({ current: 2, manual: false, plans: Array(6).fill(paid()), overdueNow: false, settings: s }, now).level).toBe(3);
    expect(evaluateLevel({ current: 3, manual: false, plans: [], overdueNow: false, settings: s }, now).level).toBe(3);
  });

  it("la mora la deja en Nivel 1 aunque la hayan subido a mano", () => {
    expect(evaluateLevel({ current: 3, manual: true, plans: [paid(true)], overdueNow: false, settings: s }, now)).toEqual({ level: 1, reason: "penalty" });
    expect(evaluateLevel({ current: 2, manual: false, plans: [], overdueNow: true, settings: s }, now).level).toBe(1);
  });

  it("una mora de hace más de 6 meses ya no penaliza; el nivel manual se respeta", () => {
    const old = paid(true, new Date("2026-01-01T00:00:00Z"));
    expect(evaluateLevel({ current: 1, manual: false, plans: [old, paid(), paid(), paid()], overdueNow: false, settings: s }, now).level).toBe(2);
    expect(evaluateLevel({ current: 3, manual: true, plans: [], overdueNow: false, settings: s }, now)).toEqual({ level: 3, reason: "manual" });
  });
});

describe("contrato", () => {
  it("lleva las partes, el recargo y los días de gracia configurados", () => {
    const t = contractText({ storeName: "SF Boutique", legalName: "SF Boutique, C.A.", rif: "J-40123456-0", buyerName: "María", buyerId: "V-18456789", guarantorName: "José", guarantorId: "V-9876543", lateFeeUsd: "5,00", graceDays: 5 });
    expect(t).toContain(CONTRACT_VERSION);
    expect(t).toContain("María, titular de la cédula/RIF V-18456789");
    expect(t).toContain("cinco (5) días continuos");
    expect(t).toContain("a partir del día 6 de morosidad");
    expect(t).toContain("$5,00 USD");
    expect(t).toContain("renunciando expresamente a los beneficios de excusión y división");
  });
});
