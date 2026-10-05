"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDomain, removeDomain } from "@/server/actions/admin/appearance";
import { buttonGhost, buttonPrimary, card, cn, inputClass } from "@/components/ui/styles";

/** Dominio propio (ej. sfboutique.com): se registra aquí y se conecta en Vercel y en el DNS. */
export function DomainForm({ domains, current }: { domains: string[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const apex = domains.find((d) => !d.startsWith("www.")) ?? domains[0]?.replace(/^www\./, "");

  return (
    <section className={cn(card, "space-y-4 p-5")}>
      <div>
        <h2 className="text-lg font-bold">Dominio propio</h2>
        <p className="text-sm text-muted">
          Hoy tu tienda está en <b>{current}</b>. Con un dominio propio (por ejemplo <b>sfboutique.com</b>) se ve más profesional y es más fácil de recordar.
        </p>
      </div>

      {apex ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft p-3 text-sm">
          <span>
            Registrado: <b>{apex}</b> y <b>www.{apex}</b>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              window.confirm(`¿Quitar ${apex}? La tienda dejará de abrir en ese dominio.`) &&
              start(async () => {
                const r = await removeDomain(apex);
                setError(r.ok ? null : r.error);
                router.refresh();
              })
            }
            className={cn(buttonGhost, "hover:text-danger")}
          >
            Quitar
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("domain") ?? "");
            start(async () => {
              const r = await addDomain(value);
              setError(r.ok ? null : r.error);
              router.refresh();
            });
          }}
          method="post"
          className="flex flex-wrap gap-2"
        >
          <label htmlFor="domain" className="sr-only">Dominio</label>
          <input id="domain" name="domain" required placeholder="sfboutique.com" className={cn(inputClass, "max-w-xs")} />
          <button disabled={pending} className={buttonPrimary}>{pending ? "Guardando…" : "Registrar dominio"}</button>
        </form>
      )}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-medium text-danger">{error}</p> : null}

      <ol className="list-decimal space-y-1.5 rounded-xl bg-cream p-4 pl-8 text-sm">
        <li>Compra el dominio (por ejemplo en Namecheap, GoDaddy o NIC.ve para .com.ve).</li>
        <li>Regístralo aquí arriba.</li>
        <li>
          En Vercel: proyecto → <b>Settings → Domains → Add</b>, y agrega <b>{apex ?? "tudominio.com"}</b> y <b>www.{apex ?? "tudominio.com"}</b>.
        </li>
        <li>
          En tu proveedor del dominio, crea los registros DNS que te muestre Vercel (normalmente un registro <b>A</b> para el dominio y un <b>CNAME</b> para el www).
        </li>
        <li>Espera de minutos a unas horas. Vercel pone el candado de seguridad (https) solo.</li>
      </ol>
    </section>
  );
}
