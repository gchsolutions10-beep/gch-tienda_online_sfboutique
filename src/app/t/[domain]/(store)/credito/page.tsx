import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { getCurrentCustomer } from "@/server/auth/customer-session";
import { getCreditSettings } from "@/server/services/credit";
import { contractFor } from "@/server/queries/credit";
import { Contract } from "@/components/store/account-forms";
import { CREDIT_LEVELS, type CreditLevel } from "@/lib/credit";
import { formatUsd } from "@/lib/money";

export const metadata = { title: "Credi-SF: compra a crédito", description: "Compra hoy y paga en cuotas quincenales." };

export default async function CreditLandingPage({ params }: PageProps<"/t/[domain]/credito">) {
  const tenant = await getTenant((await params).domain);
  const [settings, me] = await Promise.all([getCreditSettings(tenant.id), getCurrentCustomer(tenant.id)]);
  const contract = await contractFor(tenant, {});
  const cta = me ? (me.creditStatus === "APPROVED" ? "/catalogo" : me.creditStatus === "PENDING" ? "/mi-cuenta" : "/credito/solicitud") : "/mi-cuenta?next=/credito/solicitud";

  if (!settings.enabled) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-4xl font-semibold">Credi-SF</h1>
        <p className="mt-3 text-store-muted">La compra a crédito estará disponible muy pronto.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Compra a crédito</p>
      <h1 className="font-display text-5xl font-semibold">Credi-SF</h1>
      <p className="mt-3 max-w-2xl text-lg">Llévate tu ropa hoy pagando una inicial y el resto en cuotas cada 15 días. Mientras más puntual, mejores condiciones.</p>

      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {([1, 2, 3] as CreditLevel[]).map((n) => (
          <li key={n} className="rounded-3xl bg-store-card p-5 shadow-sm">
            <span className="grid size-12 place-items-center rounded-full bg-brand text-xl font-bold text-on-brand">{n}</span>
            <p className="mt-3 font-display text-xl font-semibold">{CREDIT_LEVELS[n].name}</p>
            <p className="mt-1 text-sm">{CREDIT_LEVELS[n].description}</p>
            <p className="mt-2 text-xs text-store-muted">
              Hasta {formatUsd(settings.maxByLevel[n])} financiados ·{" "}
              {n === 1 ? "al empezar" : n === 2 ? `tras ${settings.upgradeAfter} créditos pagados a tiempo` : `tras ${settings.vipAfter} créditos pagados a tiempo`}
            </p>
          </li>
        ))}
      </ol>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-semibold">¿Cómo funciona?</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Crea tu cuenta y llena tu solicitud: dirección con el mapa, foto de tu cédula y los datos de un fiador.</li>
            <li>Tu fiador recibe un enlace y acepta desde su teléfono.</li>
            <li>La tienda revisa y te confirma por WhatsApp.</li>
            <li>Al comprar elige «Pagar a crédito»: ves la inicial y las fechas de cada cuota. Pagas la inicial y te llevas tu compra.</li>
            <li>Instala la app y activa los avisos: te recordamos antes de cada cuota.</li>
          </ol>
          <p className="rounded-2xl bg-store-soft p-4 text-sm">
            ⚠️ Tienes {settings.graceDays} días de gracia después de cada vencimiento. Desde el día {settings.graceDays + 1} se suma un recargo de{" "}
            {formatUsd(settings.lateFeeCents)} por gastos de cobranza y bajas a Nivel 1.
          </p>
          <Link href={cta} className="inline-block rounded-full bg-brand px-6 py-3 font-semibold text-on-brand">
            {me?.creditStatus === "APPROVED" ? "Ir a comprar" : me?.creditStatus === "PENDING" ? "Ver mi solicitud" : "Solicitar mi crédito"}
          </Link>
        </div>
        <div>
          <h2 className="mb-3 font-display text-3xl font-semibold">Contrato</h2>
          <Contract paragraphs={contract} />
        </div>
      </section>
    </div>
  );
}
