import type { Prisma } from "@/generated/prisma/client";
import { tenantDb, type TenantDb } from "@/server/db";
import { sendPushToCustomer } from "@/server/services/push";
import { centsToDecimalString, formatUsd, toCents } from "@/lib/money";
import {
  allocatePayments,
  asLevel,
  caracasDay,
  checkEligibility,
  CREDIT_LEVELS,
  evaluateLevel,
  installmentState,
  isCovered,
  lateFeeDue,
  planFor,
  remindersDue,
  type CreditLevel,
  type CreditSettings,
  type ReminderKind,
} from "@/lib/credit";

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
const money = centsToDecimalString;

/** Configuración del crédito. Dentro de una transacción, pásale `tx` (si no, espera a otra conexión). */
export async function getCreditSettings(tenantId: string, client?: Tx): Promise<CreditSettings> {
  const s = client ? await client.tenantSettings.findFirst({ where: { tenantId } }) : await tenantDb(tenantId).tenantSettings.findFirst();
  return {
    enabled: s?.creditEnabled ?? false,
    lateFeeCents: toCents(s?.creditLateFeeUsd ?? 5),
    graceDays: s?.creditGraceDays ?? 5,
    maxByLevel: { 1: toCents(s?.creditMaxLevel1Usd ?? 100), 2: toCents(s?.creditMaxLevel2Usd ?? 250), 3: toCents(s?.creditMaxLevel3Usd ?? 500) },
    upgradeAfter: s?.creditUpgradeAfter ?? 3,
    vipAfter: s?.creditVipAfter ?? 6,
    oneOpenAtATime: s?.creditOneOpen ?? true,
  };
}

const installmentSelect = { id: true, number: true, dueDate: true, amountUsd: true, lateFeeUsd: true, paidUsd: true, paidAt: true } satisfies Prisma.CreditInstallmentSelect;

/** Situación de crédito de la clienta: estado, nivel, créditos abiertos y si tiene cuotas vencidas. */
export async function creditState(tenantId: string, customerId: string, now = new Date()) {
  const tdb = tenantDb(tenantId);
  const [customer, plans] = await Promise.all([
    tdb.customer.findFirst({ where: { id: customerId }, select: { creditStatus: true, creditLevel: true, creditLevelManual: true } }),
    tdb.creditPlan.findMany({
      where: { customerId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, orderId: true, order: { select: { number: true, trackingToken: true, status: true } }, installments: { orderBy: { number: "asc" }, select: installmentSelect } },
    }),
  ]);
  // Solo cuentan los créditos cuya inicial ya se pagó (la ropa ya se entregó o se está preparando).
  const open = plans.filter((p) => !["PENDING", "PAYMENT_REVIEW", "CANCELLED"].includes(p.order.status));
  const overdue = open.some((p) => p.installments.some((i) => !i.paidAt && i.dueDate < now));
  return {
    status: customer?.creditStatus ?? "NONE",
    level: asLevel(customer?.creditLevel ?? 1),
    manual: customer?.creditLevelManual ?? false,
    openPlans: plans.length,
    overdue,
    plans,
  };
}

/** Plan que tendría esta compra y si la clienta puede llevársela a crédito. */
export async function quoteCredit(tenantId: string, customerId: string, totalCents: number, now = new Date()) {
  const [settings, state] = await Promise.all([getCreditSettings(tenantId), creditState(tenantId, customerId, now)]);
  const plan = planFor(totalCents, state.level, now);
  const eligibility = checkEligibility({
    status: state.status,
    level: state.level,
    financedCents: plan.financedCents,
    openPlans: state.openPlans,
    overdue: state.overdue,
    settings,
  });
  return { plan, eligibility, level: state.level, settings };
}

/** Crea el plan y sus cuotas dentro de la transacción del pedido. */
export async function createCreditPlan(tx: Tx, p: { tenantId: string; orderId: string; customerId: string; totalCents: number; level: CreditLevel; now: Date }) {
  const plan = planFor(p.totalCents, p.level, p.now);
  const app = await tx.creditApplication.findFirst({ where: { customerId: p.customerId, status: "APPROVED" }, orderBy: { reviewedAt: "desc" }, select: { id: true } });
  await tx.creditPlan.create({
    data: {
      tenantId: p.tenantId,
      orderId: p.orderId,
      customerId: p.customerId,
      applicationId: app?.id ?? null,
      level: plan.level,
      downPaymentUsd: money(plan.downCents),
      financedUsd: money(plan.financedCents),
      installmentsCount: plan.installments.length,
      installments: { create: plan.installments.map((i) => ({ number: i.number, dueDate: i.dueDate, amountUsd: money(i.amountCents) })) },
    },
  });
  return plan;
}

/** Lo que se debe en total (compra + recargos por mora) y lo mínimo para entregar (la inicial). */
export async function creditOwed(tx: Tx | TenantDb, orderId: string) {
  const plan = await tx.creditPlan.findFirst({ where: { orderId }, select: { downPaymentUsd: true, installments: { select: { lateFeeUsd: true } } } });
  if (!plan) return null;
  return { downCents: toCents(plan.downPaymentUsd), feesCents: plan.installments.reduce((a, i) => a + toCents(i.lateFeeUsd), 0) };
}

/**
 * Reparte lo pagado del pedido entre la inicial y las cuotas, marca las cuotas
 * pagadas (con su fecha) y cierra el plan cuando está todo cubierto.
 * Devuelve las cuotas recién pagadas y si el plan terminó.
 */
export async function syncCreditPlan(tx: Tx, tenantId: string, orderId: string, paidCents: number, now = new Date()) {
  const plan = await tx.creditPlan.findFirst({
    where: { orderId },
    select: { id: true, status: true, customerId: true, downPaymentUsd: true, installments: { orderBy: { number: "asc" }, select: installmentSelect } },
  });
  if (!plan || plan.status === "CANCELLED") return null;
  const dues = plan.installments.map((i) => ({ amountCents: toCents(i.amountUsd), lateFeeCents: toCents(i.lateFeeUsd) }));
  const alloc = allocatePayments(toCents(plan.downPaymentUsd), dues, paidCents);
  const newlyPaid: number[] = [];
  for (const [k, i] of plan.installments.entries()) {
    const covered = isCovered(alloc.paid[k], dues[k].amountCents + dues[k].lateFeeCents);
    if (toCents(i.paidUsd) !== alloc.paid[k] || Boolean(i.paidAt) !== covered) {
      await tx.creditInstallment.update({
        where: { id: i.id },
        data: { paidUsd: money(alloc.paid[k]), paidAt: covered ? (i.paidAt ?? now) : null },
      });
      if (covered && !i.paidAt) newlyPaid.push(i.number);
    }
  }
  const downCovered = isCovered(alloc.downPaid, toCents(plan.downPaymentUsd));
  const allPaid = downCovered && plan.installments.every((_, k) => isCovered(alloc.paid[k], dues[k].amountCents + dues[k].lateFeeCents));
  let finished = false;
  if (allPaid && plan.status === "ACTIVE") {
    await tx.creditPlan.update({ where: { id: plan.id }, data: { status: "PAID", paidAt: now } });
    finished = true;
  } else if (!allPaid && plan.status === "PAID") {
    await tx.creditPlan.update({ where: { id: plan.id }, data: { status: "ACTIVE", paidAt: null } });
  }
  const level = finished ? await reevaluateLevel(tx, tenantId, plan.customerId, now) : null;
  return { newlyPaid, finished, downCovered, remainingCents: alloc.remainingCents, level };
}

/** Recalcula el nivel de la clienta (ascenso automático o penalización por mora). */
export async function reevaluateLevel(tx: Tx, tenantId: string, customerId: string, now = new Date()) {
  const settings = await getCreditSettings(tenantId, tx);
  const customer = await tx.customer.findFirst({ where: { id: customerId }, select: { creditLevel: true, creditLevelManual: true } });
  if (!customer) return null;
  const plans = await tx.creditPlan.findMany({
    where: { customerId, status: { not: "CANCELLED" } },
    select: { status: true, wentLate: true, createdAt: true, installments: { select: { dueDate: true, paidAt: true } } },
  });
  const overdueNow = plans.some((p) => p.status === "ACTIVE" && p.installments.some((i) => installmentState({ dueDate: i.dueDate, paid: Boolean(i.paidAt) }, now, settings.graceDays).state === "late"));
  const r = evaluateLevel({ current: asLevel(customer.creditLevel), manual: customer.creditLevelManual, plans, overdueNow, settings }, now);
  if (r.level !== customer.creditLevel) {
    await tx.customer.update({
      where: { id: customerId },
      data: { creditLevel: r.level, ...(r.reason === "penalty" ? { creditLevelManual: false, creditLevelNote: "Bajó a Nivel 1 por mora" } : {}) },
    });
  }
  return { from: asLevel(customer.creditLevel), to: r.level, reason: r.reason };
}

/** Aviso push tras confirmar un pago de un pedido a crédito (fuera de la transacción). */
export async function notifyCreditPayment(tenantId: string, orderId: string) {
  const tdb = tenantDb(tenantId);
  const plan = await tdb.creditPlan.findFirst({
    where: { orderId },
    select: { customerId: true, status: true, order: { select: { number: true, trackingToken: true } }, customer: { select: { creditLevel: true } }, installments: { orderBy: { number: "asc" }, select: installmentSelect } },
  });
  if (!plan) return;
  const next = plan.installments.find((i) => !i.paidAt);
  const level = CREDIT_LEVELS[asLevel(plan.customer.creditLevel)];
  const body =
    plan.status === "PAID"
      ? `¡Terminaste de pagar tu pedido #${plan.order.number}! Tu crédito está en ${level.name}.`
      : next
        ? `Recibimos tu pago del pedido #${plan.order.number}. Próxima cuota: ${formatUsd(toCents(next.amountUsd) + toCents(next.lateFeeUsd) - toCents(next.paidUsd))} el ${fmtDay(next.dueDate)}.`
        : `Recibimos tu pago del pedido #${plan.order.number}.`;
  await sendPushToCustomer(tenantId, plan.customerId, { title: "✅ Pago recibido", body, url: `/pedido/${plan.order.trackingToken}`, tag: `pago-${orderId}` }).catch(() => 0);
}

const fmtDay = (d: Date) => d.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Caracas" });

const REMINDER: Record<ReminderKind, (p: { amount: string; day: string; number: number; fee: string }) => { title: string; body: string }> = {
  before: (p) => ({ title: "⏰ Tu cuota vence en 2 días", body: `Cuota de ${p.amount} del pedido #${p.number}: vence el ${p.day}.` }),
  due: (p) => ({ title: "📅 Hoy vence tu cuota", body: `Paga hoy ${p.amount} del pedido #${p.number} y mantén tu nivel de crédito.` }),
  late: (p) => ({ title: "⚠️ Tienes una cuota atrasada", body: `La cuota de ${p.amount} del pedido #${p.number} venció el ${p.day}. Evita el recargo de ${p.fee}: paga antes de que termine el lapso de gracia.` }),
};

/**
 * Tarea diaria (cron): aplica recargos por mora, baja de nivel por mora y manda
 * los recordatorios push. Es idempotente: se puede correr varias veces al día.
 */
export async function runCreditDaily(tenantId: string, now = new Date()) {
  const tdb = tenantDb(tenantId);
  const settings = await getCreditSettings(tenantId);
  const installments = await tdb.creditPlan.findMany({
    where: { status: "ACTIVE", order: { status: { notIn: ["PENDING", "PAYMENT_REVIEW", "CANCELLED"] } } },
    select: {
      id: true,
      customerId: true,
      order: { select: { id: true, number: true, trackingToken: true } },
      installments: {
        where: { paidAt: null },
        orderBy: { number: "asc" },
        select: { ...installmentSelect, lateFeeAt: true, remindedBeforeAt: true, remindedDueAt: true, remindedLateAt: true },
      },
    },
  });
  const out = { fees: 0, reminders: 0, delivered: 0, penalized: 0 };
  for (const plan of installments) {
    for (const i of plan.installments) {
      const base = { dueDate: i.dueDate, paid: false };
      if (lateFeeDue({ ...base, lateFeeApplied: Boolean(i.lateFeeAt) }, now, settings.graceDays) && settings.lateFeeCents > 0) {
        const level = await tdb.$transaction(async (tx) => {
          const claimed = await tx.creditInstallment.updateMany({ where: { id: i.id, lateFeeAt: null, paidAt: null }, data: { lateFeeUsd: money(settings.lateFeeCents), lateFeeAt: now } });
          if (!claimed.count) return null;
          await tx.creditPlan.update({ where: { id: plan.id }, data: { wentLate: true } });
          await tx.orderEvent.create({ data: { orderId: plan.order.id, note: `Cuota ${i.number} en mora: recargo de ${formatUsd(settings.lateFeeCents)}` } });
          await tx.order.update({ where: { id: plan.order.id }, data: { paymentStatus: "PARTIAL" } });
          return reevaluateLevel(tx, tenantId, plan.customerId, now);
        });
        if (level) {
          out.fees += 1;
          if (level.reason === "penalty" && level.from !== level.to) out.penalized += 1;
        }
      }
      for (const kind of remindersDue({ ...base, remindedBeforeAt: i.remindedBeforeAt, remindedDueAt: i.remindedDueAt, remindedLateAt: i.remindedLateAt }, now)) {
        const field = kind === "before" ? "remindedBeforeAt" : kind === "due" ? "remindedDueAt" : "remindedLateAt";
        const claimed = await tdb.$transaction((tx) => tx.creditInstallment.updateMany({ where: { id: i.id, [field]: null }, data: { [field]: now } }));
        if (!claimed.count) continue;
        const owed = toCents(i.amountUsd) + toCents(i.lateFeeUsd) - toCents(i.paidUsd);
        const msg = REMINDER[kind]({ amount: formatUsd(owed), day: fmtDay(i.dueDate), number: plan.order.number, fee: formatUsd(settings.lateFeeCents) });
        out.reminders += 1;
        out.delivered += await sendPushToCustomer(tenantId, plan.customerId, { ...msg, url: `/pedido/${plan.order.trackingToken}`, tag: `cuota-${i.id}-${kind}` }).catch(() => 0);
      }
    }
  }
  return { ...out, day: caracasDay(now) };
}
