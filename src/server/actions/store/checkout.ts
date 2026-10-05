"use server";

import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { clientIp, hit, tooManyMessage } from "@/server/services/rate-limit";
import { createWebOrder, OrderError, quoteLines, reportPayment, saveProof, type CheckoutLine } from "@/server/services/orders";
import { normalizeVePhone, parseVeId } from "@/lib/ve-ids";
import { parseAmount } from "@/lib/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";
import { sniffProofMime, PROOF_MAX_BYTES } from "@/lib/files";

const fulfillment = z.enum(["PICKUP", "LOCAL_DELIVERY", "NATIONAL_SHIPPING"]);
const lines = z
  .array(z.object({ variantId: z.string().min(5).max(40), quantity: z.number().int().min(1).max(20) }))
  .min(1)
  .max(40);

/** Junta las líneas repetidas de la misma variante. */
function merge(raw: CheckoutLine[]): CheckoutLine[] {
  const map = new Map<string, number>();
  for (const l of raw) map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.quantity);
  return [...map].map(([variantId, quantity]) => ({ variantId, quantity: Math.min(quantity, 20) }));
}

/** Precios, stock y totales reales para la pantalla de checkout. */
export async function quoteCheckout(raw: unknown) {
  const parsed = z.object({ lines, fulfillment }).safeParse(raw);
  if (!parsed.success) return null;
  const tenant = await getTenantFromRequest();
  const q = await quoteLines(tenant.id, merge(parsed.data.lines), parsed.data.fulfillment);
  return {
    bcv: q.bcv,
    lines: q.priced.map((p) => ({
      variantId: p.line.variantId,
      available: p.available,
      unitPriceCents: p.unitPriceCents,
      exists: Boolean(p.variant),
    })),
    shipping: q.shipping,
    totals: q.totals && {
      subtotalCents: q.totals.subtotalCents,
      ivaCents: q.totals.ivaCents,
      shippingCents: q.totals.shippingCents,
      totalCents: q.totals.totalCents,
      totalVesCents: q.totals.totalVesCents,
    },
    taxMode: q.settings.tax.taxMode,
    ivaEnabled: q.settings.tax.ivaEnabled,
  };
}

const orderInput = z.object({
  idempotencyKey: z.string().min(10).max(60),
  lines,
  fulfillment,
  name: z.string().trim().min(3, "Escribe tu nombre y apellido").max(80),
  idDoc: z.string().trim().max(20),
  phone: z.string().trim().max(25),
  email: z.union([z.literal(""), z.string().trim().email("Revisa el correo").max(120)]),
  state: z.string().trim().max(40),
  city: z.string().trim().max(60),
  address: z.string().trim().max(240),
  reference: z.string().trim().max(160),
  carrier: z.string().trim().max(40),
  office: z.string().trim().max(160),
  notes: z.string().trim().max(400),
  acceptTerms: z.literal(true, { message: "Debes aceptar las condiciones" }),
});

type PlaceResult = { ok: true; token: string; number: number } | { ok: false; error: string; field?: string };

export async function placeOrder(raw: unknown): Promise<PlaceResult> {
  const parsed = orderInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Revisa los datos", field: String(issue?.path[0] ?? "") };
  }
  const d = parsed.data;
  const phone = normalizeVePhone(d.phone);
  if (!phone) return { ok: false, error: "Escribe un teléfono venezolano válido, por ejemplo 0414-1234567", field: "phone" };
  const id = parseVeId(d.idDoc);
  if (!id) return { ok: false, error: "Escribe tu cédula o RIF, por ejemplo V-12345678", field: "idDoc" };
  if (d.fulfillment !== "PICKUP" && (!d.city || !d.address)) {
    return { ok: false, error: d.fulfillment === "NATIONAL_SHIPPING" ? "Indica la ciudad y la oficina o dirección de envío" : "Indica tu dirección", field: "address" };
  }
  if (d.fulfillment === "NATIONAL_SHIPPING" && (!d.state || !d.carrier)) {
    return { ok: false, error: "Elige el estado y la empresa de envío", field: "state" };
  }

  const tenant = await getTenantFromRequest();
  const limit = await hit("checkout", `${tenant.id}:${await clientIp()}`);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfterSec) };

  try {
    const order = await createWebOrder(tenant.id, {
      idempotencyKey: d.idempotencyKey,
      lines: merge(d.lines),
      fulfillment: d.fulfillment,
      customer: { name: d.name, idType: id.type, idNumber: id.number, phone, email: d.email || null },
      shipping: {
        state: d.state || null,
        city: d.city || null,
        address: d.address || null,
        reference: d.reference || null,
        carrier: d.carrier || null,
        office: d.office || null,
      },
      notes: d.notes || null,
    });
    return { ok: true, token: order.trackingToken, number: order.number };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    throw e;
  }
}

const ONLINE_METHODS = Object.entries(PAYMENT_METHODS)
  .filter(([, m]) => m.online)
  .map(([k]) => k) as [PaymentMethod, ...PaymentMethod[]];

const paymentInput = z.object({
  token: z.string().min(10).max(40),
  method: z.enum(ONLINE_METHODS),
  accountId: z.string().max(40),
  amount: z.string().max(30),
  reference: z.string().trim().min(4, "Escribe el número de referencia").max(80),
  payerName: z.string().trim().max(80).default(""),
  payerIdNumber: z.string().trim().max(20).default(""),
  payerPhone: z.string().trim().max(25).default(""),
  payerBank: z.string().trim().max(60).default(""),
});

/** La clienta reporta su pago desde el seguimiento del pedido (con la captura opcional). */
export async function submitPayment(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = paymentInput.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del pago" };
  const d = parsed.data;
  const amount = parseAmount(d.amount);
  if (!amount || amount <= 0) return { ok: false, error: "Escribe el monto que pagaste" };

  const tenant = await getTenantFromRequest();
  const limit = await hit("customerAction", `${tenant.id}:${await clientIp()}`);
  if (!limit.ok) return { ok: false, error: tooManyMessage(limit.retryAfterSec) };

  const method = PAYMENT_METHODS[d.method];
  const account = d.accountId
    ? await tenantDb(tenant.id).financialAccount.findFirst({ where: { id: d.accountId, isActive: true, showInCheckout: true }, select: { id: true, type: true } })
    : null;
  if (d.accountId && (!account || !method.accountTypes.includes(account.type))) return { ok: false, error: "Elige la cuenta a la que pagaste" };

  // Comprobante opcional: imagen o PDF, verificado por sus primeros bytes.
  const file = formData.get("proof");
  let proof: { data: Uint8Array<ArrayBuffer>; mime: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > PROOF_MAX_BYTES) return { ok: false, error: "El comprobante pesa más de 1.5 MB" };
    const data = new Uint8Array(await file.arrayBuffer());
    const mime = sniffProofMime(data);
    if (!mime) return { ok: false, error: "El comprobante debe ser una imagen (JPG, PNG) o un PDF" };
    proof = { data, mime };
  }

  try {
    const payment = await reportPayment(tenant.id, d.token, {
      method: d.method,
      currency: method.currency,
      amountCents: Math.round(amount * 100),
      financialAccountId: account?.id ?? null,
      reference: d.reference,
      payerName: d.payerName || null,
      payerIdNumber: d.payerIdNumber || null,
      payerPhone: d.payerPhone || null,
      payerBank: d.payerBank || null,
    });
    if (proof) await saveProof(tenant.id, payment.id, proof.data, proof.mime);
    return { ok: true };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    throw e;
  }
}
