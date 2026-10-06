import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { getCreditSettings } from "@/server/services/credit";
import { CreditSettingsForm } from "@/components/admin/credit-forms";
import { centsToDecimalString } from "@/lib/money";

export const metadata = { title: "Configuración de Credi-SF" };

const amount = (cents: number) => centsToDecimalString(cents).replace(".", ",");

export default async function CreditSettingsPage({ params }: PageProps<"/t/[domain]/admin/credito/configuracion">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/credito/configuracion");
  if (!isTenantAdmin(ctx)) redirect("/sin-acceso");
  const s = await getCreditSettings(tenant.id);
  return (
    <>
      <Link href="/admin/credito" className="text-sm font-semibold text-muted hover:text-ink">← Credi-SF</Link>
      <h1 className="mb-6 mt-2 font-display text-2xl font-extrabold">Configuración de Credi-SF</h1>
      <CreditSettingsForm
        values={{
          enabled: s.enabled,
          lateFee: amount(s.lateFeeCents),
          graceDays: s.graceDays,
          max1: amount(s.maxByLevel[1]),
          max2: amount(s.maxByLevel[2]),
          max3: amount(s.maxByLevel[3]),
          upgradeAfter: s.upgradeAfter,
          vipAfter: s.vipAfter,
          oneOpen: s.oneOpenAtATime,
        }}
      />
    </>
  );
}
