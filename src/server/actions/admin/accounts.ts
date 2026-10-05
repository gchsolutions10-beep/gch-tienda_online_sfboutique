"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { normalizeVePhone, parseVeId } from "@/lib/ve-ids";

type Result = { ok: true } | { ok: false; error: string };

const TYPES = ["BANK_VES", "PAGO_MOVIL", "POS_TERMINAL", "CASH_VES", "CASH_USD", "ZELLE", "BANK_USD", "CRYPTO_USDT"] as const;
/** La moneda la define el tipo de cuenta. */
const CURRENCY: Record<(typeof TYPES)[number], "VES" | "USD" | "USDT"> = {
  BANK_VES: "VES",
  PAGO_MOVIL: "VES",
  POS_TERMINAL: "VES",
  CASH_VES: "VES",
  CASH_USD: "USD",
  ZELLE: "USD",
  BANK_USD: "USD",
  CRYPTO_USDT: "USDT",
};

const input = z.object({
  id: z.string().max(40).nullable(),
  name: z.string().trim().min(2, "Escribe un nombre para la cuenta").max(60),
  type: z.enum(TYPES),
  bankCode: z.string().trim().max(4),
  bankName: z.string().trim().max(60),
  accountNumber: z.string().trim().max(30),
  holderName: z.string().trim().max(80),
  holderId: z.string().trim().max(20),
  phone: z.string().trim().max(20),
  email: z.union([z.literal(""), z.string().trim().email("Correo inválido").max(120)]),
  walletId: z.string().trim().max(120),
  showInCheckout: z.boolean(),
  isActive: z.boolean(),
});

/** Crea o edita una cuenta donde entra el dinero. Solo la dueña. */
export async function saveAccount(raw: unknown): Promise<Result> {
  const tenant = await getTenantFromRequest();
  const ctx = await requireAdmin(tenant, "/admin/cuentas");
  if (!isTenantAdmin(ctx)) return { ok: false, error: "Solo la administradora cambia las cuentas" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos" };
  const d = parsed.data;

  const phone = d.phone ? normalizeVePhone(d.phone) : null;
  if (d.phone && !phone) return { ok: false, error: "Teléfono inválido (ej. 0414-1234567)" };
  const holder = d.holderId ? parseVeId(d.holderId) : null;
  if (d.holderId && !holder) return { ok: false, error: "Cédula o RIF del titular inválido" };
  if (d.type === "PAGO_MOVIL" && (!d.bankCode || !phone || !holder)) return { ok: false, error: "Pago Móvil necesita banco, teléfono y cédula/RIF" };
  if ((d.type === "BANK_VES" || d.type === "BANK_USD") && !d.accountNumber) return { ok: false, error: "Escribe el número de cuenta" };
  if (d.type === "ZELLE" && !d.email) return { ok: false, error: "Escribe el correo de Zelle" };
  if (d.type === "CRYPTO_USDT" && !d.walletId) return { ok: false, error: "Escribe el Binance Pay ID o la dirección" };
  if (d.bankCode && !/^\d{4}$/.test(d.bankCode)) return { ok: false, error: "El código del banco son 4 dígitos (ej. 0134)" };

  const data = {
    name: d.name,
    type: d.type,
    currency: CURRENCY[d.type],
    bankCode: d.bankCode || null,
    bankName: d.bankName || null,
    accountNumber: d.accountNumber || null,
    holderName: d.holderName || null,
    holderIdType: holder?.type ?? null,
    holderIdNumber: holder?.number ?? null,
    phone,
    email: d.email || null,
    walletId: d.walletId || null,
    // Efectivo y punto de venta no se muestran en la tienda en línea.
    showInCheckout: d.showInCheckout && !["CASH_VES", "CASH_USD", "POS_TERMINAL"].includes(d.type),
    isActive: d.isActive,
  };
  const tdb = tenantDb(tenant.id);
  if (d.id) {
    const res = await tdb.financialAccount.updateMany({ where: { id: d.id }, data });
    if (!res.count) return { ok: false, error: "La cuenta ya no existe" };
  } else {
    const max = await tdb.financialAccount.aggregate({ _max: { sortOrder: true } });
    await tdb.financialAccount.create({ data: { ...data, tenantId: tenant.id, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/t/[domain]", "layout");
  return { ok: true };
}
