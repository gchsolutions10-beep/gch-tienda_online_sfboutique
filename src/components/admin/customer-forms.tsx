"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addInteraction, createTag, saveCustomer, toggleCustomerTag } from "@/server/actions/admin/crm";
import { INTERACTION, SOURCE_LABEL } from "@/lib/crm";
import { buttonGhost, buttonPrimary, buttonSecondary, card, cn, inputBase, inputClass, labelClass } from "@/components/ui/styles";

export type CustomerValues = {
  id: string | null;
  firstName: string;
  lastName: string;
  idDoc: string;
  phone: string;
  email: string;
  instagram: string;
  birthday: string;
  source: keyof typeof SOURCE_LABEL;
  notes: string;
  marketingOptIn: boolean;
  isWholesale: boolean;
};

export function CustomerForm({ initial }: { initial: CustomerValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const v = initial;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await saveCustomer({
        id: v.id,
        firstName: get("firstName"),
        lastName: get("lastName"),
        idDoc: get("idDoc"),
        phone: get("phone"),
        email: get("email"),
        instagram: get("instagram"),
        birthday: get("birthday"),
        source: get("source"),
        notes: get("notes"),
        marketingOptIn: f.get("marketingOptIn") === "on",
        isWholesale: f.get("isWholesale") === "on",
      });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      if (!v.id) router.push(`/admin/clientes/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className={cn(card, "grid gap-3 p-5 sm:grid-cols-2")}>
      <div>
        <label className={labelClass} htmlFor="firstName">Nombre</label>
        <input id="firstName" name="firstName" required defaultValue={v.firstName} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="lastName">Apellido</label>
        <input id="lastName" name="lastName" defaultValue={v.lastName} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="idDoc">Cédula o RIF</label>
        <input id="idDoc" name="idDoc" defaultValue={v.idDoc} placeholder="V-12345678" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="phone">WhatsApp</label>
        <input id="phone" name="phone" defaultValue={v.phone} placeholder="0414-1234567" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="instagram">Instagram</label>
        <input id="instagram" name="instagram" defaultValue={v.instagram} placeholder="@usuario" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" defaultValue={v.email} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="birthday">Cumpleaños</label>
        <input id="birthday" name="birthday" type="date" defaultValue={v.birthday} className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="source">¿Cómo nos conoció?</label>
        <select id="source" name="source" defaultValue={v.source} className={inputClass}>
          {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="notes">Notas internas (tallas, gustos, preferencias)</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={v.notes} placeholder="Talla S en blusas, 37 en calzado. Le encantan los colores pastel." className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="checkbox" name="marketingOptIn" defaultChecked={v.marketingOptIn} className="size-4" /> Acepta recibir novedades y promociones</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isWholesale" defaultChecked={v.isWholesale} className="size-4" /> Compra al mayor</label>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className={buttonPrimary}>{pending ? "Guardando…" : v.id ? "Guardar" : "Crear clienta"}</button>
        {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
        {saved && !error ? <p role="status" className="text-sm font-semibold text-ok">✓ Guardado</p> : null}
      </div>
    </form>
  );
}

export function InteractionForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [type, setType] = useState<keyof typeof INTERACTION>("WHATSAPP");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addInteraction({ customerId, type, body });
          if (!r.ok) return setError(r.error);
          setBody("");
          setError(null);
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-1">
        {(Object.keys(INTERACTION) as (keyof typeof INTERACTION)[]).map((k) => (
          <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", type === k ? "bg-ink text-white" : "bg-cream hover:bg-line")}>
            {INTERACTION[k].icon} {INTERACTION[k].label}
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Ej. Preguntó por el vestido lila en talla M; avisarle cuando llegue." aria-label="Detalle" className={inputClass} />
      {error ? <p role="alert" className="text-xs font-semibold text-danger">{error}</p> : null}
      <button disabled={pending || body.trim().length < 2} className={buttonSecondary}>Agregar al seguimiento</button>
    </form>
  );
}

export function TagPicker({ customerId, tags, active }: { customerId: string; tags: { id: string; name: string; color: string }[]; active: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#B0378F");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => {
        const on = active.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            disabled={pending}
            aria-pressed={on}
            onClick={() => start(async () => { await toggleCustomerTag(customerId, t.id, !on); router.refresh(); })}
            className={cn("rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold transition", on ? "text-white" : "bg-paper")}
            style={on ? { background: t.color, borderColor: t.color } : { borderColor: t.color, color: t.color }}
          >
            {on ? "✓ " : ""}{t.name}
          </button>
        );
      })}
      {adding ? (
        <span className="flex items-center gap-1">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" className="h-7 w-8 rounded border border-line" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva etiqueta" aria-label="Nombre de la etiqueta" className={cn(inputBase, "w-32 py-1")} />
          <button
            type="button"
            onClick={() => start(async () => {
              const r = await createTag(name, color);
              if (!r.ok) return setError(r.error);
              setAdding(false);
              setName("");
              router.refresh();
            })}
            className={buttonGhost}
          >
            Crear
          </button>
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </span>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={buttonGhost}>+ Etiqueta</button>
      )}
    </div>
  );
}
