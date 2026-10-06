import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/server/tenant";
import { requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { ReviewApplicationForm } from "@/components/admin/credit-forms";
import { card, cn } from "@/components/ui/styles";
import { formatVeId, formatVePhone, whatsappLink } from "@/lib/ve-ids";

export const metadata = { title: "Solicitud de crédito" };

export default async function ApplicationPage({ params }: PageProps<"/t/[domain]/admin/credito/solicitudes/[id]">) {
  const { domain, id } = await params;
  const tenant = await getTenant(domain);
  await requireStaff(tenant, ["TENANT_ADMIN", "BRANCH_ADMIN"], `/admin/credito/solicitudes/${id}`);
  const a = await tenantDb(tenant.id).creditApplication.findFirst({ where: { id }, include: { customer: { select: { id: true, ordersCount: true, creditLevel: true } } } });
  if (!a) notFound();
  const fmt = (d: Date) => d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });
  const lat = a.latitude ? Number(a.latitude) : null;
  const lng = a.longitude ? Number(a.longitude) : null;
  const origin = `https://${decodeURIComponent(domain)}`;
  const guarantorUrl = `${origin}/credito/fiador/${a.guarantorToken}`;

  return (
    <>
      <Link href="/admin/credito?vista=solicitudes" className="text-sm font-semibold text-muted hover:text-ink">← Solicitudes</Link>
      <h1 className="mb-6 mt-2 font-display text-2xl font-extrabold">Solicitud de {a.fullName}</h1>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className={cn(card, "p-5 text-sm")}>
            <h2 className="text-lg font-bold">Compradora</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Row k="Cédula" v={formatVeId(a.idType, a.idNumber)} />
              <Row k="Teléfono" v={formatVePhone(a.phone)} />
              {a.whatsapp && a.whatsapp !== a.phone ? <Row k="WhatsApp" v={formatVePhone(a.whatsapp)} /> : null}
              {a.email ? <Row k="Correo" v={a.email} /> : null}
              <Row k="Dirección" v={[a.address, a.city, a.state].filter(Boolean).join(", ")} />
              <Row k="Compras pagadas" v={String(a.customer.ordersCount)} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={whatsappLink(a.whatsapp ?? a.phone, `¡Hola ${a.fullName.split(" ")[0]}! Te escribimos de ${tenant.name} para confirmar tu solicitud de crédito Credi-SF.`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ok underline">
                💬 Verificar por WhatsApp
              </a>
              {lat !== null && lng !== null ? (
                <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-strong underline">
                  📍 Ver en el mapa
                </a>
              ) : (
                <span className="text-muted">Sin pin en el mapa</span>
              )}
              <Link href={`/admin/clientes/${a.customer.id}`} className="font-semibold underline">Ficha en el CRM</Link>
            </div>
            {a.idPhotoKey ? <IdPhoto k={a.idPhotoKey} label="Cédula de la compradora" /> : null}
          </section>

          <section className={cn(card, "p-5 text-sm")}>
            <h2 className="text-lg font-bold">Fiador</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Row k="Nombre" v={a.guarantorName} />
              <Row k="Cédula" v={formatVeId(a.guarantorIdType, a.guarantorIdNumber)} />
              <Row k="Teléfono" v={formatVePhone(a.guarantorPhone)} />
              <Row k="Aceptó" v={a.guarantorAcceptedAt ? `${fmt(a.guarantorAcceptedAt)} · IP ${a.guarantorIp ?? "—"}` : "Todavía no"} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={whatsappLink(a.guarantorPhone, `Hola ${a.guarantorName.split(" ")[0]}, te escribimos de ${tenant.name}. ${a.fullName} te indicó como su fiador en Credi-SF. ${a.guarantorAcceptedAt ? "Queremos confirmar que estás de acuerdo." : `Puedes leer el contrato y aceptar aquí: ${guarantorUrl}`}`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ok underline">
                💬 Escribir al fiador
              </a>
            </div>
            {a.guarantorPhotoKey ? <IdPhoto k={a.guarantorPhotoKey} label="Cédula del fiador" /> : null}
          </section>

          <section className={cn(card, "p-5 text-sm")}>
            <h2 className="text-lg font-bold">Contrato aceptado</h2>
            <dl className="mt-2 space-y-1">
              <Row k="Versión" v={a.contractVersion} />
              <Row k="Huella del texto (SHA-256)" v={a.contractHash} mono />
              <Row k="Aceptó la compradora" v={`${fmt(a.acceptedAt)} · IP ${a.acceptIp ?? "—"}`} />
              <Row k="Dispositivo" v={a.acceptUserAgent ?? "—"} />
            </dl>
            <p className="mt-2 text-xs text-muted">Esta evidencia sirve para demostrar qué texto aceptó cada parte y cuándo. Guárdala; valida su uso con tu abogado.</p>
          </section>
        </div>

        <div className="space-y-4">
          {a.status === "WAITING_GUARANTOR" || a.status === "IN_REVIEW" ? (
            <ReviewApplicationForm applicationId={a.id} guarantorAccepted={Boolean(a.guarantorAcceptedAt)} />
          ) : (
            <section className={cn(card, "p-5 text-sm")}>
              <h2 className="text-lg font-bold">{a.status === "APPROVED" ? "✓ Aprobada" : "Rechazada"}</h2>
              <p className="mt-1 text-muted">
                {a.reviewedAt ? fmt(a.reviewedAt) : ""} {a.reviewedByName ? `· ${a.reviewedByName}` : ""}
              </p>
              {a.reviewNote ? <p className="mt-2">{a.reviewNote}</p> : null}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className={cn("break-words font-medium", mono && "font-mono text-xs")}>{v}</dd>
    </div>
  );
}

function IdPhoto({ k, label }: { k: string; label: string }) {
  const href = `/admin/credito/cedula/${k}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 block">
      <span className="text-xs text-muted">{label} (toca para ampliar)</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- documento privado servido por el panel */}
      <img src={href} alt={label} className="mt-1 max-h-56 rounded-xl border border-line object-contain" />
    </a>
  );
}
