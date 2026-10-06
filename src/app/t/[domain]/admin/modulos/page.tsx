import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { getModules } from "@/server/queries/modules";
import { PageHeader } from "@/components/admin/page-header";
import { ModuleSwitches } from "@/components/admin/module-switches";

export const metadata = { title: "Módulos" };

/** Prender y apagar funciones de la tienda (no todas las boutiques venden a crédito o traen encargos). */
export default async function ModulesPage({ params }: PageProps<"/t/[domain]/admin/modulos">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/modulos");
  if (!isTenantAdmin(ctx)) redirect("/sin-acceso");
  const tdb = tenantDb(tenant.id);
  const [modules, openPlans, openRequests] = await Promise.all([
    getModules(tenant.id),
    tdb.creditPlan.count({ where: { status: "ACTIVE" } }),
    tdb.importRequest.count({ where: { status: { in: ["PENDING_REVIEW", "QUOTED"] } } }),
  ]);
  return (
    <>
      <PageHeader title="Módulos" description="Prende o apaga funciones de la tienda. Apagado: desaparecen del menú, de las páginas y del checkout para las clientas." />
      <ModuleSwitches
        items={[
          {
            key: "imports",
            title: "Importaciones por encargo",
            icon: "✈️",
            description: "Las clientas encargan productos de SHEIN, Alibaba y otras tiendas por lotes, con cotización y 50 % de adelanto.",
            when: "Apagado: se oculta la sección «Importaciones» y nadie puede enviar encargos nuevos.",
            manage: "/admin/importaciones",
            enabled: modules.imports,
            note: !modules.imports && openRequests ? `Hay ${openRequests} encargo(s) sin terminar: sigues viéndolos en el panel.` : null,
          },
          {
            key: "credit",
            title: "Venta a crédito (Credi-SF)",
            icon: "🗓️",
            description: "Compras con inicial y cuotas quincenales, con fiador, niveles y cobranza automática.",
            when: "Apagado: no sale «Pagar a crédito» en el checkout ni la sección Credi-SF. Los créditos abiertos se siguen cobrando.",
            manage: "/admin/credito",
            enabled: modules.credit,
            note: !modules.credit && openPlans ? `Hay ${openPlans} crédito(s) abiertos: la cobranza y los avisos siguen funcionando.` : null,
          },
        ]}
      />
    </>
  );
}
