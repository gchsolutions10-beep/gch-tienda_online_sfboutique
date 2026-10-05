import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está configurada");
  // El Postgres embebido de `prisma dev` falla con conexiones simultáneas:
  // en local se usa DATABASE_POOL_MAX=1. En Neon se deja el valor por defecto.
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

// Reutiliza el cliente entre recargas de HMR en desarrollo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Cliente SIN filtro de tenant. Úsalo solo para: resolver el tenant desde el
 * host, autenticación, tareas de plataforma (SUPER_ADMIN) y el seed.
 * Para todo lo demás usa `tenantDb(tenantId)`.
 */
export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Modelos que tienen columna `tenantId` (ver prisma/schema.prisma). */
const TENANT_SCOPED_MODELS = new Set<string>([
  "TenantDomain",
  "TenantSettings",
  "Branch",
  "Membership",
  "TenantAsset",
  "AuditLog",
  "ExchangeRate",
  "Category",
  "Size",
  "Color",
  "Brand",
  "Product",
  "ProductVariant",
  "StockMovement",
  "Customer",
  "CustomerTag",
  "FinancialAccount",
  "Order",
  "Payment",
  "InvoiceSeries",
  "Invoice",
  "CashRegister",
  "CashSession",
  "PromoBanner",
  "HeroCard",
  "BlogCategory",
  "BlogPost",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type Args = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

/**
 * Cliente con aislamiento por tenant: añade `tenantId` a cada filtro y a cada
 * creación de los modelos con esa columna.
 *
 * Reglas al usarlo:
 *  - En `create`, usar llaves foráneas escalares (`categoryId`), no `connect`,
 *    porque se inyecta `tenantId` como escalar.
 *  - Los modelos hijos sin `tenantId` (ProductVariant, Modifier, OrderItem…)
 *    no se filtran: accede a ellos a través de su padre o verifica primero que
 *    el padre pertenezca al tenant.
 */
export function tenantDb(tenantId: string) {
  return db.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Args;

          if (WHERE_OPERATIONS.has(operation)) {
            a.where = { ...a.where, tenantId };
          } else if (operation === "create") {
            a.data = { ...(a.data as Record<string, unknown>), tenantId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data ?? {}];
            a.data = rows.map((row) => ({ ...row, tenantId }));
          } else if (operation === "upsert") {
            a.where = { ...a.where, tenantId };
            a.create = { ...a.create, tenantId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
