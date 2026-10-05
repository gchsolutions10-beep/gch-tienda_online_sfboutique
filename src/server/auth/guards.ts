import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { tenantDb } from "@/server/db";
import { getCurrentUser, type CurrentUser } from "@/server/auth/session";
import { ADMIN_ROLES, canManageBranch, resolveAccess, STAFF_ROLES, type Access } from "@/server/auth/access";
import type { CurrentTenant } from "@/server/tenant";

export {
  ADMIN_ROLES,
  CASHIER_ROLES,
  CONTENT_ROLES,
  STAFF_ROLES,
  canEditCatalog,
  canManageBranch,
  isTenantAdmin,
  resolveAccess,
} from "@/server/auth/access";

export type StaffContext = Access<CurrentUser>;

/**
 * Exige un usuario con alguno de los roles en este tenant. Redirige a /login
 * si no hay sesión y a /sin-acceso si no tiene permiso.
 */
export async function requireStaff(tenant: CurrentTenant, allowed: Role[], nextPath = "/admin"): Promise<StaffContext> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const access = resolveAccess(user, tenant.id, allowed);
  if (!access) redirect("/sin-acceso");
  return access;
}

export function requireAdmin(tenant: CurrentTenant, nextPath = "/admin") {
  return requireStaff(tenant, ADMIN_ROLES, nextPath);
}

/**
 * Para las pantallas del personal (/app/[branch]/…): exige un rol de staff
 * con acceso a ESA sucursal y devuelve la sucursal.
 */
export async function requireBranchStaff(tenant: CurrentTenant, branchSlug: string, allowed: Role[] = STAFF_ROLES) {
  const ctx = await requireStaff(tenant, allowed, `/app/${branchSlug}`);
  const branch = await tenantDb(tenant.id).branch.findFirst({
    where: { slug: branchSlug, isActive: true },
    select: { id: true, slug: true, name: true, address: true, phone: true },
  });
  if (!branch || !canManageBranch(ctx, branch.id)) redirect("/sin-acceso");
  return { ctx, branch };
}

/**
 * Versión para Server Actions y Route Handlers: devuelve null en lugar de
 * redirigir, para responder con un error.
 */
export async function getBranchStaff(tenant: CurrentTenant, branchId: string, allowed: Role[] = STAFF_ROLES) {
  const user = await getCurrentUser();
  if (!user) return null;
  const ctx = resolveAccess(user, tenant.id, allowed);
  if (!ctx || !canManageBranch(ctx, branchId)) return null;
  return ctx;
}
