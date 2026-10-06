"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { acceptQuote, cancelImport, joinImport, requestImport, reviewBatch } from "@/server/actions/store/imports";
import { prepareProofFile } from "@/lib/image-compress";
import { field, label } from "@/components/store/account-forms";
import { cn } from "@/components/ui/styles";

const primary = "rounded-full bg-brand px-5 py-3 font-semibold text-on-brand transition hover:brightness-110 disabled:opacity-60";
const ghost = "rounded-full border-2 border-store-ink px-4 py-2 text-sm font-semibold transition hover:bg-store-ink hover:text-on-store-ink disabled:opacity-60";

function ErrorBox({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">
      {text}
    </p>
  ) : null;
}

function Terms({ disclaimer, name = "acceptTerms" }: { disclaimer: string; name?: string }) {
  return (
    <div className="rounded-2xl bg-store-soft p-4 text-sm">
      <p className="font-semibold">Importante</p>
      <p className="mt-1 text-store-muted">{disclaimer}</p>
      <label className="mt-3 flex items-start gap-2 font-semibold">
        <input type="checkbox" name={name} required className="mt-1 size-4 accent-[var(--brand)]" />
        Leí y acepto las condiciones del servicio de encargos.
      </label>
    </div>
  );
}

/** Formulario de encargo: enlace, foto, talla, color, cantidad y opción privada. */
export function ImportRequestForm({ batchId, disclaimer }: { batchId: string; disclaimer: string }) {
  const router = useRouter();
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    start(async () => {
      const photo = f.get("photo");
      if (photo instanceof File && photo.size > 0) {
        if (photo.type === "application/pdf") return setError({ text: "La foto debe ser una imagen (JPG o PNG)", field: "photo" });
        const prepared = await prepareProofFile(photo);
        if (!prepared.ok) return setError({ text: prepared.error, field: "photo" });
        f.set("photo", prepared.file);
      } else {
        f.delete("photo");
      }
      const r = await requestImport(f);
      if (!r.ok) return setError({ text: r.error, field: r.field });
      form.reset();
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="rounded-3xl bg-store-card p-6 text-center shadow-sm">
        <p className="text-4xl" aria-hidden>
          📦
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">¡Recibimos tu encargo!</h2>
        <p className="mt-2 text-sm text-store-muted">Lo revisamos y te enviamos la cotización con el precio final y el adelanto. Te avisamos por notificación.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/mi-cuenta#encargos" className={primary}>
            Ver mis encargos
          </Link>
          <button type="button" onClick={() => setDone(false)} className={ghost}>
            Encargar otro
          </button>
        </div>
      </div>
    );
  }

  const err = (name: string) => error?.field === name;
  return (
    <form onSubmit={submit} method="post" className="space-y-4 rounded-3xl bg-store-card p-5 shadow-sm sm:p-7">
      <input type="hidden" name="batchId" value={batchId} />
      <div>
        <label htmlFor="url" className={label}>
          Enlace del producto
        </label>
        <input id="url" name="url" type="url" inputMode="url" required placeholder="https://es.shein.com/…" className={cn(field, err("url") && "border-danger")} />
        <p className="mt-1 text-xs text-store-muted">Copia el enlace desde la app o la página (SHEIN, Alibaba, AliExpress, Temu, Amazon…).</p>
      </div>
      <div>
        <label htmlFor="title" className={label}>
          ¿Qué es? <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <input id="title" name="title" maxLength={120} placeholder="Vestido largo de flores" className={field} />
      </div>
      <div>
        <label htmlFor="photo" className={label}>
          Foto o captura <span className="normal-case tracking-normal">(opcional, ayuda a no equivocarnos)</span>
        </label>
        <input id="photo" name="photo" type="file" accept="image/*" className={cn(field, "file:mr-3 file:rounded-full file:border-0 file:bg-store-soft file:px-3 file:py-1", err("photo") && "border-danger")} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="size" className={label}>
            Talla
          </label>
          <input id="size" name="size" maxLength={30} placeholder="M" className={field} />
        </div>
        <div>
          <label htmlFor="color" className={label}>
            Color
          </label>
          <input id="color" name="color" maxLength={40} placeholder="Negro" className={field} />
        </div>
        <div>
          <label htmlFor="quantity" className={label}>
            Cantidad
          </label>
          <input id="quantity" name="quantity" type="number" min={1} max={20} defaultValue={1} required className={cn(field, err("quantity") && "border-danger")} />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className={label}>
          Notas <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <textarea id="notes" name="notes" rows={2} maxLength={500} placeholder="Medidas, modelo exacto, otra opción si no hay…" className={field} />
      </div>
      <label className="flex items-start gap-3 rounded-2xl border-[1.5px] border-store-line p-4 text-sm">
        <input type="checkbox" name="isPrivate" className="mt-1 size-4 accent-[var(--brand)]" />
        <span>
          <b>Producto privado / discreto</b>
          <span className="block text-store-muted">No se mostrará en la galería pública ni a otras clientas.</span>
        </span>
      </label>
      <Terms disclaimer={disclaimer} />
      <ErrorBox text={error?.text ?? null} />
      <button disabled={pending} className={cn(primary, "w-full")}>
        {pending ? "Enviando…" : "Enviar encargo"}
      </button>
      <p className="text-center text-xs text-store-muted">Los precios son estimados hasta la cotización final. Se pide un adelanto para procesar la compra.</p>
    </form>
  );
}

/** «Unirme al pedido» de un producto publicado. */
export function JoinImportButton({
  product,
  loggedIn,
  disclaimer,
}: {
  product: { id: string; title: string; sizes: string | null; colors: string | null };
  loggedIn: boolean;
  disclaimer: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const options = (s: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
  const sizes = options(product.sizes);
  const colors = options(product.colors);

  if (!loggedIn) {
    return (
      <Link href="/mi-cuenta?next=/importaciones" className={cn(primary, "block py-2.5 text-center text-sm")}>
        Unirme al pedido
      </Link>
    );
  }
  if (done) {
    return (
      <p className="rounded-xl bg-ok/15 p-3 text-center text-sm font-semibold text-ok">
        ✅ ¡Te sumaste! Verás la cotización en{" "}
        <Link href="/mi-cuenta#encargos" className="underline">
          Mis encargos
        </Link>
        .
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(primary, "w-full py-2.5 text-sm")}>
        Unirme al pedido
      </button>
    );
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await joinImport({
        productId: product.id,
        size: String(f.get("size") ?? ""),
        color: String(f.get("color") ?? ""),
        quantity: f.get("quantity"),
        notes: String(f.get("notes") ?? ""),
        acceptTerms: f.get("acceptTerms") === "on",
      });
      if (!r.ok) return setError(r.error);
      setDone(true);
      router.refresh();
    });
  }

  const pick = (name: string, title: string, list: string[]) =>
    list.length ? (
      <div>
        <label className={label} htmlFor={`${name}-${product.id}`}>
          {title}
        </label>
        <select id={`${name}-${product.id}`} name={name} required className={field}>
          {list.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
    ) : (
      <div>
        <label className={label} htmlFor={`${name}-${product.id}`}>
          {title}
        </label>
        <input id={`${name}-${product.id}`} name={name} maxLength={40} className={field} />
      </div>
    );

  return (
    <form onSubmit={submit} method="post" className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {pick("size", "Talla", sizes)}
        {pick("color", "Color", colors)}
        <div>
          <label className={label} htmlFor={`quantity-${product.id}`}>
            Cant.
          </label>
          <input id={`quantity-${product.id}`} name="quantity" type="number" min={1} max={20} defaultValue={1} className={field} />
        </div>
      </div>
      <input name="notes" maxLength={300} placeholder="Nota (opcional)" aria-label="Nota" className={field} />
      <Terms disclaimer={disclaimer} />
      <ErrorBox text={error} />
      <div className="flex gap-2">
        <button disabled={pending} className={cn(primary, "flex-1 py-2.5 text-sm")}>
          {pending ? "Enviando…" : "Confirmar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ghost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Aceptar la cotización (crea el pedido y lleva a pagar el adelanto) o cancelar el encargo. */
export function QuoteActions({ requestId, canAccept }: { requestId: string; canAccept: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accept = () =>
    start(async () => {
      setError(null);
      const r = await acceptQuote(requestId);
      if (!r.ok) return setError(r.error);
      router.push(`/pedido/${r.trackingToken}`);
    });
  const cancel = () => {
    if (!confirm("¿Cancelar este encargo?")) return;
    start(async () => {
      setError(null);
      const r = await cancelImport(requestId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <button type="button" disabled={pending} onClick={accept} className={cn(primary, "py-2.5 text-sm")}>
            {pending ? "Un momento…" : "Aceptar y pagar el adelanto"}
          </button>
        ) : null}
        <button type="button" disabled={pending} onClick={cancel} className={ghost}>
          {canAccept ? "No, gracias" : "Cancelar encargo"}
        </button>
      </div>
      <ErrorBox text={error} />
    </div>
  );
}

/** Reseña verificada de un lote recibido. */
export function BatchReviewForm({ batchId, batchName }: { batchId: string; batchName: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <p className="rounded-xl bg-ok/15 p-3 text-sm font-semibold text-ok">¡Gracias por tu opinión! La publicaremos después de revisarla.</p>;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await reviewBatch({ batchId, rating, body: String(f.get("body") ?? "") });
      if (!r.ok) return setError(r.error);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} method="post" className="space-y-2 rounded-2xl border-[1.5px] border-store-line p-4">
      <p className="text-sm font-semibold">¿Cómo te fue con el lote «{batchName}»?</p>
      <div role="radiogroup" aria-label="Estrellas" className="flex gap-1 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={n <= rating ? "text-amber-500" : "text-store-line"}
          >
            ★
          </button>
        ))}
      </div>
      <textarea name="body" rows={3} required minLength={10} maxLength={600} placeholder="Calidad, tiempos, atención…" aria-label="Tu opinión" className={field} />
      <ErrorBox text={error} />
      <button disabled={pending} className={cn(primary, "py-2.5 text-sm")}>
        {pending ? "Enviando…" : "Enviar opinión"}
      </button>
    </form>
  );
}
