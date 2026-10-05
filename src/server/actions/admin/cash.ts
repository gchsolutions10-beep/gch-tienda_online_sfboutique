"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { OrderError } from "@/server/services/orders";
import { addCashMovement, closeSession, createStoreSale, openSession } from "@/server/services/cash";
import { parseAmount, toCents } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/payments";
import { formatVeId, normalizeVePhone, parseVeId } from "@/lib/ve-ids";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function cashier() {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, CASHIER_ROLES, "/admin/caja");
  return { tenant, actor: { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email } };
}

async function run<T extends object>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const r = await fn();
    revalidatePath("/t/[domain]/admin", "layout");
    return r;
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    throw e;
  }
}

/** "1.234,56" → centavos (null si está vacío o es inválido). */
const cents = (s: string) => {
  const n = parseAmount(s ?? "");
  return n === null ? null : Math.round(n * 100);
};

export async function openCashSession(registerId: string, float: { VES: string; USD: string }): Promise<Result> {
  const { tenant, actor } = await cashier();
  const ves = float.VES ? cents(float.VES) : 0;
  const usd = float.USD ? cents(float.USD) : 0;
  if (ves === null || usd === null) return { ok: false, error: "Revisa el fondo inicial" };
  return run(async () => {
    await openSession(tenant.id, String(registerId), { VES: ves, USD: usd }, actor);
    return { ok: true };
  });
}

/** Buscador de la venta en tienda: por nombre, SKU o código de barras. */
export async function searchSaleItems(q: string) {
  const { tenant } = await cashier();
  const term = String(q ?? "").trim().slice(0, 60);
  if (term.length < 2) return [];
  const variants = await tenantDb(tenant.id).productVariant.findMany({
    where: {
      isActive: true,
      product: { isActive: true },
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { barcode: term },
        { product: { name: { contains: term, mode: "insensitive" } } },
      ],
    },
    take: 30,
    orderBy: [{ product: { name: "asc" } }],
    select: {
      id: true,
      sku: true,
      stock: true,
      reserved: true,
      priceUsdOverride: true,
      size: { select: { label: true, sortOrder: true } },
      color: { select: { name: true, hex: true } },
      product: { select: { name: true, priceUsd: true, ivaExempt: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } },
    },
  });
  return variants.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    name: v.product.name,
    size: v.size?.label ?? null,
    color: v.color?.name ?? null,
    hex: v.color?.hex ?? null,
    imageUrl: v.product.images[0]?.url ?? null,
    priceCents: toCents(v.priceUsdOverride ?? v.product.priceUsd),
    available: Math.max(0, v.stock - v.reserved),
    ivaExempt: v.product.ivaExempt,
  }));
}

/** Clientas por nombre, teléfono o cédula (para la venta y el CRM). */
export async function searchCustomers(q: string) {
  const { tenant } = await cashier();
  const term = String(q ?? "").trim().slice(0, 60);
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const customers = await tenantDb(tenant.id).customer.findMany({
    where: {
      OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }, { idNumber: { contains: digits } }] : []),
      ],
    },
    take: 8,
    orderBy: { lastOrderAt: { sort: "desc", nulls: "last" } },
    select: { id: true, firstName: true, lastName: true, idType: true, idNumber: true, phone: true, ordersCount: true },
  });
  return customers.map((c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    idDoc: c.idNumber ? formatVeId(c.idType, c.idNumber) : null,
    phone: c.phone,
    ordersCount: c.ordersCount,
  }));
}

/** Alta rápida de una clienta desde la caja. */
export async function quickCreateCustomer(raw: { name: string; idDoc: string; phone: string }): Promise<Result<{ customer: { id: string; name: string } }>> {
  const { tenant } = await cashier();
  const name = String(raw.name ?? "").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Escribe el nombre" };
  const phone = raw.phone ? normalizeVePhone(raw.phone) : null;
  if (raw.phone && !phone) return { ok: false, error: "Teléfono inválido" };
  const id = raw.idDoc ? parseVeId(raw.idDoc) : null;
  if (raw.idDoc && !id) return { ok: false, error: "Cédula o RIF inválido" };
  const tdb = tenantDb(tenant.id);
  if (phone) {
    const existing = await tdb.customer.findFirst({ where: { phone }, select: { id: true, firstName: true, lastName: true } });
    if (existing) return { ok: true, customer: { id: existing.id, name: [existing.firstName, existing.lastName].filter(Boolean).join(" ") } };
  }
  const [firstName, ...rest] = name.split(/\s+/);
  const c = await tdb.customer.create({
    data: { tenantId: tenant.id, firstName, lastName: rest.join(" ") || null, phone, whatsapp: phone, idType: id?.type ?? null, idNumber: id?.number ?? null, source: "STORE" },
    select: { id: true },
  });
  return { ok: true, customer: { id: c.id, name } };
}

const saleInput = z.object({
  sessionId: z.string().min(5).max(40),
  lines: z.array(z.object({ variantId: z.string().min(5).max(40), quantity: z.number().int().min(1).max(100) })).min(1).max(60),
  discount: z.string().max(20),
  customerId: z.string().max(40).nullable(),
  payments: z
    .array(
      z.object({
        method: z.enum(Object.keys(PAYMENT_METHODS) as [PaymentMethod, ...PaymentMethod[]]),
        accountId: z.string().min(5).max(40),
        amount: z.string().max(30),
        reference: z.string().trim().max(80),
      }),
    )
    .min(1, "Agrega al menos un pago")
    .max(10),
  changeCurrency: z.enum(["VES", "USD"]),
  notes: z.string().trim().max(300),
});

export async function storeSale(raw: unknown): Promise<Result<{ id: string; number: number; change: number; changeCurrency: string }>> {
  const { tenant, actor } = await cashier();
  const parsed = saleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa la venta" };
  const d = parsed.data;
  const discount = d.discount ? cents(d.discount) : 0;
  if (discount === null) return { ok: false, error: "Descuento inválido" };
  const payments = d.payments.map((p) => ({ ...p, cents: cents(p.amount) }));
  if (payments.some((p) => !p.cents || p.cents <= 0)) return { ok: false, error: "Revisa los montos de los pagos" };
  return run(async () => {
    const r = await createStoreSale(
      tenant.id,
      d.sessionId,
      {
        lines: d.lines,
        discountCents: discount,
        customerId: d.customerId,
        payments: payments.map((p) => ({ method: p.method, accountId: p.accountId, cents: p.cents!, reference: p.reference || null })),
        changeCurrency: d.changeCurrency,
        notes: d.notes || null,
      },
      actor,
    );
    return { ok: true, id: r.id, number: r.number, change: r.change, changeCurrency: r.changeCurrency };
  });
}

export async function cashMovementAction(raw: { sessionId: string; type: "PAY_IN" | "PAY_OUT"; accountId: string; amount: string; reason: string }): Promise<Result> {
  const { tenant, actor } = await cashier();
  const amount = cents(raw.amount);
  const reason = String(raw.reason ?? "").trim().slice(0, 160);
  if (!amount || amount <= 0) return { ok: false, error: "Escribe el monto" };
  if (reason.length < 3) return { ok: false, error: "Escribe el motivo" };
  if (raw.type !== "PAY_IN" && raw.type !== "PAY_OUT") return { ok: false, error: "Tipo inválido" };
  return run(async () => {
    await addCashMovement(tenant.id, String(raw.sessionId), { type: raw.type, accountId: String(raw.accountId), cents: amount, reason }, actor);
    return { ok: true };
  });
}

export async function closeCashSession(sessionId: string, counted: Record<string, string>, notes: string): Promise<Result<{ sessionId: string }>> {
  const { tenant, actor } = await cashier();
  const parsed: Record<string, number> = {};
  for (const [k, v] of Object.entries(counted ?? {})) {
    const c = cents(v);
    if (c === null) return { ok: false, error: "Escribe lo contado en cada cuenta (0 si no hay nada)" };
    parsed[k] = c;
  }
  return run(async () => {
    await closeSession(tenant.id, String(sessionId), parsed, String(notes ?? "").trim().slice(0, 500) || null, actor);
    return { ok: true, sessionId };
  });
}
