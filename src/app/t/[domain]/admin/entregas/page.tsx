import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { DeliveryForm } from "@/components/admin/delivery-form";
import { centsToDecimalString, toCents } from "@/lib/money";

export const metadata = { title: "Envíos y entregas" };

const usd = (v: { toString(): string } | null | undefined) => (v ? centsToDecimalString(toCents(v)).replace(".", ",") : "");

export default async function DeliveryPage({ params }: PageProps<"/t/[domain]/admin/entregas">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/entregas");
  if (!isTenantAdmin(ctx)) redirect("/sin-acceso");
  const s = await tenantDb(tenant.id).tenantSettings.findFirst();

  return (
    <>
      <PageHeader title="Envíos y entregas" description="Cómo reciben sus compras las clientas de la tienda web y cuánto tiempo se apartan las prendas." />
      <DeliveryForm
        values={{
          pickupEnabled: s?.pickupEnabled ?? true,
          pickupInfo: s?.pickupInfo ?? "",
          localDeliveryEnabled: s?.localDeliveryEnabled ?? true,
          localDeliveryUsd: usd(s?.localDeliveryUsd),
          localDeliveryArea: s?.localDeliveryArea ?? "",
          nationalShippingEnabled: s?.nationalShippingEnabled ?? true,
          nationalShippingUsd: usd(s?.nationalShippingUsd),
          freeShippingFromUsd: usd(s?.freeShippingFromUsd),
          reservationHours: s?.reservationHours ?? 24,
        }}
      />
    </>
  );
}
