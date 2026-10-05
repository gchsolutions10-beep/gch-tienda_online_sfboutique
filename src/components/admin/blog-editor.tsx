"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { deletePost, removePostCover, savePost, searchProductsForPost, uploadPostImage } from "@/server/actions/admin/content";
import { Markdown } from "@/components/markdown";
import { prepareMediaFile } from "@/lib/image-compress";
import { autoExcerpt, readingMinutes, SEO_LIMITS } from "@/lib/blog";
import { slugify } from "@/lib/slug";
import { buttonGhost, buttonPrimary, buttonSecondary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

export type PostValues = {
  id: string | null;
  title: string;
  slug: string;
  categoryId: string;
  excerpt: string;
  content: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string | null;
  publish: "draft" | "now" | "schedule";
  publishAt: string;
  /** Publicado en la tienda ahora mismo (para "Ver en la tienda") */
  live: boolean;
  products: { productId: string; name: string; imageUrl: string | null; note: string }[];
};

type Found = Awaited<ReturnType<typeof searchProductsForPost>>[number];

export function BlogEditor({ values, categories, storeHost }: { values: PostValues; categories: { id: string; name: string }[]; storeHost: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(values.title);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.id));
  const [content, setContent] = useState(values.content);
  const [excerpt, setExcerpt] = useState(values.excerpt);
  const [seoTitle, setSeoTitle] = useState(values.seoTitle);
  const [seoDescription, setSeoDescription] = useState(values.seoDescription);
  const [publish, setPublish] = useState(values.publish);
  const [products, setProducts] = useState(values.products);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const shownSlug = slugTouched ? slug : slugify(title);
  const googleTitle = seoTitle || title || "Título del artículo";
  const googleDescription = seoDescription || excerpt || autoExcerpt(content) || "Resumen del artículo…";

  /** Envuelve la selección (o inserta) en el área de texto. */
  function wrap(before: string, after = "", placeholder = "") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const selected = content.slice(a, b) || placeholder;
    const next = content.slice(0, a) + before + selected + after + content.slice(b);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + selected.length);
    });
  }
  /** Inserta un bloque en su propio párrafo. */
  function block(text: string) {
    const el = area.current;
    const at = el ? el.selectionStart : content.length;
    const head = content.slice(0, at).replace(/\s*$/, "");
    const tail = content.slice(at).replace(/^\s*/, "");
    setContent(`${head}${head ? "\n\n" : ""}${text}${tail ? `\n\n${tail}` : ""}`);
  }

  function uploadInline(file: File | undefined) {
    if (!file || !values.id) return;
    setMessage(null);
    start(async () => {
      const prepared = await prepareMediaFile(file, "blog");
      if (!prepared.ok) return setMessage({ ok: false, text: prepared.error });
      const form = new FormData();
      form.set("postId", values.id!);
      form.set("kind", "inline");
      form.set("file", prepared.file);
      const r = await uploadPostImage(form);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      const alt = (window.prompt("Describe la foto (la leen los lectores de pantalla y Google):", "") ?? "").replace(/[[\]]/g, "").trim();
      block(`![${alt}](${r.url})`);
    });
  }

  function uploadCover(file: File | undefined) {
    if (!file || !values.id) return;
    setMessage(null);
    start(async () => {
      const prepared = await prepareMediaFile(file, "blog");
      if (!prepared.ok) return setMessage({ ok: false, text: prepared.error });
      const form = new FormData();
      form.set("postId", values.id!);
      form.set("kind", "cover");
      form.set("file", prepared.file);
      const r = await uploadPostImage(form);
      setMessage(r.ok ? { ok: true, text: "✓ Portada actualizada" } : { ok: false, text: r.error });
      router.refresh();
    });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMessage(null);
    start(async () => {
      const r = await savePost({
        id: values.id,
        title,
        slug: shownSlug,
        categoryId: String(f.get("categoryId") ?? ""),
        excerpt,
        content,
        tags: String(f.get("tags") ?? ""),
        seoTitle,
        seoDescription,
        publish,
        publishAt: String(f.get("publishAt") ?? ""),
        products: products.map((p) => ({ productId: p.productId, note: p.note })),
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setSlug(r.slug);
      setSlugTouched(true);
      setMessage({ ok: true, text: publish === "draft" ? "✓ Borrador guardado" : publish === "schedule" ? "✓ Artículo programado" : "✓ Artículo publicado" });
      if (!values.id) router.replace(`/admin/blog/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} method="post" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <section className={cn(card, "space-y-3 p-5")}>
          <div>
            <label className={labelClass} htmlFor="title">Título</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={140} className={cn(inputClass, "font-display text-xl")} />
          </div>
          <div>
            <label className={labelClass} htmlFor="slug">Dirección del artículo</label>
            <div className="flex items-center gap-1 text-sm">
              <span className="shrink-0 text-muted">{storeHost}/blog/</span>
              <input
                id="slug"
                value={shownSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className={cn(card, "p-5")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Editor" className="flex gap-1 xl:hidden">
              {(["write", "preview"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-full px-3 py-1 text-sm font-semibold", tab === t ? "bg-ink text-white" : "bg-cream")}>
                  {t === "write" ? "Escribir" : "Vista previa"}
                </button>
              ))}
            </div>
            <div role="toolbar" aria-label="Formato" className="flex flex-wrap gap-1">
              <button type="button" onClick={() => block("## Subtítulo")} className={buttonGhost} title="Subtítulo">Título</button>
              <button type="button" onClick={() => wrap("**", "**", "texto")} className={cn(buttonGhost, "font-black")} title="Negrita">N</button>
              <button type="button" onClick={() => wrap("*", "*", "texto")} className={cn(buttonGhost, "italic")} title="Cursiva">K</button>
              <button type="button" onClick={() => block("- Primer punto\n- Segundo punto")} className={buttonGhost}>• Lista</button>
              <button type="button" onClick={() => wrap("[", "](/catalogo)", "texto del enlace")} className={buttonGhost}>🔗 Enlace</button>
              <button type="button" onClick={() => block("> Una frase destacada")} className={buttonGhost}>❝ Cita</button>
              <label className={cn(buttonGhost, "cursor-pointer", !values.id && "pointer-events-none opacity-40")} title={values.id ? "Subir una foto al artículo" : "Guarda el artículo primero"}>
                📷 Foto
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!values.id || pending} onChange={(e) => uploadInline(e.target.files?.[0])} />
              </label>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={cn(tab === "preview" && "hidden xl:block")}>
              <label htmlFor="content" className="sr-only">Contenido</label>
              <textarea
                id="content"
                ref={area}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={22}
                placeholder={"Escribe aquí. Deja una línea en blanco entre párrafos.\n\n## Así se pone un subtítulo\n\n**negrita**, *cursiva*, [enlace](/catalogo)"}
                className={cn(inputClass, "font-mono text-[13px] leading-relaxed")}
              />
              <p className="mt-1 text-xs text-muted">{readingMinutes(content)} min de lectura · {content.trim() ? content.trim().split(/\s+/).length : 0} palabras</p>
            </div>
            <div className={cn("max-h-[38rem] overflow-y-auto rounded-xl border border-line bg-white p-4", tab === "write" && "hidden xl:block")} aria-label="Vista previa">
              {content.trim() ? <Markdown source={content} /> : <p className="text-sm text-muted">La vista previa aparece aquí.</p>}
            </div>
          </div>
        </section>

        <section className={cn(card, "space-y-3 p-5")}>
          <h2 className="font-bold">Consigue este look</h2>
          <p className="text-sm text-muted">Prendas que salen al final del artículo con su precio y botón de compra.</p>
          <ProductPicker
            onPick={(p) => setProducts((list) => (list.some((x) => x.productId === p.id) || list.length >= 12 ? list : [...list, { productId: p.id, name: p.name, imageUrl: p.images[0]?.url ?? null, note: "" }]))}
          />
          {products.length ? (
            <ul className="divide-y divide-line">
              {products.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 py-2">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura
                    <img src={p.imageUrl} alt="" className="h-12 w-9 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <input
                      value={p.note}
                      onChange={(e) => setProducts((list) => list.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                      placeholder="Nota opcional (ej. en talla S)"
                      aria-label={`Nota para ${p.name}`}
                      maxLength={120}
                      className={cn(inputClass, "mt-1 py-1 text-xs")}
                    />
                  </div>
                  <button type="button" onClick={() => setProducts((list) => list.filter((_, j) => j !== i))} className={cn(buttonGhost, "hover:text-danger")} aria-label={`Quitar ${p.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <div className="space-y-4">
        <section className={cn(card, "space-y-3 p-5")}>
          <h2 className="font-bold">Publicación</h2>
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Estado</legend>
            {(
              [
                ["draft", "Borrador", "Solo lo ve el equipo"],
                ["now", values.live ? "Publicado" : "Publicar ahora", "Sale en la tienda"],
                ["schedule", "Programar", "Sale solo en la fecha elegida"],
              ] as const
            ).map(([key, label, help]) => (
              <label key={key} className={cn("flex gap-2 rounded-lg border p-2.5 text-sm", publish === key ? "border-brand bg-brand-soft" : "border-line")}>
                <input type="radio" name="publish" checked={publish === key} onChange={() => setPublish(key)} className="mt-0.5" />
                <span>
                  <b>{label}</b>
                  <span className="block text-xs text-muted">{help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {publish === "schedule" ? (
            <div>
              <label className={labelClass} htmlFor="publishAt">Fecha y hora (Venezuela)</label>
              <input id="publishAt" name="publishAt" type="datetime-local" required defaultValue={values.publishAt} className={inputClass} />
            </div>
          ) : null}
          {message ? (
            <p role={message.ok ? "status" : "alert"} className={cn("rounded-lg p-2 text-sm font-medium", message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-danger")}>
              {message.text}
            </p>
          ) : null}
          <button disabled={pending} className={cn(buttonPrimary, "w-full py-3")}>
            {pending ? "Guardando…" : publish === "draft" ? "Guardar borrador" : publish === "schedule" ? "Programar" : values.live ? "Guardar cambios" : "Publicar"}
          </button>
          {values.live ? (
            <Link href={`/blog/${values.slug}`} target="_blank" className="block text-center text-sm font-semibold text-brand-strong underline">
              Ver en la tienda ↗
            </Link>
          ) : null}
        </section>

        <section className={cn(card, "space-y-3 p-5")}>
          <h2 className="font-bold">Portada del artículo</h2>
          {values.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- portada
            <img src={values.coverImageUrl} alt="" className="aspect-[16/10] w-full rounded-xl object-cover" />
          ) : (
            <p className="rounded-xl bg-cream p-4 text-center text-sm text-muted">{values.id ? "Sin portada. Ideal: horizontal, 1600 × 1000." : "Guarda el artículo para subir la portada."}</p>
          )}
          {values.id ? (
            <div className="flex flex-wrap gap-2">
              <label className={cn(buttonSecondary, "cursor-pointer")}>
                {values.coverImageUrl ? "Cambiar" : "Subir portada"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pending} onChange={(e) => uploadCover(e.target.files?.[0])} />
              </label>
              {values.coverImageUrl ? (
                <button type="button" onClick={() => start(async () => { await removePostCover(values.id!); router.refresh(); })} className={buttonGhost}>
                  Quitar
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className={cn(card, "space-y-3 p-5")}>
          <div>
            <label className={labelClass} htmlFor="categoryId">Categoría</label>
            <select id="categoryId" name="categoryId" defaultValue={values.categoryId} className={inputClass}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="tags">Etiquetas (separadas por coma)</label>
            <input id="tags" name="tags" defaultValue={values.tags} placeholder="jeans, outfits, tendencias" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="excerpt">Resumen (sale en la lista del blog)</label>
            <textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} maxLength={300} placeholder={autoExcerpt(content) || "Si lo dejas vacío, se toma el primer párrafo."} className={inputClass} />
          </div>
        </section>

        <section className={cn(card, "space-y-3 p-5")}>
          <h2 className="font-bold">Google (SEO)</h2>
          <div className="rounded-xl border border-line bg-white p-3" aria-label="Así se vería en Google">
            <p className="truncate text-xs text-emerald-800">{storeHost}/blog/{shownSlug || "…"}</p>
            <p className="truncate text-base text-blue-800">{googleTitle}</p>
            <p className="line-clamp-2 text-xs text-slate-600">{googleDescription}</p>
          </div>
          <Counter label="Título para Google" id="seoTitle" value={seoTitle} onChange={setSeoTitle} limit={SEO_LIMITS.title} placeholder={title} />
          <Counter label="Descripción para Google" id="seoDescription" value={seoDescription} onChange={setSeoDescription} limit={SEO_LIMITS.description} placeholder={excerpt || autoExcerpt(content)} multiline />
        </section>

        {values.id ? (
          confirmDelete ? (
            <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm">
              <p className="text-red-900">¿Borrar el artículo y sus fotos? No se puede deshacer.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deletePost(values.id!);
                      if (!r.ok) return setMessage({ ok: false, text: r.error });
                      router.replace("/admin/blog");
                    })
                  }
                  className={cn(buttonPrimary, "flex-1 bg-danger text-white")}
                >
                  Sí, borrar
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={buttonSecondary}>No</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-sm font-semibold text-muted hover:text-danger">
              Borrar artículo
            </button>
          )
        ) : null}
      </div>
    </form>
  );
}

function Counter({ label, id, value, onChange, limit, placeholder, multiline }: { label: string; id: string; value: string; onChange: (v: string) => void; limit: number; placeholder?: string; multiline?: boolean }) {
  const over = value.length > limit;
  return (
    <div>
      <div className="flex justify-between">
        <label className={labelClass} htmlFor={id}>{label}</label>
        <span className={cn("text-xs", over ? "font-semibold text-danger" : "text-muted")}>
          {value.length}/{limit}
        </span>
      </div>
      {multiline ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={300} placeholder={placeholder} className={inputClass} />
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={120} placeholder={placeholder} className={inputClass} />
      )}
      {over ? <p className="mt-1 text-xs text-danger">Google lo corta: mejor más corto.</p> : null}
    </div>
  );
}

function ProductPicker({ onPick }: { onPick: (p: Found) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => searchProductsForPost(term).then(setResults), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setResults([]);
        }}
        placeholder="Buscar prenda por nombre o SKU…"
        aria-label="Buscar prenda"
        className={inputClass}
      />
      {results.length ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line bg-paper shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setQ("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-cream"
              >
                {p.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={p.images[0].url} alt="" className="h-10 w-8 rounded object-cover" />
                ) : null}
                <span className="flex-1 font-semibold">{p.name}</span>
                {!p.isActive ? <span className="text-xs text-muted">(oculto)</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
