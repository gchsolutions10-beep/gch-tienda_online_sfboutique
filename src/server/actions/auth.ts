"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { getTenantFromRequest } from "@/server/tenant";
import { DUMMY_HASH, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { safeNextPath } from "@/lib/hosts";
import { clientIp, hit, resetLimit, tooManyMessage } from "@/server/services/rate-limit";

const loginInput = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "Escribe tu contraseña").max(200),
  next: z.string().optional(),
});

export type LoginState = { error?: string; email?: string };

const INVALID = "Correo o contraseña incorrectos";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? INVALID, email };

  // Antes de verificar la contraseña: límite por IP y por cuenta.
  const ip = await clientIp();
  const account = parsed.data.email;
  for (const check of [await hit("loginIp", ip), await hit("loginAccount", account)]) {
    if (!check.ok) return { error: tooManyMessage(check.retryAfterSec), email };
  }

  const tenant = await getTenantFromRequest();
  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      passwordHash: true,
      isSuperAdmin: true,
      memberships: { where: { tenantId: tenant.id, isActive: true }, select: { role: true } },
    },
  });

  // Siempre se verifica un hash para no revelar si el correo existe.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !valid) return { error: INVALID, email };
  if (!user.isSuperAdmin && user.memberships.length === 0) {
    return { error: "Tu usuario no tiene acceso a este negocio", email };
  }

  await resetLimit("loginAccount", account);
  await createSession(user.id);
  redirect(safeNextPath(parsed.data.next, "/admin"));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
