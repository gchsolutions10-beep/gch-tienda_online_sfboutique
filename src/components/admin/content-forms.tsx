"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { deleteBlogCategory, deleteHomeItem, moveHomeItem, saveBanner, saveBlogCategory, saveHeroCard, uploadHomeImage } from "@/server/actions/admin/content";
import { prepareMediaFile } from "@/lib/image-compress";
import { buttonGhost, buttonPrimary, buttonSecondary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

type Result = { ok: true } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.();
      router.refresh();
    });
  return { pending, error, setError, run, start, router };
}

const Error_ = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-medium text-danger">
      {text}
    </p>
  ) : null;

// ───────────────────────────── Categorías del blog ─────────────────────────────

export function BlogCategories({ categories }: { categories: { id: string; name: string; posts: number }[] }) {
  const { pending, error, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className={cn(card, "space-y-3 p-5")}>
      <h2 className="font-bold">Categorías</h2>
      <ul className="space-y-1.5">
        {categories.map((c) =>
          editing === c.id ? (
            <li key={c.id}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = String(new FormData(e.currentTarget).get("name") ?? "");
                  run(() => saveBlogCategory({ id: c.id, name }), () => setEditing(null));
                }}
                method="post"
                className="flex gap-1.5"
              >
                <input name="name" defaultValue={c.name} autoFocus aria-label="Nombre de la categoría" className={inputClass} />
                <button disabled={pending} className={buttonSecondary}>OK</button>
              </form>
            </li>
          ) : (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {c.name} <span className="text-xs text-muted">· {c.posts}</span>
              </span>
              <button type="button" onClick={() => setEditing(c.id)} className={buttonGhost}>Renombrar</button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Borrar la categoría «${c.name}»? Sus artículos quedan sin categoría.`)) run(() => deleteBlogCategory(c.id));
                }}
                className={cn(buttonGhost, "hover:text-danger")}
                aria-label={`Borrar ${c.name}`}
              >
                ✕
              </button>
            </li>
          ),
        )}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = String(new FormData(form).get("name") ?? "");
          run(() => saveBlogCategory({ id: null, name }), () => form.reset());
        }}
        method="post"
        className="flex gap-1.5"
      >
        <input name="name" placeholder="Nueva categoría" aria-label="Nueva categoría" className={inputClass} />
        <button disabled={pending} className={buttonSecondary}>Agregar</button>
      </form>
      <Error_ text={error} />
    </section>
  );
}

// ───────────────────────────── Portada ─────────────────────────────

function ImageButton({ kind, id, label, onError }: { kind: "portada" | "banner"; id: string; label: string; onError: (e: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn(buttonSecondary, "cursor-pointer px-3 py-1.5 text-xs", pending && "opacity-60")}>
      {pending ? "Subiendo…" : label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          start(async () => {
            const prepared = await prepareMediaFile(file, kind);
            if (!prepared.ok) return onError(prepared.error);
            const form = new FormData();
            form.set("kind", kind);
            form.set("id", id);
            form.set("file", prepared.file);
            const r = await uploadHomeImage(form);
            if (!r.ok) onError(r.error);
            router.refresh();
          });
        }}
      />
    </label>
  );
}

export type HeroValues = { id: string; title: string; subtitle: string; linkUrl: string; imageUrl: string | null; isActive: boolean };

/** Tarjetas verticales grandes del inicio (Moda Mujer, Calzado…). */
export function HeroCards({ cards }: { cards: HeroValues[] }) {
  const { pending, error, setError, run } = useRun();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function submit(e: FormEvent<HTMLFormElement>, id: string | null) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () =>
        saveHeroCard({
          id,
          title: String(f.get("title") ?? ""),
          subtitle: String(f.get("subtitle") ?? ""),
          linkUrl: String(f.get("linkUrl") ?? ""),
          isActive: f.get("isActive") === "on",
        }),
      () => setEditing(null),
    );
  }

  const form = (c: HeroValues | null) => (
    <form onSubmit={(e) => submit(e, c?.id ?? null)} method="post" className="space-y-2 rounded-xl bg-cream p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`h-title-${c?.id ?? "new"}`}>Título</label>
          <input id={`h-title-${c?.id ?? "new"}`} name="title" required defaultValue={c?.title} placeholder="Moda Mujer" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`h-sub-${c?.id ?? "new"}`}>Texto pequeño</label>
          <input id={`h-sub-${c?.id ?? "new"}`} name="subtitle" defaultValue={c?.subtitle} placeholder="Vestidos, blusas y jeans" className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor={`h-link-${c?.id ?? "new"}`}>Lleva a</label>
        <input id={`h-link-${c?.id ?? "new"}`} name="linkUrl" required defaultValue={c?.linkUrl ?? "/catalogo"} placeholder="/catalogo?categoria=vestidos" className={inputClass} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} className="size-4" /> Visible en la portada
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className={buttonPrimary}>Guardar</button>
        <button type="button" onClick={() => setEditing(null)} className={buttonSecondary}>Cancelar</button>
      </div>
    </form>
  );

  return (
    <section className={cn(card, "space-y-3 p-5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Tarjetas de la portada</h2>
          <p className="text-sm text-muted">Hasta 4 fotos verticales grandes al abrir la tienda (ideal 1200 × 1600).</p>
        </div>
        {editing === null ? <button type="button" onClick={() => setEditing("new")} className={buttonSecondary}>+ Nueva tarjeta</button> : null}
      </div>
      {editing === "new" ? form(null) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <li key={c.id} className={cn("overflow-hidden rounded-xl border border-line", !c.isActive && "opacity-60")}>
            {editing === c.id ? (
              form(c)
            ) : (
              <>
                <div className="relative aspect-[3/4] bg-cream">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa
                    <img src={c.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-sm text-muted">Sin foto</span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                    {c.subtitle ? <p className="text-[10px] uppercase tracking-widest">{c.subtitle}</p> : null}
                    <p className="font-display text-lg font-semibold">{c.title}</p>
                  </div>
                </div>
                <div className="space-y-2 p-2.5">
                  <p className="truncate text-xs text-muted">→ {c.linkUrl}{c.isActive ? "" : " · oculta"}</p>
                  <div className="flex flex-wrap gap-1">
                    <ImageButton kind="portada" id={c.id} label={c.imageUrl ? "Cambiar foto" : "Subir foto"} onError={setError} />
                    <button type="button" onClick={() => setEditing(c.id)} className={buttonGhost}>Editar</button>
                    <button type="button" disabled={i === 0} onClick={() => run(() => moveHomeItem("hero", c.id, -1))} className={buttonGhost} aria-label="Mover a la izquierda">←</button>
                    <button type="button" disabled={i === cards.length - 1} onClick={() => run(() => moveHomeItem("hero", c.id, 1))} className={buttonGhost} aria-label="Mover a la derecha">→</button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`¿Borrar la tarjeta «${c.title}»?`) && run(() => deleteHomeItem("hero", c.id))}
                      className={cn(buttonGhost, "hover:text-danger")}
                      aria-label={`Borrar ${c.title}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <Error_ text={error} />
    </section>
  );
}

export type BannerValues = { id: string; title: string; linkUrl: string; imageUrl: string; startsAt: string; endsAt: string; isActive: boolean; state: "live" | "upcoming" | "ended" | "off" };

/** "2026-10-05" → "05/10/2026" */
const dmy = (iso: string) => iso.split("-").reverse().join("/");

const BANNER_STATE: Record<BannerValues["state"], [string, string]> = {
  live: ["Se ve hoy", "bg-emerald-100 text-emerald-900"],
  upcoming: ["Programado", "bg-amber-100 text-amber-900"],
  ended: ["Terminó", "bg-cream text-muted"],
  off: ["Oculto", "bg-cream text-muted"],
};

/** Banners de promociones con fecha de inicio y fin. */
export function Banners({ banners, today }: { banners: BannerValues[]; today: string }) {
  const { pending, error, setError, run, start, router } = useRun();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function submit(e: FormEvent<HTMLFormElement>, b: BannerValues | null) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    start(async () => {
      setError(null);
      const r = await saveBanner({
        id: b?.id ?? null,
        title: String(f.get("title") ?? ""),
        linkUrl: String(f.get("linkUrl") ?? ""),
        startsAt: String(f.get("startsAt") ?? ""),
        endsAt: String(f.get("endsAt") ?? ""),
        isActive: b ? f.get("isActive") === "on" : true,
      });
      if (!r.ok) return setError(r.error);
      // Banner nuevo: la imagen va en el mismo paso.
      if (file instanceof File && file.size > 0) {
        const prepared = await prepareMediaFile(file, "banner");
        if (!prepared.ok) return setError(prepared.error);
        const form = new FormData();
        form.set("kind", "banner");
        form.set("id", r.id);
        form.set("file", prepared.file);
        const up = await uploadHomeImage(form);
        if (!up.ok) setError(up.error);
      }
      setEditing(null);
      router.refresh();
    });
  }

  const form = (b: BannerValues | null) => (
    <form onSubmit={(e) => submit(e, b)} method="post" className="space-y-2 rounded-xl bg-cream p-3">
      <div>
        <label className={labelClass} htmlFor={`b-title-${b?.id ?? "new"}`}>Título (describe la imagen)</label>
        <input id={`b-title-${b?.id ?? "new"}`} name="title" required defaultValue={b?.title} placeholder="20 % en toda la colección de verano" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor={`b-link-${b?.id ?? "new"}`}>Lleva a (opcional)</label>
        <input id={`b-link-${b?.id ?? "new"}`} name="linkUrl" defaultValue={b?.linkUrl} placeholder="/catalogo?orden=ofertas" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor={`b-from-${b?.id ?? "new"}`}>Desde</label>
          <input id={`b-from-${b?.id ?? "new"}`} name="startsAt" type="date" required defaultValue={b?.startsAt ?? today} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`b-to-${b?.id ?? "new"}`}>Hasta</label>
          <input id={`b-to-${b?.id ?? "new"}`} name="endsAt" type="date" required defaultValue={b?.endsAt} className={inputClass} />
        </div>
      </div>
      {b ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={b.isActive} className="size-4" /> Activo
        </label>
      ) : (
        <div>
          <label className={labelClass} htmlFor="b-file">Imagen horizontal (ideal 1920 × 600)</label>
          <input id="b-file" name="file" type="file" required accept="image/jpeg,image/png,image/webp" className="text-sm" />
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={pending} className={buttonPrimary}>{pending ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={() => setEditing(null)} className={buttonSecondary}>Cancelar</button>
      </div>
    </form>
  );

  return (
    <section className={cn(card, "space-y-3 p-5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Banners de promociones</h2>
          <p className="text-sm text-muted">Franja de promociones del inicio. Cada uno sale solo entre sus fechas: deja listos los del mes que viene.</p>
        </div>
        {editing === null ? <button type="button" onClick={() => setEditing("new")} className={buttonSecondary}>+ Nuevo banner</button> : null}
      </div>
      {editing === "new" ? form(null) : null}
      {banners.length === 0 && editing !== "new" ? <p className="rounded-xl bg-cream p-6 text-center text-sm text-muted">Todavía no hay banners.</p> : null}
      <ul className="space-y-3">
        {banners.map((b, i) => (
          <li key={b.id} className="overflow-hidden rounded-xl border border-line">
            {editing === b.id ? (
              form(b)
            ) : (
              <div className="grid gap-3 sm:grid-cols-[16rem_minmax(0,1fr)]">
                <div className="aspect-[16/5] bg-cream">
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa
                    <img src={b.imageUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="space-y-1.5 p-2.5 sm:pl-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{b.title}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", BANNER_STATE[b.state][1])}>{BANNER_STATE[b.state][0]}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {dmy(b.startsAt)} → {dmy(b.endsAt)}
                    {b.linkUrl ? ` · lleva a ${b.linkUrl}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <ImageButton kind="banner" id={b.id} label="Cambiar imagen" onError={setError} />
                    <button type="button" onClick={() => setEditing(b.id)} className={buttonGhost}>Editar</button>
                    <button type="button" disabled={i === 0} onClick={() => run(() => moveHomeItem("banner", b.id, -1))} className={buttonGhost} aria-label="Subir">↑</button>
                    <button type="button" disabled={i === banners.length - 1} onClick={() => run(() => moveHomeItem("banner", b.id, 1))} className={buttonGhost} aria-label="Bajar">↓</button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`¿Borrar el banner «${b.title}»?`) && run(() => deleteHomeItem("banner", b.id))}
                      className={cn(buttonGhost, "hover:text-danger")}
                      aria-label={`Borrar ${b.title}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Error_ text={error} />
    </section>
  );
}
