import type { Role } from "@/generated/prisma/enums";

/** Lógica pura de permisos (sin BD ni Next) para poder probarla de forma aislada. */

/** Pueden entrar al panel de administración (cada uno ve lo suyo). */
export const ADMIN_ROLES: Role[] = ["TENANT_ADMIN", "BRANCH_ADMIN", "SELLER", "EDITOR"];

/** Todo el personal con acceso al panel. */
export const STAFF_ROLES: Role[] = ["TENANT_ADMIN", "BRANCH_ADMIN", "SELLER", "EDITOR"];

/** Quién puede vender, cobrar y manejar la caja. */
export const CASHIER_ROLES: Role[] = ["TENANT_ADMIN", "BRANCH_ADMIN", "SELLER"];

/** Quién publica en el blog y cambia banners. */
export const CONTENT_ROLES: Role[] = ["TENANT_ADMIN", "EDITOR"];

export type AccessUser = {
  isSuperAdmin: boolean;
  memberships: { tenantId: string; branchId: string | null; role: Role }[];
};

export type Access<U extends AccessUser = AccessUser> = {
  user: U;
  /** null = acceso a todas las sucursales del tenant */
  branchIds: string[] | null;
  roles: Role[];
};

/** Calcula los permisos del usuario dentro de un tenant. */
export function resolveAccess<U extends AccessUser>(user: U, tenantId: string, allowed: Role[]): Access<U> | null {
  if (user.isSuperAdmin) return { user, branchIds: null, roles: ["SUPER_ADMIN"] };

  const memberships = user.memberships.filter((m) => m.tenantId === tenantId && allowed.includes(m.role));
  if (memberships.length === 0) return null;

  const allBranches = memberships.some((m) => m.branchId === null);
  return {
    user,
    branchIds: allBranches ? null : memberships.map((m) => m.branchId as string),
    roles: [...new Set(memberships.map((m) => m.role))],
  };
}

/** Configuración de toda la marca (catálogo, impuestos, cuentas): solo TENANT_ADMIN o super admin. */
export function isTenantAdmin(access: Pick<Access, "roles">) {
  return access.roles.includes("SUPER_ADMIN") || access.roles.includes("TENANT_ADMIN");
}

/** El catálogo es del tenant completo. */
export const canEditCatalog = isTenantAdmin;

/** Un gerente solo administra sus sucursales; el admin de la marca, todas. */
export function canManageBranch(access: Pick<Access, "branchIds">, branchId: string) {
  return access.branchIds === null || access.branchIds.includes(branchId);
}
