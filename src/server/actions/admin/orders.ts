"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { advanceOrder, cancelOrder, OrderError, registerPayment, reviewPayment, type Actor } from "@/server/services/orders";
import { parseAmount } from "@/lib/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function staff() {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, CASHIER_ROLES, "/admin/pedidos");
  const actor: Actor = { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email };
  return { tenant, actor };
}

async function run(fn: () => Promise<Result>): Promise<Result> {
  try {
    const r = await fn();
    revalidatePath("/t/[domain]/admin/pedidos", "layout");
    return r;
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    throw e;
  }
}

const id = z.string().min(5).max(40);

export async function reviewPaymentAction(paymentId: string, approve: boolean, note: string): Promise<Result> {
  const { tenant, actor } = await staff();
  if (!id.safeParse(paymentId).success) return { ok: false, error: "Pago inválido" };
  return run(async () => {
    const r = await reviewPayment(tenant.id, paymentId, approve, note.trim().slice(0, 200) || null, actor);
    return { ok: true, message: r.full ? "Pedido pagado completo. Se descontó el stock." : approve ? "Pago confirmado. Aún falta una parte." : "Pago rechazado." };
  });
}

const paymentInput = z.object({
  method: z.enum(Object.keys(PAYMENT_METHODS) as [PaymentMethod, ...PaymentMethod[]]),
  accountId: z.string().max(40),
  amount: z.string().max(30),
  reference: z.string().trim().max(80),
  payerName: z.string().trim().max(80),
});

export async function registerPaymentAction(orderId: string, raw: unknown): Promise<Result> {
  const { tenant, actor } = await staff();
  const parsed = paymentInput.safeParse(raw);
  if (!parsed.success || !id.safeParse(orderId).success) return { ok: false, error: "Revisa los datos del pago" };
  const d = parsed.data;
  const amount = parseAmount(d.amount);
  if (!amount) return { ok: false, error: "Escribe el monto" };
  const method = PAYMENT_METHODS[d.method];
  if (method.needsReference && !d.reference) return { ok: false, error: "Escribe la referencia del pago" };
  return run(async () => {
    const r = await registerPayment(
      tenant.id,
      orderId,
      {
        method: d.method,
        currency: method.currency,
        amountCents: Math.round(amount * 100),
        financialAccountId: d.accountId || null,
        reference: d.reference || null,
        payerName: d.payerName || null,
        payerIdNumber: null,
        payerPhone: null,
        payerBank: null,
      },
      actor,
    );
    return { ok: true, message: r.full ? "Pedido pagado completo. Se descontó el stock." : "Pago registrado. Aún falta una parte." };
  });
}

const advanceInput = z.object({
  to: z.enum(["PREPARING", "READY", "SHIPPED", "DELIVERED"]),
  carrier: z.string().trim().max(40),
  trackingNumber: z.string().trim().max(60),
});

export async function advanceOrderAction(orderId: string, raw: unknown): Promise<Result> {
  const { tenant, actor } = await staff();
  const parsed = advanceInput.safeParse(raw);
  if (!parsed.success || !id.safeParse(orderId).success) return { ok: false, error: "Datos inválidos" };
  const d = parsed.data;
  if (d.to === "SHIPPED" && !d.trackingNumber) return { ok: false, error: "Escribe el número de guía del envío" };
  return run(async () => {
    await advanceOrder(tenant.id, orderId, d.to, { carrier: d.carrier || null, trackingNumber: d.trackingNumber || null }, actor);
    return { ok: true };
  });
}

export async function cancelOrderAction(orderId: string, reason: string): Promise<Result> {
  const { tenant, actor } = await staff();
  const why = reason.trim().slice(0, 200);
  if (!id.safeParse(orderId).success) return { ok: false, error: "Pedido inválido" };
  if (why.length < 3) return { ok: false, error: "Escribe el motivo de la anulación" };
  return run(async () => {
    const r = await cancelOrder(tenant.id, orderId, why, actor);
    return {
      ok: true,
      message: r.hadPayments ? "Pedido anulado y mercancía devuelta al stock. Recuerda hacer el reembolso a la clienta." : "Pedido anulado. Se liberó el stock apartado.",
    };
  });
}

export async function saveInternalNote(orderId: string, note: string): Promise<Result> {
  const { tenant } = await staff();
  if (!id.safeParse(orderId).success) return { ok: false, error: "Pedido inválido" };
  await tenantDb(tenant.id).order.updateMany({ where: { id: orderId }, data: { internalNote: note.trim().slice(0, 1000) || null } });
  revalidatePath("/t/[domain]/admin/pedidos", "layout");
  return { ok: true };
}
