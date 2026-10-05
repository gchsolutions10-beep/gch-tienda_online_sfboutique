import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CASHIER_ROLES, requireStaff } from "@/server/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { CustomerForm } from "@/components/admin/customer-forms";

export const metadata = { title: "Nueva clienta" };

export default async function NewCustomerPage({ params }: PageProps<"/t/[domain]/admin/clientes/nuevo">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CASHIER_ROLES, "/admin/clientes/nuevo");
  return (
    <>
      <Link href="/admin/clientes" className="text-sm font-semibold text-muted hover:text-ink">
        ← Clientes
      </Link>
      <PageHeader title="Nueva clienta" />
      <div className="max-w-3xl">
        <CustomerForm
          initial={{ id: null, firstName: "", lastName: "", idDoc: "", phone: "", email: "", instagram: "", birthday: "", source: "INSTAGRAM", notes: "", marketingOptIn: true, isWholesale: false }}
        />
      </div>
    </>
  );
}
