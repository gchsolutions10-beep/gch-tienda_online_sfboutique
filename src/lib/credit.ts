/**
 * Credi-SF: compras a crédito (puro, sin BD). Montos en centavos de USD.
 * Las fechas de vencimiento son el fin del día en hora de Caracas (UTC−4).
 * Lo legal (recargo por mora, intereses) se marca «validar con el abogado».
 */

const DAY = 86_400_000;
const OFFSET = 4 * 3_600_000;

export type CreditLevel = 1 | 2 | 3;

/**
 * Condiciones por nivel: inicial y cuotas quincenales (en puntos básicos del total).
 * Nivel 1: 60 % + 20 % + 20 %. Nivel 2: 50 % + 3 cuotas iguales. Nivel 3: 40 % + 4 cuotas iguales.
 */
export const CREDIT_LEVELS: Record<CreditLevel, { name: string; short: string; downBp: number; installments: number; description: string }> = {
  1: { name: "Nivel 1 · Estándar", short: "Estándar", downBp: 6000, installments: 2, description: "60 % de inicial + 2 cuotas quincenales del 20 %" },
  2: { name: "Nivel 2 · Confiable", short: "Confiable", downBp: 5000, installments: 3, description: "50 % de inicial + 3 cuotas quincenales iguales" },
  3: { name: "Nivel 3 · VIP", short: "VIP", downBp: 4000, installments: 4, description: "40 % de inicial + 4 cuotas quincenales iguales" },
};

export const asLevel = (n: number): CreditLevel => (n >= 3 ? 3 : n <= 1 ? 1 : 2);

/** Días entre cuotas (quincenal). */
export const INSTALLMENT_DAYS = 15;

export type CreditSettings = {
  enabled: boolean;
  lateFeeCents: number;
  graceDays: number;
  maxByLevel: Record<CreditLevel, number>;
  upgradeAfter: number;
  vipAfter: number;
  oneOpenAtATime: boolean;
};

/** Fin del día (23:59:59 Caracas) de la fecha de `d` desplazada `days` días. */
export function endOfCaracasDay(d: Date, days = 0): Date {
  const local = new Date(d.getTime() - OFFSET);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET;
  return new Date(start + (days + 1) * DAY - 1000);
}

/** "2026-10-21" (Caracas) de una fecha. */
export const caracasDay = (d: Date) => new Date(d.getTime() - OFFSET).toISOString().slice(0, 10);

export type PlannedInstallment = { number: number; dueDate: Date; amountCents: number };
export type Plan = { level: CreditLevel; downCents: number; financedCents: number; installments: PlannedInstallment[] };

/**
 * Plan de pagos de una compra: inicial (se paga para recibir la ropa) y cuotas
 * quincenales desde la fecha de compra. Los centavos de redondeo van a la última cuota.
 */
export function planFor(totalCents: number, level: CreditLevel, purchasedAt: Date): Plan {
  const rule = CREDIT_LEVELS[level];
  const downCents = Math.round((totalCents * rule.downBp) / 10_000);
  const financedCents = totalCents - downCents;
  const each = Math.floor(financedCents / rule.installments);
  const installments = Array.from({ length: rule.installments }, (_, i) => ({
    number: i + 1,
    dueDate: endOfCaracasDay(purchasedAt, INSTALLMENT_DAYS * (i + 1)),
    amountCents: i === rule.installments - 1 ? financedCents - each * (rule.installments - 1) : each,
  }));
  return { level, downCents, financedCents, installments };
}

export type CreditEligibility = { ok: true } | { ok: false; reason: string };

/** ¿Puede llevarse esta compra a crédito? (límite por nivel y un crédito abierto a la vez). */
export function checkEligibility(p: {
  status: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  level: CreditLevel;
  financedCents: number;
  openPlans: number;
  overdue: boolean;
  settings: CreditSettings;
}): CreditEligibility {
  if (!p.settings.enabled) return { ok: false, reason: "La compra a crédito no está disponible por ahora." };
  if (p.status === "PENDING") return { ok: false, reason: "Tu solicitud de crédito está en revisión. Te avisamos al aprobarla." };
  if (p.status === "SUSPENDED") return { ok: false, reason: "Tu crédito está suspendido. Escríbenos para revisarlo." };
  if (p.status !== "APPROVED") return { ok: false, reason: "Primero solicita tu crédito Credi-SF." };
  if (p.overdue) return { ok: false, reason: "Tienes una cuota vencida. Ponte al día para volver a comprar a crédito." };
  if (p.settings.oneOpenAtATime && p.openPlans > 0) return { ok: false, reason: "Ya tienes un crédito abierto. Al terminar de pagarlo puedes abrir otro." };
  const max = p.settings.maxByLevel[p.level];
  if (p.financedCents > max) {
    return { ok: false, reason: `Con tu nivel puedes financiar hasta $${(max / 100).toFixed(2)}. Quita algo de la bolsa o paga de contado.` };
  }
  return { ok: true };
}

// ───────────────────────────── Pagos y mora ─────────────────────────────

export type InstallmentDue = { amountCents: number; lateFeeCents: number };

/**
 * Reparte lo pagado (neto de IGTF) en orden: primero la inicial y después cada
 * cuota con su recargo. Devuelve cuánto lleva pagado cada parte.
 */
export function allocatePayments(downCents: number, installments: InstallmentDue[], paidCents: number) {
  let left = Math.max(0, paidCents);
  const downPaid = Math.min(left, downCents);
  left -= downPaid;
  const paid = installments.map((i) => {
    const owed = i.amountCents + i.lateFeeCents;
    const take = Math.min(left, owed);
    left -= take;
    return take;
  });
  const owedTotal = downCents + installments.reduce((a, i) => a + i.amountCents + i.lateFeeCents, 0);
  return { downPaid, paid, overpaidCents: left, remainingCents: Math.max(0, owedTotal - Math.max(0, paidCents)) };
}

/** 1 centavo de tolerancia por el redondeo de la conversión de Bs. */
export const isCovered = (paid: number, owed: number) => paid >= owed - 1;

export type InstallmentState = "paid" | "upcoming" | "due-today" | "grace" | "late";

/** Estado de una cuota: al día, vence hoy, en días de gracia o en mora. */
export function installmentState(i: { dueDate: Date; paid: boolean }, now: Date, graceDays: number): { state: InstallmentState; daysLate: number } {
  if (i.paid) return { state: "paid", daysLate: 0 };
  // Días de calendario (Caracas) desde el vencimiento: el día siguiente es el día 1 de retraso.
  const daysLate = Math.round((Date.parse(caracasDay(now)) - Date.parse(caracasDay(i.dueDate))) / DAY);
  if (daysLate <= 0) return { state: daysLate === 0 ? "due-today" : "upcoming", daysLate: 0 };
  // Recargo «a partir del día 6 de morosidad» con 5 días de gracia.
  return { state: daysLate > graceDays ? "late" : "grace", daysLate };
}

/** ¿Toca aplicar el recargo? Sin pagar, sin recargo previo y pasados los días de gracia. */
export function lateFeeDue(i: { dueDate: Date; paid: boolean; lateFeeApplied: boolean }, now: Date, graceDays: number): boolean {
  return !i.paid && !i.lateFeeApplied && installmentState(i, now, graceDays).state === "late";
}

export type ReminderKind = "before" | "due" | "late";

/**
 * Recordatorios que corresponden hoy: 2 días antes, el día del vencimiento y al
 * 3.er día de retraso. Solo los que no se mandaron todavía.
 */
export function remindersDue(
  i: { dueDate: Date; paid: boolean; remindedBeforeAt: Date | null; remindedDueAt: Date | null; remindedLateAt: Date | null },
  now: Date,
): ReminderKind[] {
  if (i.paid) return [];
  const today = caracasDay(now);
  const out: ReminderKind[] = [];
  const at = (days: number) => caracasDay(new Date(i.dueDate.getTime() + days * DAY));
  if (!i.remindedBeforeAt && today >= at(-2) && today < at(0)) out.push("before");
  if (!i.remindedDueAt && today === at(0)) out.push("due");
  if (!i.remindedLateAt && today >= at(3)) out.push("late");
  return out;
}

// ───────────────────────────── Niveles ─────────────────────────────

export type PlanHistory = { status: "ACTIVE" | "PAID" | "CANCELLED"; wentLate: boolean; createdAt: Date };

/**
 * Nivel que le corresponde a la clienta:
 * - Penalización: si tuvo mora (más de los días de gracia) en un crédito de los
 *   últimos 6 meses o tiene una cuota en mora ahora → Nivel 1 y no asciende.
 * - Nivel fijado a mano por la gerencia → se respeta (salvo penalización).
 * - Ascenso automático (nunca baja sola): `upgradeAfter` créditos pagados sin
 *   mora → Nivel 2; `vipAfter` → Nivel 3.
 */
export function evaluateLevel(p: { current: CreditLevel; manual: boolean; plans: PlanHistory[]; overdueNow: boolean; settings: Pick<CreditSettings, "upgradeAfter" | "vipAfter"> }, now = new Date()) {
  const recent = now.getTime() - 183 * DAY;
  const penalized = p.overdueNow || p.plans.some((x) => x.wentLate && x.createdAt.getTime() >= recent);
  if (penalized) return { level: 1 as CreditLevel, reason: "penalty" as const };
  if (p.manual) return { level: p.current, reason: "manual" as const };
  const punctual = p.plans.filter((x) => x.status === "PAID" && !x.wentLate).length;
  const earned: CreditLevel = punctual >= p.settings.vipAfter ? 3 : punctual >= p.settings.upgradeAfter ? 2 : 1;
  return { level: Math.max(p.current, earned) as CreditLevel, reason: earned > p.current ? ("upgrade" as const) : ("same" as const) };
}
