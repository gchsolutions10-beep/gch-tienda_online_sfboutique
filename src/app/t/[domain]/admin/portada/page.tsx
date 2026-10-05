import Link from "next/link";
import { getTenant } from "@/server/tenant";
import { CONTENT_ROLES, requireStaff } from "@/server/auth/guards";
import { tenantDb } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Banners, HeroCards } from "@/components/admin/content-forms";
import { buttonSecondary } from "@/components/ui/styles";
import { bannerLive, toCaracasInput } from "@/lib/blog";

export const metadata = { title: "Portada y banners" };

export default async function HomeAdminPage({ params }: PageProps<"/t/[domain]/admin/portada">) {
  const tenant = await getTenant((await params).domain);
  await requireStaff(tenant, CONTENT_ROLES, "/admin/portada");
  const tdb = tenantDb(tenant.id);
  const [cards, banners] = await Promise.all([
    tdb.heroCard.findMany({ orderBy: { sortOrder: "asc" } }),
    tdb.promoBanner.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const now = new Date();
  const day = (d: Date) => toCaracasInput(d).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Portada y banners"
        description="Lo primero que ve la clienta al abrir la tienda."
        actions={<Link href="/" target="_blank" className={buttonSecondary}>Ver la tienda ↗</Link>}
      />
      <div className="space-y-6">
        <HeroCards cards={cards.map((c) => ({ id: c.id, title: c.title, subtitle: c.subtitle ?? "", linkUrl: c.linkUrl, imageUrl: c.imageUrl, isActive: c.isActive }))} />
        <Banners
          today={day(now)}
          banners={banners.map((b) => ({
            id: b.id,
            title: b.title,
            linkUrl: b.linkUrl ?? "",
            imageUrl: b.imageUrl,
            startsAt: day(b.startsAt),
            endsAt: day(b.endsAt),
            isActive: b.isActive,
            state: !b.isActive || !b.imageUrl ? "off" : bannerLive(b, now) ? "live" : b.startsAt > now ? "upcoming" : "ended",
          }))}
        />
      </div>
    </>
  );
}
