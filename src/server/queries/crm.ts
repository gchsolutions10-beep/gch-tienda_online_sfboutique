import type { Prisma } from "@/generated/prisma/client";
import { tenantDb } from "@/server/db";
import { toCents } from "@/lib/money";
import { autoSegments, type AutoSegment, type SegmentRules } from "@/lib/crm";

export async function getCrmRules(tenantId: string): Promise<SegmentRules> {
  const s = await tenantDb(tenantId).tenantSettings.findFirst({ select: { vipMinSpentUsd: true, recurrentMinOrders: true, inactiveAfterDays: true } });
  return {
    vipMinSpentUsdCents: toCents(s?.vipMinSpentUsd ?? 500),
    recurrentMinOrders: s?.recurrentMinOrders ?? 3,
    inactiveAfterDays: s?.inactiveAfterDays ?? 90,
  };
}

export type CustomerFilter = { q: string; segment: string; sort: "recientes" | "gasto" | "compras" | "nombre" };

/** Lista del CRM con sus segmentos automáticos (calculados al vuelo) y etiquetas manuales. */
export async function listCustomers(tenantId: string, f: CustomerFilter) {
  const tdb = tenantDb(tenantId);
  const rules = await getCrmRules(tenantId);
  const digits = f.q.replace(/\D/g, "");
  const where: Prisma.CustomerWhereInput = f.q
    ? {
        OR: [
          { firstName: { contains: f.q, mode: "insensitive" } },
          { lastName: { contains: f.q, mode: "insensitive" } },
          { email: { contains: f.q, mode: "insensitive" } },
          { instagram: { contains: f.q.replace(/^@/, ""), mode: "insensitive" } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }, { idNumber: { contains: digits } }] : []),
        ],
      }
    : {};
  const [rows, tags] = await Promise.all([
    tdb.customer.findMany({
      where,
      take: 2000,
      orderBy:
        f.sort === "gasto"
          ? { totalSpentUsd: "desc" }
          : f.sort === "compras"
            ? { ordersCount: "desc" }
            : f.sort === "nombre"
              ? { firstName: "asc" }
              : [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        idType: true,
        idNumber: true,
        phone: true,
        email: true,
        instagram: true,
        birthday: true,
        source: true,
        isWholesale: true,
        marketingOptIn: true,
        ordersCount: true,
        totalSpentUsd: true,
        totalSpentVes: true,
        firstOrderAt: true,
        lastOrderAt: true,
        favoritePaymentMethod: true,
        createdAt: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    tdb.customerTag.findMany({ where: { autoRule: null }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true, _count: { select: { customers: true } } } }),
  ]);

  const month = new Date().toLocaleString("en-CA", { month: "2-digit", timeZone: "America/Caracas" });
  const customers = rows.map((c) => {
    const segments = autoSegments(
      { ordersCount: c.ordersCount, totalSpentUsdCents: toCents(c.totalSpentUsd), firstOrderAt: c.firstOrderAt, lastOrderAt: c.lastOrderAt },
      rules,
    );
    const birthdayMonth = c.birthday ? String(c.birthday.getUTCMonth() + 1).padStart(2, "0") === month : false;
    return { ...c, segments, birthdayMonth };
  });

  const counts: Record<string, number> = { todos: customers.length, cumple: customers.filter((c) => c.birthdayMonth).length, mayorista: customers.filter((c) => c.isWholesale).length };
  for (const s of ["VIP", "RECURRENT", "NEW", "INACTIVE"] as AutoSegment[]) counts[s] = customers.filter((c) => c.segments.includes(s)).length;

  const filtered = customers.filter((c) => {
    if (!f.segment || f.segment === "todos") return true;
    if (f.segment === "cumple") return c.birthdayMonth;
    if (f.segment === "mayorista") return c.isWholesale;
    if (f.segment === "sin-compras") return c.ordersCount === 0;
    if (f.segment.startsWith("tag:")) return c.tags.some((t) => t.tag.id === f.segment.slice(4));
    return c.segments.includes(f.segment as AutoSegment);
  });
  counts["sin-compras"] = customers.filter((c) => c.ordersCount === 0).length;
  return { customers: filtered, counts, tags };
}

export async function getCustomer(tenantId: string, id: string) {
  const tdb = tenantDb(tenantId);
  const customer = await tdb.customer.findFirst({
    where: { id },
    include: {
      tags: { select: { tagId: true } },
      addresses: true,
      interactions: { orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true, email: true } } } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          number: true,
          createdAt: true,
          channel: true,
          status: true,
          totalUsd: true,
          totalVes: true,
          items: { select: { productName: true, sizeLabel: true, colorName: true, quantity: true } },
        },
      },
    },
  });
  if (!customer) return null;
  const tags = await tdb.customerTag.findMany({ where: { autoRule: null }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
  return { customer, tags, rules: await getCrmRules(tenantId) };
}
