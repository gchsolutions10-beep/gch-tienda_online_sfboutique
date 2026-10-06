import { tenantDb } from "@/server/db";
import { acceptingOrders, averageRating, groupCount } from "@/lib/imports";

/** Sección pública: lote abierto, galería con el contador grupal e historial con reseñas. */
export async function storeImports(tenantId: string, now = new Date()) {
  const tdb = tenantDb(tenantId);
  const [open, delivered] = await Promise.all([
    tdb.importBatch.findMany({
      where: { status: "OPEN" },
      orderBy: { closesAt: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        opensAt: true,
        closesAt: true,
        estimatedArrival: true,
        products: {
          where: { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            description: true,
            sourceStore: true,
            imageUrl: true,
            estimatedPriceUsd: true,
            sizes: true,
            colors: true,
            requests: { select: { customerId: true, status: true, quantity: true } },
          },
        },
      },
    }),
    tdb.importBatch.findMany({
      where: { status: "DELIVERED" },
      orderBy: { closesAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        closesAt: true,
        estimatedArrival: true,
        _count: { select: { requests: { where: { status: "ACCEPTED", order: { status: "DELIVERED" } } } } },
        reviews: {
          where: { isApproved: true },
          orderBy: { createdAt: "desc" },
          select: { id: true, rating: true, body: true, createdAt: true, customer: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
  ]);
  const batch = open.find((b) => acceptingOrders(b, now)) ?? null;
  // El próximo lote anunciado (abierto, pero aún no empieza).
  const upcoming = batch ? null : (open.find((b) => b.opensAt.getTime() > now.getTime()) ?? null);
  return {
    batch: batch
      ? {
          ...batch,
          products: batch.products.map(({ requests, ...p }) => ({ ...p, group: groupCount(requests) })),
        }
      : null,
    upcoming: upcoming ? { name: upcoming.name, opensAt: upcoming.opensAt, closesAt: upcoming.closesAt } : null,
    history: delivered.map((b) => ({
      id: b.id,
      name: b.name,
      closesAt: b.closesAt,
      estimatedArrival: b.estimatedArrival,
      delivered: b._count.requests,
      average: averageRating(b.reviews.map((r) => r.rating)),
      reviews: b.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt,
        // Nombre y la inicial del apellido (privacidad).
        name: [r.customer.firstName, r.customer.lastName ? `${r.customer.lastName[0]}.` : null].filter(Boolean).join(" "),
      })),
    })),
  };
}

/** Encargos de la clienta con su pedido (si aceptó) y los lotes que puede reseñar. */
export async function customerImports(tenantId: string, customerId: string) {
  const tdb = tenantDb(tenantId);
  const requests = await tdb.importRequest.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      title: true,
      sourceStore: true,
      size: true,
      color: true,
      quantity: true,
      isPrivate: true,
      unitCostUsd: true,
      freightUsd: true,
      commissionUsd: true,
      totalUsd: true,
      depositUsd: true,
      quoteNote: true,
      rejectReason: true,
      createdAt: true,
      batch: { select: { id: true, name: true, status: true } },
      order: { select: { number: true, trackingToken: true, status: true, paymentStatus: true, paidUsd: true } },
    },
  });
  const reviewed = new Set(
    (await tdb.importReview.findMany({ where: { customerId }, select: { batchId: true } })).map((r) => r.batchId),
  );
  const reviewable = new Map<string, string>();
  for (const r of requests) {
    if (r.batch?.status === "DELIVERED" && r.order?.status === "DELIVERED" && !reviewed.has(r.batch.id)) reviewable.set(r.batch.id, r.batch.name);
  }
  return { requests, reviewable: [...reviewable].map(([id, name]) => ({ id, name })) };
}
