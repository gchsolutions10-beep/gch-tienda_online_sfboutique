import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { getCurrentCustomer } from "@/server/auth/customer-session";
import { getModules } from "@/server/queries/modules";
import { storeImports } from "@/server/queries/imports";
import { getImportSettings } from "@/server/services/imports";
import { ModuleOff } from "@/components/store/module-off";
import { JoinImportButton } from "@/components/store/import-forms";
import { IMPORT_DISCLAIMER, NOT_ACCEPTED } from "@/lib/imports";
import { formatUsd, toCents } from "@/lib/money";

export const metadata = {
  title: "Importaciones por encargo",
  description: "Pide lo que quieras de SHEIN, Alibaba, AliExpress y más: lo compramos, lo traemos y te lo entregamos.",
};

const card = "rounded-3xl bg-store-card p-5 shadow-sm sm:p-6";
const day = (d: Date) => d.toLocaleDateString("es-VE", { day: "numeric", month: "long", timeZone: "America/Caracas" });
const stars = (n: number) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));

export default async function ImportsPage({ params }: PageProps<"/t/[domain]/importaciones">) {
  const tenant = await getTenant((await params).domain);
  const modules = await getModules(tenant.id);
  if (!modules.imports) return <ModuleOff title="Importaciones" />;
  const [data, me, settings] = await Promise.all([storeImports(tenant.id), getCurrentCustomer(tenant.id), getImportSettings(tenant.id)]);
  const disclaimer = IMPORT_DISCLAIMER(tenant.name);
  const { batch } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-store-muted">Servicio de encargos</p>
        <h1 className="font-display text-5xl font-semibold">Importaciones</h1>
        <p className="mt-3 text-lg">
          ¿Viste algo en SHEIN, Alibaba, AliExpress o Temu? Te lo compramos, lo traemos en el próximo lote y te lo entregamos aquí. Pagas un adelanto del{" "}
          {settings.depositPct} % para procesarlo y el resto cuando llegue.
        </p>
      </header>

      {batch ? (
        <section className="rounded-3xl bg-brand p-6 text-on-brand shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Lote abierto</p>
          <h2 className="font-display text-3xl font-semibold">{batch.name}</h2>
          {batch.description ? <p className="mt-2 max-w-2xl opacity-90">{batch.description}</p> : null}
          <p className="mt-3 font-semibold">
            Recibimos pedidos hasta el {day(batch.closesAt)}
            {batch.estimatedArrival ? ` · llegada estimada: ${day(batch.estimatedArrival)}` : ""}
          </p>
          <Link href={me ? "/importaciones/encargar" : "/mi-cuenta?next=/importaciones/encargar"} className="mt-5 inline-block rounded-full bg-store-card px-6 py-3 font-semibold text-store-ink">
            Encargar con mi enlace
          </Link>
        </section>
      ) : (
        <section className={card}>
          <h2 className="font-display text-2xl font-semibold">No hay un lote abierto en este momento</h2>
          <p className="mt-2 text-store-muted">
            {data.upcoming
              ? `El próximo lote, «${data.upcoming.name}», recibe pedidos del ${day(data.upcoming.opensAt)} al ${day(data.upcoming.closesAt)}.`
              : "Activa las notificaciones en tu cuenta y te avisamos cuando abramos el próximo."}
          </p>
        </section>
      )}

      {batch && batch.products.length ? (
        <section>
          <h2 className="font-display text-3xl font-semibold">Lo que se está pidiendo</h2>
          <p className="mt-1 text-sm text-store-muted">Súmate a un pedido grupal: el precio es estimado y se confirma en tu cotización.</p>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {batch.products.map((p) => (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-3xl bg-store-card shadow-sm">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen subida por la tienda
                  <img src={p.imageUrl} alt={p.title} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid aspect-[4/5] place-items-center bg-store-soft text-5xl" aria-hidden>
                    📦
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-store-muted">{p.sourceStore}</p>
                  <h3 className="font-display text-xl font-semibold leading-tight">{p.title}</h3>
                  {p.description ? <p className="text-sm text-store-muted">{p.description}</p> : null}
                  {p.estimatedPriceUsd ? <p className="font-semibold">≈ {formatUsd(toCents(p.estimatedPriceUsd))} c/u (estimado)</p> : null}
                  {p.group.people > 0 ? (
                    <p className="rounded-full bg-accent/15 px-3 py-1 text-center text-sm font-semibold text-accent">
                      🔥 {p.group.people} {p.group.people === 1 ? "usuaria ha pedido" : "usuarias han pedido"} este artículo
                    </p>
                  ) : null}
                  <div className="mt-auto pt-2">
                    <JoinImportButton product={{ id: p.id, title: p.title, sizes: p.sizes, colors: p.colors }} loggedIn={Boolean(me)} disclaimer={disclaimer} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        {[
          ["1", "Pide", "Pega el enlace o súmate a un producto del lote. Necesitas tu cuenta."],
          ["2", "Cotizamos", `Te enviamos el precio final (producto + flete + gestión). Pagas el ${settings.depositPct} % de adelanto.`],
          ["3", "Recibes", "Compramos con el lote, lo traemos y te avisamos para pagar el saldo y retirarlo."],
        ].map(([n, t, d]) => (
          <div key={n} className={card}>
            <span className="grid size-10 place-items-center rounded-full bg-brand font-bold text-on-brand">{n}</span>
            <p className="mt-3 font-display text-xl font-semibold">{t}</p>
            <p className="mt-1 text-sm">{d}</p>
          </div>
        ))}
      </section>

      {data.history.length ? (
        <section>
          <h2 className="font-display text-3xl font-semibold">Lotes entregados</h2>
          <p className="mt-1 text-sm text-store-muted">Opiniones verificadas de clientas que recibieron su encargo.</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {data.history.map((b) => (
              <article key={b.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl font-semibold">{b.name}</h3>
                  {b.average !== null ? (
                    <span className="text-sm font-semibold text-amber-600" aria-label={`${b.average} de 5 estrellas`}>
                      {stars(b.average)} {b.average.toLocaleString("es-VE")}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-store-muted">
                  ✅ Entregado{b.estimatedArrival ? ` · ${day(b.estimatedArrival)}` : ""} · {b.delivered} {b.delivered === 1 ? "encargo entregado" : "encargos entregados"}
                </p>
                {b.reviews.length ? (
                  <ul className="mt-3 space-y-3">
                    {b.reviews.slice(0, 4).map((r) => (
                      <li key={r.id} className="rounded-2xl bg-store-soft p-3 text-sm">
                        <p className="text-amber-600" aria-label={`${r.rating} de 5 estrellas`}>
                          {stars(r.rating)}
                        </p>
                        <p className="mt-1">«{r.body}»</p>
                        <p className="mt-1 text-xs text-store-muted">
                          {r.name} · compra verificada
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2">
        <div className={card}>
          <h2 className="font-display text-xl font-semibold">Condiciones del servicio</h2>
          <p className="mt-2 text-sm">{disclaimer}</p>
          <p className="mt-2 text-sm text-store-muted">Los precios mostrados son estimados y pueden variar hasta la cotización final.</p>
        </div>
        <div className={card}>
          <h2 className="font-display text-xl font-semibold">No gestionamos</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {NOT_ACCEPTED.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
