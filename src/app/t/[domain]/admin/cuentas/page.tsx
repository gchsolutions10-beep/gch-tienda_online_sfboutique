import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { AccountCard, NewAccount, type AccountValues } from "@/components/admin/account-form";
import { formatMoney, toCents } from "@/lib/money";
import { formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Cuentas de cobro" };

/** Datos de ejemplo del seed que hay que reemplazar antes de publicar. */
const looksLikePlaceholder = (a: { holderName: string | null; holderIdNumber: string | null; phone: string | null; walletId: string | null; email: string | null; accountNumber: string | null }) =>
  [a.holderName, a.walletId].some((x) => x?.toLowerCase().includes("por configurar")) ||
  a.holderIdNumber === "00000000" ||
  a.phone === "04240000000" ||
  a.phone === "+584240000000" ||
  a.email === "pagos@ejemplo.com" ||
  Boolean(a.accountNumber?.includes("0000-00-0000000000"));

export default async function AccountsPage({ params }: PageProps<"/t/[domain]/admin/cuentas">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/cuentas");
  if (!isTenantAdmin(ctx)) redirect("/sin-acceso");
  const tdb = tenantDb(tenant.id);
  const since = new Date(new Date().getTime() - 30 * 86_400_000);
  const [accounts, received] = await Promise.all([
    tdb.financialAccount.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] }),
    tdb.payment.groupBy({ by: ["financialAccountId"], where: { status: "CONFIRMED", createdAt: { gte: since } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const byAccount = new Map(received.map((r) => [r.financialAccountId, r]));

  return (
    <>
      <PageHeader
        title="Cuentas de cobro"
        description="Donde entra el dinero: bancos, Pago Móvil, punto de venta, cajas de efectivo, Zelle y USDT. Las que marques se muestran a las clientas en la tienda en línea."
        actions={<NewAccount />}
      />
      <ul className="grid gap-3 lg:grid-cols-2">
        {accounts.map((a) => {
          const values: AccountValues = {
            id: a.id,
            name: a.name,
            type: a.type,
            bankCode: a.bankCode ?? "",
            bankName: a.bankName ?? "",
            accountNumber: a.accountNumber ?? "",
            holderName: a.holderName ?? "",
            holderId: a.holderIdNumber ? `${a.holderIdType ?? "V"}-${a.holderIdNumber}` : "",
            phone: a.phone ? formatVePhone(a.phone.startsWith("+") ? a.phone : `+58${a.phone.replace(/^0/, "")}`) : "",
            email: a.email ?? "",
            walletId: a.walletId ?? "",
            showInCheckout: a.showInCheckout,
            isActive: a.isActive,
          };
          const r = byAccount.get(a.id);
          const details = [
            a.bankName && `${a.bankCode ? `${a.bankCode} · ` : ""}${a.bankName}`,
            a.accountNumber,
            values.phone,
            values.holderId,
            a.email,
            a.walletId,
          ].filter(Boolean);
          return (
            <AccountCard
              key={a.id}
              values={values}
              summary={details.join(" · ") || (a.type === "CASH_VES" || a.type === "CASH_USD" ? "Efectivo en la tienda" : "—")}
              warning={looksLikePlaceholder(a) ? "Tiene datos de ejemplo: cámbialos antes de vender" : null}
            >
              <p className="mt-2 text-xs text-muted">
                {a.showInCheckout ? "🌐 Visible en la tienda en línea · " : ""}
                Últimos 30 días: {r ? `${formatMoney(toCents(r._sum.amount ?? 0), a.currency)} en ${r._count._all} pagos` : "sin cobros"}
              </p>
            </AccountCard>
          );
        })}
      </ul>
    </>
  );
}
