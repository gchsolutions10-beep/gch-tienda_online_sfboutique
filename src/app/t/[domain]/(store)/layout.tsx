import Link from "next/link";
import type { CSSProperties } from "react";
import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { getCurrentRates, getDisplayRate, getStoreSettings } from "@/server/queries/store";
import { SiteHeader } from "@/components/store/site-header";
import { BagDrawer } from "@/components/store/bag-drawer";
import { ServiceWorkerRegister } from "@/components/store/pwa";
import { getModules } from "@/server/queries/modules";
import { tenantThemeStyle } from "@/lib/theme";
import { formatRate } from "@/lib/money";
import { formatVePhone, whatsappLink } from "@/lib/ve-ids";

export default async function StoreLayout({ children, params }: LayoutProps<"/t/[domain]">) {
  const tenant = await getTenant((await params).domain);
  const [categories, rates, settings, displayRate, modules] = await Promise.all([
    tenantDb(tenant.id).category.findMany({ where: { isActive: true, parentId: null }, orderBy: { sortOrder: "asc" }, select: { name: true, slug: true } }),
    getCurrentRates(tenant.id),
    getStoreSettings(tenant.id),
    getDisplayRate(tenant.id),
    getModules(tenant.id),
  ]);
  const source = settings.displayRateSource === "P2P" && rates.p2p ? "P2P" : "BCV";
  const shownRate = source === "P2P" ? rates.p2p : rates.bcv;
  const rateLabel = displayRate && shownRate
    ? `Tasa ${source} del ${new Date(shownRate.effectiveAt).toLocaleDateString("es-VE", { day: "numeric", month: "short", timeZone: "America/Caracas" })}: ${formatRate(shownRate.rate)} por dólar · Precios en USD y bolívares`
    : null;

  return (
    <div style={tenantThemeStyle(tenant) as CSSProperties} className="flex min-h-dvh flex-col bg-store text-store-ink">
      <a href="#contenido" className="sr-only z-50 rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Saltar al contenido
      </a>
      <SiteHeader name={tenant.name} logoUrl={tenant.logoUrl} categories={categories} rateLabel={rateLabel} modules={modules} />
      <main id="contenido" className="flex-1">
        {children}
      </main>

      <footer className="mt-16 bg-bar text-on-bar">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-2xl font-semibold">{tenant.name}</p>
            {tenant.tagline ? <p className="mt-1 opacity-80">{tenant.tagline}</p> : null}
            {tenant.fiscalAddress ? <p className="mt-3 opacity-80">📍 {tenant.fiscalAddress}</p> : null}
          </div>
          <div>
            <p className="font-semibold uppercase tracking-widest opacity-80">Contacto</p>
            <ul className="mt-3 space-y-1.5">
              {tenant.contactPhone ? (
                <li>
                  <a href={whatsappLink(tenant.contactPhone)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    WhatsApp {formatVePhone(tenant.contactPhone)}
                  </a>
                </li>
              ) : null}
              {tenant.instagram ? (
                <li>
                  <a href={`https://www.instagram.com/${tenant.instagram}/`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    Instagram @{tenant.instagram}
                  </a>
                </li>
              ) : null}
              {tenant.contactEmail ? <li>{tenant.contactEmail}</li> : null}
            </ul>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-widest opacity-80">Tienda</p>
            <ul className="mt-3 space-y-1.5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/catalogo?categoria=${c.slug}`} className="hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-widest opacity-80">Pagos</p>
            <p className="mt-3 opacity-90">Pago Móvil · Transferencia · Punto de venta · Efectivo Bs y USD · Zelle · USDT</p>
            {rates.bcv ? <p className="mt-3 text-xs opacity-80">Tasa BCV: {formatRate(rates.bcv.rate)}</p> : null}
            {modules.credit ? (
              <p className="mt-3">
                <Link href="/credito" className="font-semibold hover:underline">
                  Credi-SF: compra a crédito →
                </Link>
              </p>
            ) : null}
            {modules.imports ? (
              <p className="mt-2">
                <Link href="/importaciones" className="font-semibold hover:underline">
                  Importaciones por encargo →
                </Link>
              </p>
            ) : null}
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
              {modules.credit || modules.imports ? <Link href="/mi-cuenta" className="hover:underline">Mi cuenta</Link> : null}
              <Link href="/privacidad" className="hover:underline">Privacidad</Link>
              <Link href="/login" className="hover:underline">Acceso del personal</Link>
            </p>
          </div>
        </div>
        <p className="border-t border-current/15 px-6 py-4 text-center text-xs opacity-80">
          © {new Date().getFullYear()} {tenant.legalName && !tenant.legalName.includes("por configurar") ? tenant.legalName : tenant.name}
          {tenant.rif ? ` · RIF ${tenant.rif}` : ""} · Tienda por GchSolutions
        </p>
      </footer>

      <BagDrawer rate={displayRate} whatsapp={tenant.contactPhone} storeName={tenant.name} />
      <ServiceWorkerRegister />
    </div>
  );
}
