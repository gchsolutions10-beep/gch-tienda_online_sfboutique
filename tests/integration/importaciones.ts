/**
 * Prueba de punta a punta de Importaciones contra una base LOCAL con la demo cargada.
 * Nunca contra Neon.
 *
 *   DATABASE_URL=postgresql://…localhost… npx tsx tests/integration/importaciones.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db, tenantDb } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { advanceOrder, reportPayment, reviewPayment } from "@/server/services/orders";
import {
  acceptImportQuote,
  createImportRequest,
  joinImportProduct,
  publishImportRequest,
  quoteImportRequest,
  rejectImportRequest,
  setBatchStatus,
  submitBatchReview,
} from "@/server/services/imports";
import { toCents } from "@/lib/money";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Solo contra una base local");

const DAY = 86_400_000;

async function main() {
  const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "sfboutique" } });
  const tdb = tenantDb(tenant.id);
  const admin = await db.user.findFirstOrThrow({ where: { memberships: { some: { tenantId: tenant.id, role: "TENANT_ADMIN" } } } });
  const actor = { id: admin.id, name: "Prueba" };
  const rate = Number((await tdb.exchangeRate.findFirstOrThrow({ where: { source: "BCV" }, orderBy: { effectiveAt: "desc" } })).rate);
  const pm = await tdb.financialAccount.findFirstOrThrow({ where: { type: "PAGO_MOVIL" } });
  const zelle = await tdb.financialAccount.findFirst({ where: { currency: "USD" } });

  const newCustomer = async (firstName: string) =>
    tdb.customer.create({
      data: {
        tenantId: tenant.id,
        firstName,
        lastName: "Prueba",
        idType: "V",
        idNumber: String(Date.now() + Math.floor(Math.random() * 1000)).slice(-8),
        phone: `+58414${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-7)}`,
        passwordHash: await hashPassword("clave-segura"),
        accountCreatedAt: new Date(),
      },
    });
  const ana = await newCustomer("Ana");
  const bea = await newCustomer("Bea");
  const now = new Date();
  const batch = await tdb.importBatch.create({
    data: { tenantId: tenant.id, name: `Lote prueba ${now.getTime()}`, slug: `lote-prueba-${now.getTime()}`, status: "DRAFT", opensAt: new Date(now.getTime() - DAY), closesAt: new Date(now.getTime() + 10 * DAY) },
  });
  const request = (customerId: string, isPrivate = false) =>
    createImportRequest(tenant.id, customerId, {
      batchId: batch.id,
      url: "https://us.shein.com/Vestido-p-1.html",
      store: "SHEIN",
      title: "Vestido largo",
      size: "M",
      color: "Negro",
      quantity: 2,
      notes: null,
      isPrivate,
      photo: { data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mime: "image/jpeg" },
    });

  // 0) Con el módulo apagado no se puede encargar.
  await tdb.tenantSettings.updateMany({ data: { importsEnabled: false } });
  await assert.rejects(request(ana.id), /no están disponibles/);
  await tdb.tenantSettings.updateMany({ data: { importsEnabled: true, importDepositPct: 50, importCommissionPct: 15, igtfEnabled: false } });
  // Lote en borrador: no recibe pedidos.
  await assert.rejects(request(ana.id), /lote abierto/);
  await setBatchStatus(tenant.id, batch.id, "OPEN", actor);
  console.log("✓ Módulo apagado o lote cerrado: no se encarga");

  // 1) Encargo con foto privada.
  const r1 = await request(ana.id);
  const row1 = await tdb.importRequest.findFirstOrThrow({ where: { id: r1.id } });
  assert.equal(row1.status, "PENDING_REVIEW");
  assert.equal(row1.photoKey, `encargo-${r1.id}`);
  assert.ok(await tdb.tenantAsset.findFirst({ where: { kind: `encargo-${r1.id}` } }));
  console.log("✓ Encargo recibido con su foto privada");

  // 2) Privado: no se publica.
  const rp = await request(bea.id, true);
  await assert.rejects(publishImportRequest(tenant.id, rp.id, { title: "x", description: null, estimatedPriceCents: null, sizes: null, colors: null }), /privado/);
  await rejectImportRequest(tenant.id, rp.id, "Producto no permitido");
  assert.equal((await tdb.importRequest.findFirstOrThrow({ where: { id: rp.id } })).status, "REJECTED");
  console.log("✓ Un encargo privado no se publica; rechazo con motivo");

  // 3) Publicar en la galería y que otra clienta se una (contador grupal).
  const product = await publishImportRequest(tenant.id, r1.id, { title: "Vestido largo", description: null, estimatedPriceCents: 2500, sizes: "S, M, L", colors: "Negro" });
  const prod = await tdb.importProduct.findFirstOrThrow({ where: { id: product.id } });
  assert.ok(prod.imageUrl?.startsWith(`/marca/importacion-${product.id}`));
  await joinImportProduct(tenant.id, bea.id, product.id, { size: "S", color: "Negro", quantity: 1, notes: null });
  await assert.rejects(joinImportProduct(tenant.id, bea.id, product.id, { size: "S", color: "Negro", quantity: 1, notes: null }), /Ya te sumaste/);
  const group = await tdb.importRequest.findMany({ where: { productId: product.id }, select: { customerId: true } });
  assert.equal(new Set(group.map((g) => g.customerId)).size, 2);
  console.log("✓ Publicado en la galería; 2 usuarias en el pedido grupal");

  // 4) Cotizar: 2 × $12 + $8 flete + $4,80 comisión = $36,80; adelanto $18,40.
  const q = await quoteImportRequest(tenant.id, r1.id, { unitCostCents: 1200, freightCents: 800, commissionCents: 480, note: "Llega en 25 días", batchId: null }, actor);
  const settings = await tdb.tenantSettings.findFirstOrThrow();
  const ivaAdded = settings.ivaEnabled && settings.taxMode === "TAX_ADDED";
  if (!ivaAdded) {
    assert.equal(q.totalCents, 3680);
    assert.equal(q.depositCents, 1840);
  }
  console.log(`✓ Cotizado: total $${q.totalCents / 100}, adelanto $${q.depositCents / 100}`);

  // Otra clienta no puede aceptar la cotización de Ana.
  await assert.rejects(acceptImportQuote(tenant.id, bea.id, r1.id), /no encontrado/);

  // 5) Aceptar: se crea un pedido normal de importación.
  const o = await acceptImportQuote(tenant.id, ana.id, r1.id);
  const order = await tdb.order.findFirstOrThrow({ where: { id: o.id }, include: { items: true } });
  assert.equal(order.isImport, true);
  assert.equal(toCents(order.totalUsd), q.totalCents);
  assert.equal(toCents(order.importDepositUsd), q.depositCents);
  assert.equal(order.items.length, 2);
  assert.equal(order.reservedUntil, null);
  assert.equal((await tdb.importRequest.findFirstOrThrow({ where: { id: r1.id } })).status, "ACCEPTED");
  await assert.rejects(acceptImportQuote(tenant.id, ana.id, r1.id), /no tiene una cotización/);
  console.log(`✓ Pedido #${o.number} creado al aceptar (no vence la reserva)`);

  // 6) La clienta reporta el adelanto en Bs y la tienda lo confirma: pasa a Pagado (parcial).
  const p1 = await reportPayment(tenant.id, o.trackingToken, {
    method: "PAGO_MOVIL",
    currency: "VES",
    amountCents: Math.round(q.depositCents * rate),
    financialAccountId: pm.id,
    reference: "1111",
    payerName: null,
    payerIdNumber: null,
    payerPhone: null,
    payerBank: null,
  });
  await reviewPayment(tenant.id, p1.id, true, null, actor);
  let after = await tdb.order.findFirstOrThrow({ where: { id: o.id } });
  assert.equal(after.status, "PAID");
  assert.equal(after.paymentStatus, "PARTIAL");
  console.log("✓ Adelanto confirmado: el encargo se procesa (pago parcial)");

  // 7) Cerrar el lote: los encargos con adelanto pasan a Preparando.
  const moved = await setBatchStatus(tenant.id, batch.id, "IN_PROCESS", actor);
  assert.equal(moved.advanced, 1);
  assert.equal((await tdb.order.findFirstOrThrow({ where: { id: o.id } })).status, "PREPARING");
  await advanceOrder(tenant.id, o.id, "READY", { carrier: null, trackingNumber: null }, actor);
  // Sin el saldo no se entrega.
  await assert.rejects(advanceOrder(tenant.id, o.id, "DELIVERED", { carrier: null, trackingNumber: null }, actor), /saldo/);
  console.log("✓ Lote en proceso → Preparando → Llegó; sin saldo no se entrega");

  // 8) Reporta el saldo (se permite después del adelanto) y la tienda lo confirma.
  const balance = q.totalCents - q.depositCents;
  const p2 = await reportPayment(tenant.id, o.trackingToken, {
    method: zelle ? "ZELLE" : "PAGO_MOVIL",
    currency: zelle ? "USD" : "VES",
    amountCents: zelle ? balance : Math.round(balance * rate),
    financialAccountId: zelle?.id ?? pm.id,
    reference: "2222",
    payerName: null,
    payerIdNumber: null,
    payerPhone: null,
    payerBank: null,
  });
  await reviewPayment(tenant.id, p2.id, true, null, actor);
  after = await tdb.order.findFirstOrThrow({ where: { id: o.id } });
  assert.equal(after.paymentStatus, "PAID");
  await advanceOrder(tenant.id, o.id, "DELIVERED", { carrier: null, trackingNumber: null }, actor);
  await assert.rejects(reportPayment(tenant.id, o.trackingToken, { method: "PAGO_MOVIL", currency: "VES", amountCents: 100, financialAccountId: pm.id, reference: "3", payerName: null, payerIdNumber: null, payerPhone: null, payerBank: null }), /ya no espera pagos/);
  console.log("✓ Saldo pagado y entregado; ya no acepta pagos");

  // 9) Reseñas: solo cuando el lote se entregó y solo quien recibió.
  await assert.rejects(submitBatchReview(tenant.id, ana.id, batch.id, 5, "Excelente calidad"), /todavía no fue entregado/);
  await setBatchStatus(tenant.id, batch.id, "DELIVERED", actor);
  await assert.rejects(submitBatchReview(tenant.id, bea.id, batch.id, 5, "Me encantó todo"), /Solo pueden opinar/);
  await submitBatchReview(tenant.id, ana.id, batch.id, 5, "Excelente calidad y llegó a tiempo");
  const review = await tdb.importReview.findFirstOrThrow({ where: { batchId: batch.id, customerId: ana.id } });
  assert.equal(review.isApproved, false);
  console.log("✓ Reseña verificada (queda por aprobar)");

  // Limpieza de lo creado.
  await tdb.importBatch.deleteMany({ where: { id: batch.id } });
  await db.tenantAsset.deleteMany({ where: { tenantId: tenant.id, kind: { in: [`encargo-${r1.id}`, `encargo-${rp.id}`, `importacion-${product.id}`] } } });
  console.log("\nTodo bien.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
