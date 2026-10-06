import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";

/**
 * Sesión de las CLIENTAS con cuenta (solo las que compran a crédito). Cookie
 * aparte de la del personal: una clienta nunca entra al panel y viceversa.
 */
export const CUSTOMER_COOKIE = "gch_clienta";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createCustomerSession(tenantId: string, customerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.customerSession.create({ data: { tenantId, customerId, tokenHash: hashToken(token), expiresAt } });
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCustomerSession() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) await db.customerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(CUSTOMER_COOKIE);
}

/** Clienta con sesión en ESTE negocio (o null). Memoizado por petición. */
export const getCurrentCustomer = cache(async (tenantId: string) => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const session = await db.customerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      tenantId: true,
      expiresAt: true,
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          idType: true,
          idNumber: true,
          phone: true,
          whatsapp: true,
          email: true,
          creditStatus: true,
          creditLevel: true,
          phoneVerifiedAt: true,
        },
      },
    },
  });
  if (!session || session.tenantId !== tenantId || session.expiresAt < new Date()) return null;
  return session.customer;
});

export type CurrentCustomer = NonNullable<Awaited<ReturnType<typeof getCurrentCustomer>>>;
