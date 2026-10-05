import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { sessionSummary } from "@/server/services/cash";
import { PageHeader } from "@/components/admin/page-header";
import { CloseSessionForm } from "@/components/admin/cash-forms";
import { formatUsd, formatVes } from "@/lib/money";

export const metadata = { title: "Cerrar turno" };

export default async function CloseCashPage({ params, searchParams }: PageProps<"/t/[domain]/admin/caja/cierre">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CASHIER_ROLES, "/admin/caja");
  const id = (await searchParams).turno;
  if (typeof id !== "string") notFound();
  const summary = await sessionSummary(tenant.id, id);
  if (!summary) notFound();
  if (summary.session.status !== "OPEN") redirect(`/admin/caja/turnos/${id}`);

  return (
    <>
      <Link href="/admin/caja" className="text-sm font-semibold text-muted hover:text-ink">
        ← Volver a la caja
      </Link>
      <PageHeader
        title="Cerrar turno"
        description={`${summary.session.orders.length} ventas por ${formatUsd(summary.salesUsd)} (${formatVes(summary.salesVes)}). Cuenta el efectivo de cada caja y revisa lo recibido en cada banco o billetera.`}
      />
      <CloseSessionForm sessionId={id} lines={summary.expected} />
    </>
  );
}
