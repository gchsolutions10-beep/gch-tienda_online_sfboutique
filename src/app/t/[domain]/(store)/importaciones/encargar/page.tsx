import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { getCurrentCustomer } from "@/server/auth/customer-session";
import { getModules } from "@/server/queries/modules";
import { openBatch } from "@/server/services/imports";
import { ModuleOff } from "@/components/store/module-off";
import { ImportRequestForm } from "@/components/store/import-forms";
import { IMPORT_DISCLAIMER, NOT_ACCEPTED } from "@/lib/imports";

export const metadata = { title: "Encargar un producto", robots: { index: false } };

export default async function RequestImportPage({ params }: PageProps<"/t/[domain]/importaciones/encargar">) {
  const tenant = await getTenant((await params).domain);
  if (!(await getModules(tenant.id)).imports) return <ModuleOff title="Importaciones" />;
  const me = await getCurrentCustomer(tenant.id);
  if (!me) redirect("/mi-cuenta?next=/importaciones/encargar");
  const batch = await openBatch(tenant.id);
  const day = (d: Date) => d.toLocaleDateString("es-VE", { day: "numeric", month: "long", timeZone: "America/Caracas" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/importaciones" className="text-sm font-semibold text-store-muted hover:text-store-ink">
        ← Importaciones
      </Link>
      <h1 className="mt-2 font-display text-4xl font-semibold">Encargar un producto</h1>
      {batch ? (
        <>
          <p className="mb-6 mt-1 text-sm text-store-muted">
            Lote «{batch.name}» · recibe pedidos hasta el {day(batch.closesAt)}. Revisamos tu enlace y te enviamos la cotización.
          </p>
          <ImportRequestForm batchId={batch.id} disclaimer={IMPORT_DISCLAIMER(tenant.name)} />
          <p className="mt-4 text-xs text-store-muted">No gestionamos: {NOT_ACCEPTED.join(" · ")}.</p>
        </>
      ) : (
        <p className="mt-4 rounded-3xl bg-store-card p-6 shadow-sm">
          No hay un lote abierto en este momento. Activa las notificaciones en{" "}
          <Link href="/mi-cuenta" className="underline">
            tu cuenta
          </Link>{" "}
          y te avisamos cuando abramos el próximo.
        </p>
      )}
    </div>
  );
}
