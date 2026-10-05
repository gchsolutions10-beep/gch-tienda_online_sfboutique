"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { normalizeVePhone, parseVeId } from "@/lib/ve-ids";
import { isHexColor } from "@/lib/files";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Quien atiende y vende también lleva el CRM. */
async function crmStaff() {
  const tenant = await getTenantFromRequest();
  const ctx = await requireStaff(tenant, CASHIER_ROLES, "/admin/clientes");
  return { tenant, ctx, tdb: tenantDb(tenant.id) };
}

const done = () => revalidatePath("/t/[domain]/admin/clientes", "layout");

const customerInput = z.object({
  id: z.string().max(40).nullable(),
  firstName: z.string().trim().min(2, "Escribe el nombre").max(60),
  lastName: z.string().trim().max(60),
  idDoc: z.string().trim().max(20),
  phone: z.string().trim().max(25),
  email: z.union([z.literal(""), z.string().trim().email("Correo inválido").max(120)]),
  instagram: z.string().trim().max(40),
  birthday: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  source: z.enum(["STORE", "WEB", "INSTAGRAM", "WHATSAPP", "REFERRAL", "OTHER"]),
  notes: z.string().trim().max(2000),
  marketingOptIn: z.boolean(),
  isWholesale: z.boolean(),
});

export async function saveCustomer(raw: unknown): Promise<Result<{ id: string }>> {
  const { tenant, tdb } = await crmStaff();
  const parsed = customerInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  const phone = d.phone ? normalizeVePhone(d.phone) : null;
  if (d.phone && !phone) return { ok: false, error: "Teléfono inválido (ej. 0414-1234567)" };
  const id = d.idDoc ? parseVeId(d.idDoc) : null;
  if (d.idDoc && !id) return { ok: false, error: "Cédula o RIF inválido (ej. V-12345678 o J-12345678-9)" };
  const data = {
    firstName: d.firstName,
    lastName: d.lastName || null,
    idType: id?.type ?? null,
    idNumber: id?.number ?? null,
    phone,
    whatsapp: phone,
    email: d.email || null,
    instagram: d.instagram.replace(/^@/, "") || null,
    birthday: d.birthday ? new Date(`${d.birthday}T00:00:00Z`) : null,
    source: d.source,
    notes: d.notes || null,
    marketingOptIn: d.marketingOptIn,
    isWholesale: d.isWholesale,
  };
  try {
    let customerId = d.id;
    if (customerId) {
      const r = await tdb.customer.updateMany({ where: { id: customerId }, data });
      if (!r.count) return { ok: false, error: "La clienta ya no existe" };
    } else {
      customerId = (await tdb.customer.create({ data: { ...data, tenantId: tenant.id }, select: { id: true } })).id;
    }
    done();
    return { ok: true, id: customerId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Ya hay una clienta con ese teléfono" };
    throw e;
  }
}

const interactionInput = z.object({
  customerId: z.string().min(5).max(40),
  type: z.enum(["NOTE", "CALL", "WHATSAPP", "INSTAGRAM", "VISIT", "EMAIL"]),
  body: z.string().trim().min(2, "Escribe qué pasó").max(1000),
});

/** Seguimiento: nota, llamada, mensaje de WhatsApp o Instagram, visita… */
export async function addInteraction(raw: unknown): Promise<Result> {
  const { tdb, ctx } = await crmStaff();
  const parsed = interactionInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;
  const customer = await tdb.customer.findFirst({ where: { id: d.customerId }, select: { id: true } });
  if (!customer) return { ok: false, error: "Clienta no encontrada" };
  const now = new Date();
  await tdb.$transaction([
    tdb.customerInteraction.create({ data: { customerId: customer.id, type: d.type, body: d.body, userId: ctx.user.id, createdAt: now } }),
    tdb.customer.update({ where: { id: customer.id }, data: { lastInteractionAt: now } }),
  ]);
  done();
  return { ok: true };
}

export async function toggleCustomerTag(customerId: string, tagId: string, on: boolean): Promise<Result> {
  const { tdb } = await crmStaff();
  const [customer, tag] = await Promise.all([
    tdb.customer.findFirst({ where: { id: customerId }, select: { id: true } }),
    tdb.customerTag.findFirst({ where: { id: tagId, autoRule: null }, select: { id: true } }),
  ]);
  if (!customer || !tag) return { ok: false, error: "No encontrado" };
  if (on) {
    await tdb.customerTagOnCustomer.upsert({
      where: { customerId_tagId: { customerId, tagId } },
      update: {},
      create: { customerId, tagId },
    });
  } else {
    await tdb.customerTagOnCustomer.deleteMany({ where: { customerId, tagId } });
  }
  done();
  return { ok: true };
}

export async function createTag(name: string, color: string): Promise<Result> {
  const { tdb, tenant } = await crmStaff();
  const clean = String(name ?? "").trim().slice(0, 30);
  if (clean.length < 2) return { ok: false, error: "Escribe el nombre de la etiqueta" };
  if (!isHexColor(color)) return { ok: false, error: "Color inválido" };
  if (await tdb.customerTag.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true } })) return { ok: false, error: "Esa etiqueta ya existe" };
  await tdb.customerTag.create({ data: { tenantId: tenant.id, name: clean, color: color.toUpperCase() } });
  done();
  return { ok: true };
}
