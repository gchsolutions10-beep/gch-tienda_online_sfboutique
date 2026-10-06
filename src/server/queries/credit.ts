import { tenantDb } from "@/server/db";
import { getCreditSettings } from "@/server/services/credit";
import { contractParagraphs } from "@/lib/credit-contract";
import { centsToDecimalString } from "@/lib/money";
import { formatVeId } from "@/lib/ve-ids";
import type { CurrentTenant } from "@/server/tenant";

/** Contrato con los datos de las partes (o líneas en blanco si aún no se conocen). */
export async function contractFor(tenant: CurrentTenant, parties: { buyerName?: string; buyerId?: string; guarantorName?: string; guarantorId?: string }) {
  const s = await getCreditSettings(tenant.id);
  return contractParagraphs({
    storeName: tenant.name,
    legalName: tenant.legalName && !tenant.legalName.includes("por configurar") ? tenant.legalName : null,
    rif: tenant.rif,
    buyerName: parties.buyerName ?? "______________",
    buyerId: parties.buyerId ?? "______________",
    guarantorName: parties.guarantorName ?? "el fiador indicado en la solicitud",
    guarantorId: parties.guarantorId ?? "______________",
    lateFeeUsd: centsToDecimalString(s.lateFeeCents).replace(".", ","),
    graceDays: s.graceDays,
  });
}

/** Solicitud en curso o la última de la clienta. */
export async function latestApplication(tenantId: string, customerId: string) {
  return tenantDb(tenantId).creditApplication.findFirst({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, guarantorToken: true, guarantorName: true, guarantorPhone: true, guarantorIdType: true, guarantorIdNumber: true, reviewNote: true, createdAt: true },
  });
}

/** Créditos de la clienta con su calendario (para Mi cuenta). */
export async function customerPlans(tenantId: string, customerId: string) {
  return tenantDb(tenantId).creditPlan.findMany({
    where: { customerId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      level: true,
      downPaymentUsd: true,
      financedUsd: true,
      order: { select: { number: true, trackingToken: true, status: true, totalUsd: true, paidUsd: true } },
      installments: { orderBy: { number: "asc" }, select: { number: true, dueDate: true, amountUsd: true, lateFeeUsd: true, paidUsd: true, paidAt: true } },
    },
  });
}

export const guarantorLabel = (a: { guarantorIdType: string; guarantorIdNumber: string }) => formatVeId(a.guarantorIdType, a.guarantorIdNumber);
