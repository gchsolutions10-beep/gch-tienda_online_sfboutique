import { getTenant } from "@/server/tenant";
import { formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Política de privacidad" };

/** Política de privacidad (plantilla: VALIDAR CON UN ABOGADO venezolano). */
export default async function PrivacyPage({ params }: PageProps<"/t/[domain]/privacidad">) {
  const tenant = await getTenant((await params).domain);
  const who = tenant.legalName && !tenant.legalName.includes("por configurar") ? `${tenant.legalName}${tenant.rif ? `, RIF ${tenant.rif}` : ""}` : tenant.name;
  const contact = [tenant.contactPhone && `WhatsApp ${formatVePhone(tenant.contactPhone)}`, tenant.contactEmail].filter(Boolean).join(" o ") || "nuestros canales de atención";

  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-10 leading-relaxed">
      <h1 className="font-display text-4xl font-semibold">Política de privacidad</h1>
      <p>
        {who} («la tienda») trata tus datos personales de acuerdo con la Constitución de la República Bolivariana de Venezuela (art. 28 y 60) y la normativa vigente.
      </p>
      <h2 className="pt-2 font-display text-2xl font-semibold">Qué datos usamos y para qué</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <b>Compras:</b> nombre, cédula o RIF, teléfono/WhatsApp, correo y dirección de entrega, para preparar, enviar y facturar tu pedido.
        </li>
        <li>
          <b>Crédito (Credi-SF):</b> además, la ubicación de tu vivienda, la foto de tu cédula y los datos y la cédula de tu fiador, para evaluar, otorgar y cobrar el
          crédito. Registramos la fecha, la hora, la IP y el dispositivo con que aceptas el contrato.
        </li>
        <li>
          <b>Avisos:</b> si los activas, enviamos notificaciones a tu teléfono sobre tus cuotas y pagos. Los desactivas cuando quieras en «Mi cuenta».
        </li>
      </ul>
      <h2 className="pt-2 font-display text-2xl font-semibold">Quién los ve</h2>
      <p>
        Solo el personal autorizado de la tienda. Las fotos de las cédulas no son públicas. No vendemos tus datos. Solo los compartimos con quien haga falta para
        cumplir la ley o para cobrar una deuda vencida por las vías legales indicadas en el contrato de crédito.
      </p>
      <h2 className="pt-2 font-display text-2xl font-semibold">Cuánto tiempo los guardamos</h2>
      <p>
        Los datos de las compras y las facturas, el tiempo que exige la ley tributaria. Los del crédito, mientras haya saldo pendiente y el tiempo necesario para
        cualquier reclamo posterior. Si tu solicitud no se aprueba, puedes pedir que borremos tus fotos.
      </p>
      <h2 className="pt-2 font-display text-2xl font-semibold">Tus derechos</h2>
      <p>
        Puedes pedir ver, corregir o borrar tus datos (salvo los que la ley nos obliga a conservar) escribiendo a {contact}. El fiador tiene los mismos derechos sobre
        sus datos.
      </p>
      <p className="text-sm opacity-70">Última actualización: octubre de 2026.</p>
    </article>
  );
}
