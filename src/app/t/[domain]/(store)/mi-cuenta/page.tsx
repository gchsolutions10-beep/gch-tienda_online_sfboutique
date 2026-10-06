import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { getCurrentCustomer } from "@/server/auth/customer-session";
import { getCreditSettings } from "@/server/services/credit";
import { customerPlans, latestApplication } from "@/server/queries/credit";
import { AuthForms, GuarantorLink, LogoutButton } from "@/components/store/account-forms";
import { InstallButton, PushToggle } from "@/components/store/pwa";
import { CreditSchedule } from "@/components/credit-schedule";
import { asLevel, CREDIT_LEVELS } from "@/lib/credit";
import { formatUsd, toCents } from "@/lib/money";
import { publicOrigin, safeNextPath } from "@/lib/hosts";
import { cn } from "@/components/ui/styles";
import { getModules } from "@/server/queries/modules";
import { ModuleOff } from "@/components/store/module-off";
import { MyImportRequests } from "@/components/store/my-import-requests";
import { formatVePhone } from "@/lib/ve-ids";

export const metadata = { title: "Mi cuenta", robots: { index: false } };

const card = "rounded-3xl bg-store-card p-5 shadow-sm sm:p-6";

export default async function AccountPage({ params, searchParams }: PageProps<"/t/[domain]/mi-cuenta">) {
  const { domain } = await params;
  const tenant = await getTenant(domain);
  const [me, modules] = await Promise.all([getCurrentCustomer(tenant.id), getModules(tenant.id)]);
  const next = safeNextPath((await searchParams).next, "/mi-cuenta");
  if (!modules.credit && !modules.imports) return <ModuleOff title="Mi cuenta" />;
  const purpose = [modules.credit && "comprar a crédito con Credi-SF", modules.imports && "encargar productos de SHEIN, Alibaba y otras tiendas"].filter(Boolean).join(" y ");

  if (!me) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-display text-4xl font-semibold">Mi cuenta</h1>
        <p className="mb-6 mt-1 text-sm text-store-muted">
          La cuenta es para {purpose}, y recibir avisos. Para comprar de contado no la necesitas.
        </p>
        <AuthForms next={next} />
      </div>
    );
  }

  const [settings, app, plans] = await Promise.all([getCreditSettings(tenant.id), latestApplication(tenant.id, me.id), customerPlans(tenant.id, me.id)]);
  const level = CREDIT_LEVELS[asLevel(me.creditLevel)];
  const now = new Date();
  const origin = publicOrigin(null, tenant.slug) || `https://${decodeURIComponent(domain)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Mi cuenta</p>
          <h1 className="font-display text-4xl font-semibold">Hola, {me.firstName}</h1>
        </div>
        <LogoutButton />
      </div>

      {modules.credit ? (
      <section className={card}>
        <h2 className="font-display text-2xl font-semibold">Credi-SF</h2>
        {me.creditStatus === "APPROVED" ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <span className="grid size-20 place-items-center rounded-full bg-brand text-3xl font-bold text-on-brand" aria-hidden>
              {me.creditLevel}
            </span>
            <div>
              <p className="text-lg font-semibold">{level.name}</p>
              <p className="text-sm">{level.description}</p>
              <p className="text-sm text-store-muted">Puedes financiar hasta {formatUsd(settings.maxByLevel[asLevel(me.creditLevel)])} por compra.</p>
              <Link href="/catalogo" className="mt-2 inline-block text-sm font-semibold text-brand-strong underline">
                Ir a comprar →
              </Link>
            </div>
          </div>
        ) : me.creditStatus === "PENDING" && app?.status === "WAITING_GUARANTOR" ? (
          <div className="mt-3">
            <GuarantorLink url={`${origin}/credito/fiador/${app.guarantorToken}`} phone={app.guarantorPhone} />
          </div>
        ) : me.creditStatus === "PENDING" ? (
          <p className="mt-2 rounded-xl bg-store-soft p-3 text-sm">⏳ Tu fiador ya aceptó. La tienda está revisando tu solicitud y te escribirá por WhatsApp para confirmar tus datos.</p>
        ) : me.creditStatus === "SUSPENDED" ? (
          <p className="mt-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">Tu crédito está suspendido. Escríbenos para revisarlo.</p>
        ) : (
          <div className="mt-2 text-sm">
            {me.creditStatus === "REJECTED" ? (
              <p className="mb-2 rounded-xl bg-store-soft p-3">Tu solicitud anterior no fue aprobada{app?.reviewNote ? `: ${app.reviewNote}` : ""}. Puedes enviar una nueva.</p>
            ) : null}
            <p>Compra hoy y paga en cuotas quincenales. Empiezas con 60 % de inicial y, si pagas a tiempo, subes de nivel.</p>
            <Link href="/credito/solicitud" className="mt-3 inline-block rounded-full bg-brand px-5 py-2.5 font-semibold text-on-brand">
              Solicitar mi crédito
            </Link>
          </div>
        )}
      </section>
      ) : null}

      {modules.imports ? <MyImportRequests tenantId={tenant.id} customerId={me.id} /> : null}

      {plans.length ? (
        <section className={card}>
          <h2 className="font-display text-2xl font-semibold">Mis compras a crédito</h2>
          <div className="mt-3 space-y-6">
            {plans.map((p) => (
              <div key={p.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/pedido/${p.order.trackingToken}`} className="font-semibold underline">
                    Pedido #{p.order.number}
                  </Link>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", p.status === "PAID" ? "bg-ok/15 text-ok" : "bg-store-soft")}>
                    {p.status === "PAID" ? "Pagado completo" : `Pagado ${formatUsd(toCents(p.order.paidUsd))} de ${formatUsd(toCents(p.order.totalUsd))}`}
                  </span>
                </div>
                <CreditSchedule
                  down={p.downPaymentUsd}
                  downPaid={!["PENDING", "PAYMENT_REVIEW"].includes(p.order.status)}
                  rows={p.installments}
                  graceDays={settings.graceDays}
                  now={now}
                />
                {p.status === "ACTIVE" && p.order.status !== "CANCELLED" ? (
                  <Link href={`/pedido/${p.order.trackingToken}`} className="mt-2 inline-block rounded-full border-2 border-store-ink px-4 py-2 text-sm font-semibold">
                    Pagar una cuota
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <InstallButton storeName={tenant.name} />
        <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </div>
      <p className="text-xs text-store-muted">
        Tus datos: {me.email ?? "sin correo"} · {me.phone ? formatVePhone(me.phone) : ""}. ¿Quieres cambiarlos o borrar tu cuenta? Escríbenos por WhatsApp. Lee la{" "}
        <Link href="/privacidad" className="underline">
          política de privacidad
        </Link>
        .
      </p>
    </div>
  );
}
