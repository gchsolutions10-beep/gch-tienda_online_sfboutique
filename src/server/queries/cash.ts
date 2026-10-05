import { tenantDb } from "@/server/db";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments";

/** Caja elegida (por ?caja=) o la primera activa. */
export async function getRegister(tenantId: string, registerId?: string) {
  const registers = await tenantDb(tenantId).cashRegister.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return { registers, register: registers.find((r) => r.id === registerId) ?? registers[0] ?? null };
}

/** Cuentas activas y los métodos de pago que tienen al menos una cuenta. */
export async function getPaymentSetup(tenantId: string) {
  const accounts = await tenantDb(tenantId).financialAccount.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, type: true, currency: true },
  });
  const methods = (Object.keys(PAYMENT_METHODS) as PaymentMethod[])
    .map((m) => ({ method: m, label: PAYMENT_METHODS[m].label, icon: PAYMENT_METHODS[m].icon, currency: PAYMENT_METHODS[m].currency, accountTypes: PAYMENT_METHODS[m].accountTypes }))
    .filter((m) => accounts.some((a) => m.accountTypes.includes(a.type)));
  return { accounts, methods };
}
