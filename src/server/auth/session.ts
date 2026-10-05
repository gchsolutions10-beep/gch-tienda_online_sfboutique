import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { SESSION_COOKIE } from "@/server/auth/cookie-name";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** En la BD guardamos el SHA-256 del token, nunca el token en claro. */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { sessionToken: hashToken(token), userId, expires } });

  // Sin atributo Domain: la cookie queda ligada al host del tenant.
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { sessionToken: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Usuario autenticado con sus memberships activas. Memoizado por petición. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { sessionToken: hashToken(token) },
    select: {
      expires: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isSuperAdmin: true,
          memberships: {
            where: { isActive: true },
            select: { tenantId: true, branchId: true, role: true },
          },
        },
      },
    },
  });
  if (!session || session.expires < new Date()) return null;
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
