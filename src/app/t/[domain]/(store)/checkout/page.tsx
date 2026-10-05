import type { Metadata } from "next";
import { getTenant } from "@/server/tenant";
import { getDeliverySettings, releaseExpiredReservations } from "@/server/services/orders";
import { CheckoutForm } from "@/components/store/checkout-form";
import { CARRIERS, VE_STATES } from "@/lib/orders";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false } };

export default async function CheckoutPage({ params }: PageProps<"/t/[domain]/checkout">) {
  const tenant = await getTenant((await params).domain);
  await releaseExpiredReservations(tenant.id);
  const s = await getDeliverySettings(tenant.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-4xl font-semibold">Finalizar compra</h1>
      <p className="mt-1 text-sm text-store-muted">
        Apartamos tus prendas por {s.reservationHours} horas mientras realizas el pago.
      </p>
      <CheckoutForm
        storeName={tenant.name}
        options={{
          pickup: s.pickupEnabled ? { info: s.pickupInfo } : null,
          local: s.localDeliveryEnabled ? { area: s.localDeliveryArea, cents: s.localDeliveryCents ?? 0 } : null,
          national: s.nationalShippingEnabled ? { payAtDestination: s.nationalShippingCents === null, cents: s.nationalShippingCents ?? 0 } : null,
        }}
        states={[...VE_STATES]}
        carriers={[...CARRIERS]}
      />
    </div>
  );
}
