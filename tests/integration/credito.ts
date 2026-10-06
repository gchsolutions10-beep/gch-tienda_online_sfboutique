/**
 * Prueba de punta a punta de Credi-SF contra una base LOCAL con la demo cargada.
 * Nunca contra Neon.
 *
 *   DATABASE_URL=postgresql://…localhost… npx tsx tests/integration/credito.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db, tenantDb } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { cancelOrder, createWebOrder, registerPayment, reportPayment, reviewPayment } from "@/server/services/orders";
import { creditState, runCreditDaily } from "@/server/services/credit";
import { toCents } from "@/lib/money";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Solo contra una base local");

const DAY = 86_400_000;

async function main() {
  const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "sfboutique" } });
  const tdb = tenantDb(tenant.id);
  const admin = await db.user.findFirstOrThrow({ where: { memberships: { some: { tenantId: tenant.id, role: "TENANT_ADMIN" } } } });
  const actor = { id: admin.id, name: "Prueba" };
  await tdb.tenantSettings.updateMany({ data: { creditEnabled: true, igtfEnabled: false } });
  const rate = Number((await tdb.exchangeRate.findFirstOrThrow({ where: { source: "BCV" }, orderBy: { effectiveAt: "desc" } })).rate);
  const pm = await tdb.financialAccount.findFirstOrThrow({ where: { type: "PAGO_MOVIL" } });

  // Clienta con cuenta y crédito aprobado (Nivel 1).
  const phone = `+58414${String(Date.now()).slice(-7)}`;
  const customer = await tdb.customer.create({
    data: { tenantId: tenant.id, firstName: "Carla", lastName: "Prueba", idType: "V", idNumber: String(Date.now()).slice(-8), phone, passwordHash: await hashPassword("clave-segura"), accountCreatedAt: new Date(), creditStatus: "APPROVED" },
  });

  // Prenda barata para quedar dentro del límite de Nivel 1 ($100 financiados).
  const variant = await tdb.productVariant.findFirstOrThrow({
    where: { isActive: true, stock: { gt: 5 }, product: { priceUsd: { lte: 60 }, isActive: true } },
    select: { id: true, stock: true, product: { select: { priceUsd: true } } },
  });
  const buy = (quantity = 1) =>
    createWebOrder(tenant.id, {
      idempotencyKey: `credito-${Date.now()}-${Math.random()}`,
      lines: [{ variantId: variant.id, quantity }],
      fulfillment: "PICKUP",
      customer: { name: "Carla Prueba", idType: "V", idNumber: customer.idNumber, phone, email: null },
      shipping: { state: null, city: null, address: null, reference: null, carrier: null, office: null },
      notes: null,
      credit: { customerId: customer.id },
    });
  const pay = (orderId: string, usdCents: number) =>
    registerPayment(
      tenant.id,
      orderId,
      { method: "PAGO_MOVIL", currency: "VES", amountCents: Math.round(usdCents * rate), financialAccountId: pm.id, reference: "123", payerName: null, payerIdNumber: null, payerPhone: null, payerBank: null },
      actor,
    );

  // 1) Compra a crédito: plan de Nivel 1 (60 % + 20 % + 20 %).
  const o = await buy();
  const order = await tdb.order.findFirstOrThrow({ where: { trackingToken: o.trackingToken }, include: { creditPlan: { include: { installments: { orderBy: { number: "asc" } } } } } });
  const total = toCents(order.totalUsd);
  const plan = order.creditPlan!;
  assert.equal(order.isCredit, true);
  assert.equal(toCents(plan.downPaymentUsd), Math.round(total * 0.6));
  assert.equal(plan.installments.length, 2);
  assert.ok(Math.abs(toCents(plan.installments[0].amountUsd) - Math.round(total * 0.2)) <= 1);
  console.log(`✓ Pedido #${o.number} a crédito: $${total / 100} → inicial $${toCents(plan.downPaymentUsd) / 100} + 2 cuotas`);

  // Un solo crédito abierto a la vez.
  await assert.rejects(buy(), /crédito abierto/);

  // 2) La clienta reporta la inicial en Bs y la tienda la confirma: se entrega y baja el stock.
  const p1 = await reportPayment(tenant.id, o.trackingToken, {
    method: "PAGO_MOVIL",
    currency: "VES",
    amountCents: Math.round(toCents(plan.downPaymentUsd) * rate),
    financialAccountId: pm.id,
    reference: "5555",
    payerName: null,
    payerIdNumber: null,
    payerPhone: null,
    payerBank: null,
  });
  const r1 = await reviewPayment(tenant.id, p1.id, true, null, actor);
  assert.equal(r1.releases, true);
  assert.equal(r1.full, false);
  const afterDown = await tdb.order.findFirstOrThrow({ where: { id: order.id } });
  assert.equal(afterDown.status, "PAID");
  assert.equal(afterDown.paymentStatus, "PARTIAL");
  const stock = await tdb.productVariant.findFirstOrThrow({ where: { id: variant.id }, select: { stock: true } });
  assert.equal(stock.stock, variant.stock - 1);
  console.log("✓ Inicial confirmada: pedido pagado para entregar, stock descontado, cuotas pendientes");

  // La clienta puede seguir reportando cuotas aunque el pedido ya esté pagado.
  const extra = await reportPayment(tenant.id, o.trackingToken, {
    method: "PAGO_MOVIL", currency: "VES", amountCents: 1000, financialAccountId: pm.id, reference: "9999", payerName: null, payerIdNumber: null, payerPhone: null, payerBank: null,
  });
  await reviewPayment(tenant.id, extra.id, false, "Monto de prueba", actor);
  console.log("✓ Se pueden reportar cuotas después de la inicial");

  // 3) Recordatorios: 2 días antes, el día del pago y al 3.er día de retraso.
  const due1 = plan.installments[0].dueDate;
  const before = await runCreditDaily(tenant.id, new Date(due1.getTime() - 2 * DAY));
  assert.ok(before.reminders >= 1);
  const again = await runCreditDaily(tenant.id, new Date(due1.getTime() - 2 * DAY));
  assert.equal(again.reminders, 0, "no repite el recordatorio");
  await runCreditDaily(tenant.id, new Date(due1.getTime() - 3600_000));
  const i1 = await db.creditInstallment.findFirstOrThrow({ where: { id: plan.installments[0].id } });
  assert.ok(i1.remindedBeforeAt && i1.remindedDueAt);
  console.log("✓ Recordatorios del vencimiento sin repetirse");

  // 4) Día 5 de atraso: en gracia, sin recargo. Día 6: recargo de $5, mora y Nivel 1.
  await tdb.customer.update({ where: { id: customer.id }, data: { creditLevel: 2, creditLevelManual: true } });
  const grace = await runCreditDaily(tenant.id, new Date(due1.getTime() + 5 * DAY));
  assert.equal(grace.fees, 0);
  const late = await runCreditDaily(tenant.id, new Date(due1.getTime() + 6 * DAY));
  assert.equal(late.fees, 1);
  const i1late = await db.creditInstallment.findFirstOrThrow({ where: { id: plan.installments[0].id } });
  assert.equal(toCents(i1late.lateFeeUsd), 500);
  const penalized = await tdb.customer.findFirstOrThrow({ where: { id: customer.id } });
  assert.equal(penalized.creditLevel, 1);
  assert.equal(penalized.creditLevelManual, false);
  assert.equal(await runCreditDaily(tenant.id, new Date(due1.getTime() + 7 * DAY)).then((x) => x.fees), 0, "el recargo es una sola vez");
  console.log("✓ Recargo de $5 desde el día 6, una sola vez, y baja a Nivel 1 aunque estuviera fijado");

  // 5) Paga la cuota 1 con el recargo y la cuota 2: crédito terminado.
  const r2 = await pay(order.id, toCents(i1late.amountUsd) + 500);
  assert.equal(r2.full, false);
  assert.deepEqual(r2.plan?.newlyPaid, [1]);
  const r3 = await pay(order.id, toCents(plan.installments[1].amountUsd));
  assert.equal(r3.full, true);
  assert.equal(r3.plan?.finished, true);
  const finished = await tdb.creditPlan.findFirstOrThrow({ where: { id: plan.id } });
  assert.equal(finished.status, "PAID");
  assert.equal(finished.wentLate, true);
  assert.equal((await tdb.order.findFirstOrThrow({ where: { id: order.id } })).paymentStatus, "PAID");
  console.log("✓ Cuotas pagadas (con su recargo): crédito terminado");

  // 6) Con mora reciente no sube de nivel; sin mora, sube a Nivel 2 tras 3 créditos a tiempo.
  const clean = await tdb.customer.create({
    data: { tenantId: tenant.id, firstName: "Diana", idType: "V", idNumber: String(Date.now() + 1).slice(-8), phone: `+58424${String(Date.now()).slice(-7)}`, passwordHash: "x", creditStatus: "APPROVED" },
  });
  for (let n = 1; n <= 3; n++) {
    const ord = await createWebOrder(tenant.id, {
      idempotencyKey: `credito-diana-${n}-${Date.now()}`,
      lines: [{ variantId: variant.id, quantity: 1 }],
      fulfillment: "PICKUP",
      customer: { name: "Diana", idType: "V", idNumber: clean.idNumber, phone: clean.phone!, email: null },
      shipping: { state: null, city: null, address: null, reference: null, carrier: null, office: null },
      notes: null,
      credit: { customerId: clean.id },
    });
    const row = await tdb.order.findFirstOrThrow({ where: { trackingToken: ord.trackingToken } });
    await pay(row.id, toCents(row.totalUsd));
  }
  const promoted = await tdb.customer.findFirstOrThrow({ where: { id: clean.id } });
  assert.equal(promoted.creditLevel, 2);
  const s2 = await creditState(tenant.id, clean.id);
  assert.equal(s2.level, 2);
  console.log("✓ Tras 3 créditos pagados a tiempo sube a Nivel 2 (50 % + 3 cuotas)");

  // 7) Límite del nivel y anulación.
  await assert.rejects(
    createWebOrder(tenant.id, {
      idempotencyKey: `credito-limite-${Date.now()}`,
      lines: [{ variantId: variant.id, quantity: 20 }],
      fulfillment: "PICKUP",
      customer: { name: "Diana", idType: "V", idNumber: clean.idNumber, phone: clean.phone!, email: null },
      shipping: { state: null, city: null, address: null, reference: null, carrier: null, office: null },
      notes: null,
      credit: { customerId: clean.id },
    }),
    /financiar hasta|Solo quedan|quedan/,
  );
  const o4 = await createWebOrder(tenant.id, {
    idempotencyKey: `credito-anular-${Date.now()}`,
    lines: [{ variantId: variant.id, quantity: 1 }],
    fulfillment: "PICKUP",
    customer: { name: "Diana", idType: "V", idNumber: clean.idNumber, phone: clean.phone!, email: null },
    shipping: { state: null, city: null, address: null, reference: null, carrier: null, office: null },
    notes: null,
    credit: { customerId: clean.id },
  });
  const o4row = await tdb.order.findFirstOrThrow({ where: { trackingToken: o4.trackingToken }, include: { creditPlan: true } });
  assert.equal(o4row.creditPlan?.level, 2);
  await cancelOrder(tenant.id, o4row.id, "Prueba", actor);
  assert.equal((await tdb.creditPlan.findFirstOrThrow({ where: { orderId: o4row.id } })).status, "CANCELLED");
  console.log("✓ Respeta el límite del nivel; anular el pedido anula el plan");

  console.log("\nTodo bien.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
