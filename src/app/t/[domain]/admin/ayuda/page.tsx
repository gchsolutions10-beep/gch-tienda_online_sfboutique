import type { ReactNode } from "react";
import { getTenant } from "@/server/tenant";
import { isTenantAdmin, requireAdmin } from "@/server/auth/guards";
import { PageHeader } from "@/components/admin/page-header";
import { ContentManual, CreditManual, CustomerManual, MANUAL_SECTIONS, OwnerManual, StoreManual, type ManualSectionId } from "@/components/help/manual";
import { TestScript } from "@/components/help/test-script";
import { card, cn } from "@/components/ui/styles";

export const metadata = { title: "Ayuda" };

const CONTENT: Record<ManualSectionId, () => ReactNode> = {
  duena: OwnerManual,
  tienda: StoreManual,
  credito: CreditManual,
  contenido: ContentManual,
  clienta: CustomerManual,
  prueba: TestScript,
};

/** Manual de uso: cada quien ve lo que le toca según su rol. */
export default async function HelpPage({ params }: PageProps<"/t/[domain]/admin/ayuda">) {
  const tenant = await getTenant((await params).domain);
  const ctx = await requireAdmin(tenant, "/admin/ayuda");
  const owner = isTenantAdmin(ctx);
  const sells = ctx.roles.some((r) => r === "BRANCH_ADMIN" || r === "SELLER");
  const content = ctx.roles.includes("EDITOR");

  const visible: ManualSectionId[] = owner
    ? ["duena", "tienda", "credito", "contenido", "clienta", "prueba"]
    : [...(sells ? (["tienda"] as const) : []), ...(ctx.roles.includes("BRANCH_ADMIN") ? (["credito"] as const) : []), ...(content ? (["contenido"] as const) : []), "clienta"];
  const sections = visible.map((id) => MANUAL_SECTIONS.find((s) => s.id === id)!);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Ayuda y guion de prueba" description={`Paso a paso para usar el sistema de ${tenant.name} según tu trabajo.`} />

      <nav aria-label="Secciones del manual" className="no-scrollbar sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-cream/95 px-4 py-2 backdrop-blur sm:flex-wrap">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-semibold hover:border-ink/30">
            {s.icon} {s.title}
          </a>
        ))}
      </nav>

      <div className="mt-4 space-y-6">
        {sections.map((s) => {
          const Content = CONTENT[s.id];
          return (
            <section key={s.id} id={s.id} className={cn(card, "scroll-mt-16 p-5 leading-relaxed")} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`} className="font-display text-xl font-extrabold">
                {s.icon} {s.title}
              </h2>
              {s.id === "prueba" ? (
                <p className="mb-4 mt-1 text-sm text-muted">
                  Recorre el sistema completo como lo usarían la dueña, la vendedora, la clienta y quien publica el contenido. Marca cada prueba al terminarla;
                  se guarda en este navegador.
                </p>
              ) : null}
              <div className="mt-2 text-sm">
                <Content />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
