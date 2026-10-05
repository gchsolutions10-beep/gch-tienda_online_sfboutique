/**
 * Prueba de punta a punta de la fase 4 contra una base LOCAL con la demo cargada
 * (npm run db:local + prisma migrate deploy + prisma db seed). Nunca contra Neon.
 *
 *   DATABASE_URL=postgresql://…localhost… npx tsx tests/integration/facturacion.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db, tenantDb } from "@/server/db";
import { createWebOrder, registerPayment, reportPayment, reviewPayment } from "@/server/services/orders";
import { createStoreSale, openSession } from "@/server/services/cash";
import { issueCreditNote, issueDebitNote, issueInvoice, previewOrderInvoice, salesBook, setControlNumber, voidDocument } from "@/server/services/invoices";
import { currentMonth, parseLines, salesBookTotals } from "@/lib/invoicing";
import { toCents } from "@/lib/money";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Solo contra una base local");

async function main() {
  const tenant = await db.tenant.findFirstOrThrow({ where: { slug: "sfboutique" } });
  const tdb = tenantDb(tenant.id);
  const admin = await db.user.findFirstOrThrow({ where: { memberships: { some: { tenantId: tenant.id, role: "TENANT_ADMIN" } } } });
  const actor = { id: admin.id, name: "Prueba" };

  // Datos fiscales, IGTF 3 % y formatos de forma libre.
  await db.tenant.update({ where: { id: tenant.id }, data: { legalName: "SF Boutique, C.A.", rif: "J-40123456-0", fiscalAddress: "Av. Libertador, Acarigua, Portuguesa" } });
  await tdb.tenantSettings.updateMany({ data: { igtfEnabled: true, igtfRate: "0.0300" } });
  await tdb.invoiceSeries.updateMany({ where: { type: { in: ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] } }, data: { controlMode: "FREE_FORM", controlPrefix: "00-", nextControl: 100, controlTo: 103 } });

  const variants = await tdb.productVariant.findMany({ where: { isActive: true, stock: { gt: 3 } }, take: 2, select: { id: true } });
  assert.equal(variants.length, 2);

  // 1) Pedido web pagado en USD con IGTF.
  const order = await createWebOrder(tenant.id, {
    idempotencyKey: `prueba-${Date.now()}`,
    lines: [{ variantId: variants[0].id, quantity: 2 }],
    fulfillment: "PICKUP",
    customer: { name: "María González", idType: "V", idNumber: "18456789", phone: "+584141112233", email: null },
    shipping: { state: null, city: null, address: null, reference: null, carrier: null, office: null },
    notes: null,
  });
  const o = await tdb.order.findFirstOrThrow({ where: { trackingToken: order.trackingToken } });
  const total = toCents(o.totalUsd);
  const gross = total + Math.round((total * 300) / 10_000);
  const pay = await reportPayment(tenant.id, order.trackingToken, {
    method: "ZELLE",
    currency: "USD",
    amountCents: gross,
    financialAccountId: null,
    reference: "ZELLE123",
    payerName: null,
    payerIdNumber: null,
    payerPhone: null,
    payerBank: null,
  });
  const reviewed = await reviewPayment(tenant.id, pay.id, true, null, actor);
  assert.equal(reviewed.full, true, "el pago con IGTF cubre el pedido");
  const paid = await tdb.order.findFirstOrThrow({ where: { id: o.id } });
  assert.equal(toCents(paid.igtfUsd), gross - total, "IGTF guardado en el pedido");
  assert.equal(toCents(paid.igtfBaseUsd), total);
  assert.equal(toCents(paid.paidUsd), total, "lo abonado no incluye el IGTF");
  console.log(`✓ Pedido #${paid.number}: $${total / 100} + IGTF $${(gross - total) / 100}`);

  // 2) Factura con número de control del rango.
  const preview = await previewOrderInvoice(tenant.id, o.id);
  assert.equal(preview?.problem, null);
  const inv = await issueInvoice(tenant.id, o.id, { name: "María González", idType: "V", idNumber: "18456789", address: null, phone: null, email: null }, actor);
  const invRow = await tdb.invoice.findFirstOrThrow({ where: { id: inv.id } });
  assert.equal(invRow.controlNumber, "00-00000100");
  assert.ok(toCents(invRow.igtfVes) > 0, "la factura muestra el IGTF");
  assert.equal(toCents(invRow.totalVes), toCents(invRow.taxableVes) + toCents(invRow.exemptVes) + toCents(invRow.ivaVes) + toCents(invRow.igtfVes));
  await assert.rejects(issueInvoice(tenant.id, o.id, { name: "X", idType: "V", idNumber: "1", address: null, phone: null, email: null }, actor), /ya tiene factura/);
  console.log(`✓ Factura N.º ${invRow.number} control ${invRow.controlNumber} · Bs ${toCents(invRow.totalVes) / 100}`);

  // 3) Nota de crédito por 1 unidad; no se puede devolver más de lo facturado.
  const nc = await issueCreditNote(tenant.id, inv.id, [1], "Devolución por talla", actor);
  const ncRow = await tdb.invoice.findFirstOrThrow({ where: { id: nc.id } });
  assert.equal(ncRow.controlNumber, "00-00000101", "las notas comparten el rango de control (mismos formatos)");
  assert.equal(parseLines(ncRow.lines)[0].quantity, 1);
  await assert.rejects(issueCreditNote(tenant.id, inv.id, [2], "Otra", actor), /más de lo que queda/);
  console.log(`✓ Nota de crédito control ${ncRow.controlNumber} · Bs ${toCents(ncRow.totalVes) / 100}`);

  // 4) Nota de débito, y el rango se acaba.
  const nd = await issueDebitNote(tenant.id, inv.id, "Envío adicional", 50_000, true, actor);
  assert.equal((await tdb.invoice.findFirstOrThrow({ where: { id: nd.id } })).controlNumber, "00-00000102");
  await issueDebitNote(tenant.id, inv.id, "Ajuste", 1_000, false, actor);
  await assert.rejects(issueDebitNote(tenant.id, inv.id, "Otro", 1_000, false, actor), /Se acabaron/);
  console.log("✓ Nota de débito y aviso de rango agotado");

  // 5) Anular: no se puede con notas vigentes; la nota sí.
  await assert.rejects(voidDocument(tenant.id, inv.id, "Error", actor), /notas/);
  await voidDocument(tenant.id, nd.id, "Cargo duplicado", actor);
  console.log("✓ Anulación");

  // 6) Venta en tienda con pago mixto e IGTF, factura en imprenta digital.
  await tdb.invoiceSeries.updateMany({ where: { type: "INVOICE" }, data: { controlMode: "DIGITAL_PRINTER", controlPrefix: null, nextControl: null, controlTo: null } });
  const register = await tdb.cashRegister.findFirstOrThrow({ where: { isActive: true } });
  await tdb.cashSession.updateMany({ where: { registerId: register.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
  const session = await openSession(tenant.id, register.id, { VES: 0, USD: 10_000 }, actor);
  const accounts = await tdb.financialAccount.findMany({ where: { isActive: true }, select: { id: true, type: true } });
  const cashUsd = accounts.find((a) => a.type === "CASH_USD")!;
  const pm = accounts.find((a) => a.type === "PAGO_MOVIL")!;
  const rate = await tdb.exchangeRate.findFirstOrThrow({ where: { source: "BCV" }, orderBy: { effectiveAt: "desc" } });
  const bcv = Number(rate.rate);
  const priceOf = await tdb.productVariant.findFirstOrThrow({ where: { id: variants[1].id }, select: { priceUsdOverride: true, product: { select: { priceUsd: true } } } });
  const price = toCents(priceOf.priceUsdOverride ?? priceOf.product.priceUsd);
  const halfVes = Math.round(Math.floor(price / 2) * bcv);
  const rest = price - Math.floor(price / 2);
  const sale = await createStoreSale(
    tenant.id,
    session.id,
    {
      lines: [{ variantId: variants[1].id, quantity: 1 }],
      discountCents: 0,
      customerId: null,
      payments: [
        { method: "PAGO_MOVIL", accountId: pm.id, cents: halfVes, reference: "1234" },
        { method: "CASH_USD", accountId: cashUsd.id, cents: rest + Math.round((rest * 300) / 10_000) + 100, reference: null },
      ],
      changeCurrency: "USD",
      notes: null,
    },
    actor,
  );
  assert.ok(sale.igtfUsd > 0);
  assert.ok(sale.change >= 99 && sale.change <= 101, `vuelto sin IGTF (${sale.change})`);
  const saleInv = await issueInvoice(tenant.id, sale.id, { name: "Inversiones Moda Llanera", idType: "J", idNumber: "401234560", address: "Acarigua", phone: null, email: null }, actor);
  assert.equal((await tdb.invoice.findFirstOrThrow({ where: { id: saleInv.id } })).controlNumber, null, "imprenta digital: control pendiente");
  await setControlNumber(tenant.id, saleInv.id, "00-00009999");
  await assert.rejects(setControlNumber(tenant.id, inv.id, "00-00009998"), /ya tiene número de control/);
  await assert.rejects(setControlNumber(tenant.id, nc.id, "00-00009999"), /ya tiene número de control|forma libre/);
  console.log(`✓ Venta en tienda #${sale.number}: IGTF $${sale.igtfUsd / 100}, vuelto $${sale.change / 100}, factura con control de la imprenta`);

  // 7) Libro de ventas.
  const rows = await salesBook(tenant.id, currentMonth());
  const t = salesBookTotals(rows);
  assert.ok(rows.some((r) => r.type === "CREDIT_NOTE" && r.totalSalesVes < 0));
  assert.ok(rows.some((r) => r.voided && r.totalSalesVes === 0));
  console.log(`✓ Libro: ${t.documents} documentos · ventas Bs ${t.totalSalesVes / 100} · IVA Bs ${t.ivaVes / 100} · IGTF Bs ${t.igtfVes / 100}`);

  // 8) Pago registrado por el personal en Bs: sin IGTF.
  const o2 = await createWebOrder(tenant.id, {
    idempotencyKey: `prueba2-${Date.now()}`,
    lines: [{ variantId: variants[0].id, quantity: 1 }],
    fulfillment: "PICKUP",
    customer: { name: "Andreína Pérez", idType: "V", idNumber: "21345678", phone: "+584241234567", email: null },
    shipping: { state: null, city: null, address: null, reference: null, carrier: null, office: null },
    notes: null,
  });
  const o2row = await tdb.order.findFirstOrThrow({ where: { trackingToken: o2.trackingToken } });
  const r2 = await registerPayment(
    tenant.id,
    o2row.id,
    { method: "PAGO_MOVIL", currency: "VES", amountCents: Math.round(toCents(o2row.totalUsd) * bcv), financialAccountId: pm.id, reference: "999", payerName: null, payerIdNumber: null, payerPhone: null, payerBank: null },
    actor,
  );
  assert.equal(r2.full, true);
  assert.equal(toCents((await tdb.order.findFirstOrThrow({ where: { id: o2row.id } })).igtfUsd), 0);
  console.log("✓ Pago en Bs sin IGTF");
  console.log("\nTodo bien.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
