import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { getCurrentCustomer } from "@/server/auth/customer-session";
import { getCreditSettings } from "@/server/services/credit";
import { contractFor } from "@/server/queries/credit";
import { CreditApplicationForm } from "@/components/store/account-forms";
import { formatVeId, formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Solicitud de crédito", robots: { index: false } };

export default async function CreditApplicationPage({ params }: PageProps<"/t/[domain]/credito/solicitud">) {
  const tenant = await getTenant((await params).domain);
  const me = await getCurrentCustomer(tenant.id);
  if (!me) redirect("/mi-cuenta?next=/credito/solicitud");
  if (me.creditStatus === "APPROVED" || me.creditStatus === "PENDING" || me.creditStatus === "SUSPENDED") redirect("/mi-cuenta");
  const settings = await getCreditSettings(tenant.id);
  if (!settings.enabled) redirect("/credito");
  const buyerName = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const contract = await contractFor(tenant, { buyerName, buyerId: me.idNumber ? formatVeId(me.idType, me.idNumber) : undefined });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Credi-SF</p>
      <h1 className="font-display text-4xl font-semibold">Solicitud de crédito</h1>
      <p className="mb-6 mt-2 text-sm text-store-muted">
        A nombre de <b>{buyerName}</b>
        {me.idNumber ? ` · ${formatVeId(me.idType, me.idNumber)}` : ""}
        {me.phone ? ` · ${formatVePhone(me.phone)}` : ""}. Tus datos y las fotos de las cédulas solo los ve el personal autorizado de la tienda.
      </p>
      <CreditApplicationForm contract={contract} />
    </div>
  );
}
