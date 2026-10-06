import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { contractFor, guarantorLabel } from "@/server/queries/credit";
import { GuarantorAcceptForm } from "@/components/store/account-forms";
import { ModuleOff } from "@/components/store/module-off";
import { getModules } from "@/server/queries/modules";
import { formatVeId } from "@/lib/ve-ids";

export const metadata = { title: "Aceptación del fiador", robots: { index: false } };

/** Página del fiador: lee el contrato, confirma su cédula y acepta desde su teléfono. */
export default async function GuarantorPage({ params }: PageProps<"/t/[domain]/credito/fiador/[token]">) {
  const { domain, token } = await params;
  const tenant = await getTenant(domain);
  if (!(await getModules(tenant.id)).credit) return <ModuleOff title="Credi-SF" />;
  const app = await tenantDb(tenant.id).creditApplication.findFirst({
    where: { guarantorToken: token },
    select: { status: true, fullName: true, idType: true, idNumber: true, guarantorName: true, guarantorIdType: true, guarantorIdNumber: true, guarantorAcceptedAt: true },
  });
  if (!app) notFound();
  const contract = await contractFor(tenant, {
    buyerName: app.fullName,
    buyerId: formatVeId(app.idType, app.idNumber),
    guarantorName: app.guarantorName,
    guarantorId: guarantorLabel(app),
  });
  // Primer nombre y la inicial del apellido: no se exponen más datos de la compradora.
  const [first, last] = app.fullName.split(" ");
  const buyer = `${first}${last ? ` ${last[0]}.` : ""}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Credi-SF · {tenant.name}</p>
      <h1 className="font-display text-4xl font-semibold">Hola, {app.guarantorName.split(" ")[0]}</h1>
      {app.guarantorAcceptedAt ? (
        <p className="mt-4 rounded-2xl bg-ok/15 p-4 font-semibold text-ok">
          ✅ Aceptaste ser fiador el {app.guarantorAcceptedAt.toLocaleDateString("es-VE", { dateStyle: "long", timeZone: "America/Caracas" })}. ¡Gracias!
        </p>
      ) : app.status !== "WAITING_GUARANTOR" ? (
        <p className="mt-4 rounded-2xl bg-store-soft p-4">Esta solicitud ya no espera la aceptación del fiador.</p>
      ) : (
        <>
          <p className="mb-5 mt-2">
            <b>{buyer}</b> te pidió que seas su <b>fiador</b> para comprar a crédito en {tenant.name}. Si aceptas, respondes por sus pagos si ella no paga. Lee el
            contrato con calma antes de aceptar.
          </p>
          <GuarantorAcceptForm token={token} contract={contract} />
        </>
      )}
    </div>
  );
}
