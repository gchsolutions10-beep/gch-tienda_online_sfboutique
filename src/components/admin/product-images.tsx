"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteProductImage, moveProductImage, updateProductImage, uploadProductImage } from "@/server/actions/admin/products";
import { prepareMediaFile } from "@/lib/image-compress";
import { buttonGhost, buttonPrimary, card, cn, inputBase } from "@/components/ui/styles";

type Image = { id: string; url: string; alt: string | null; colorId: string | null };
type Color = { id: string; name: string; hex: string };

/**
 * Fotos verticales (3:4). La primera es la principal y la segunda se ve al
 * pasar el mouse. Si una foto tiene color, se muestra al elegir ese color.
 */
export function ProductImages({ productId, images, colors }: { productId: string; images: Image[]; colors: Color[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [colorId, setColorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    start(async () => {
      const list = [...files].slice(0, 12);
      for (const [i, file] of list.entries()) {
        setProgress(`Subiendo ${i + 1} de ${list.length}…`);
        const prepared = await prepareMediaFile(file, "producto");
        if (!prepared.ok) {
          setError(prepared.error);
          break;
        }
        const form = new FormData();
        form.set("productId", productId);
        form.set("colorId", colorId);
        form.set("file", prepared.file);
        const r = await uploadProductImage(form);
        if (!r.ok) {
          setError(r.error);
          break;
        }
      }
      setProgress(null);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo");
      router.refresh();
    });

  return (
    <section className={cn(card, "space-y-4 p-5")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Fotos</h2>
          <p className="text-sm text-muted">Verticales (3:4), con buena luz. La 1.ª es la principal; la 2.ª aparece al pasar el mouse.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {colors.length ? (
            <select value={colorId} onChange={(e) => setColorId(e.target.value)} aria-label="Color de las fotos nuevas" className={cn(inputBase, "w-40")}>
              <option value="">Sin color</option>
              {colors.map((c) => <option key={c.id} value={c.id}>Color: {c.name}</option>)}
            </select>
          ) : null}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className={buttonPrimary}>
            {progress ?? "+ Subir fotos"}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

      {images.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-line p-8 text-center text-sm text-muted">Aún no hay fotos. Sin fotos, el producto se ve vacío en la tienda.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((img, i) => (
            <li key={img.id} className="rounded-xl border border-line p-2">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-cream">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto del producto */}
                <img src={img.url} alt={img.alt ?? ""} className="size-full object-cover" />
                {i < 2 ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold text-white">{i === 0 ? "Principal" : "Hover"}</span>
                ) : null}
              </div>
              <select
                value={img.colorId ?? ""}
                onChange={(e) => act(() => updateProductImage(img.id, { colorId: e.target.value || null, alt: img.alt ?? "" }))}
                aria-label="Color de la foto"
                className={cn(inputBase, "mt-2 w-full py-1 text-xs")}
              >
                <option value="">Todos los colores</option>
                {colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="mt-1 flex justify-between">
                <button type="button" disabled={pending || i === 0} onClick={() => act(() => moveProductImage(img.id, -1))} aria-label="Mover a la izquierda" className={buttonGhost}>←</button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => confirm("¿Borrar esta foto?") && act(() => deleteProductImage(img.id))}
                  className={cn(buttonGhost, "hover:text-danger")}
                >
                  Borrar
                </button>
                <button type="button" disabled={pending || i === images.length - 1} onClick={() => act(() => moveProductImage(img.id, 1))} aria-label="Mover a la derecha" className={buttonGhost}>→</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
