"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { createColor, createSize, saveProduct } from "@/server/actions/admin/products";
import { cellKey, margin } from "@/lib/variants";
import { formatUsd, parseAmount } from "@/lib/money";
import { buttonGhost, buttonPrimary, buttonSecondary, card, cn, inputBase, inputClass, labelClass } from "@/components/ui/styles";

type Size = { id: string; label: string; kind: string; sortOrder: number };
type Color = { id: string; name: string; hex: string };
export type ProductFormData = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  description: string;
  details: string;
  gender: "WOMEN" | "MEN" | "UNISEX" | "KIDS";
  price: string;
  compareAt: string;
  cost: string;
  ivaExempt: boolean;
  freeShipping: boolean;
  badge: string;
  tags: string;
  isActive: boolean;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
};
export type FormVariant = { sizeId: string | null; colorId: string | null; stock: number; reserved: number; sku: string };

const KIND_LABEL: Record<string, string> = { CLOTHING: "Ropa", SHOE: "Calzado", ONE_SIZE: "Única", OTHER: "Otras" };
const REASONS = [
  { value: "PURCHASE", label: "Entrada de mercancía (compra)" },
  { value: "ADJUSTMENT", label: "Ajuste por conteo físico" },
  { value: "DAMAGE", label: "Daño o pérdida" },
] as const;

export function ProductForm({
  product,
  variants,
  categories,
  sizes: initialSizes,
  colors: initialColors,
}: {
  product: ProductFormData | null;
  variants: FormVariant[];
  categories: { id: string; name: string }[];
  sizes: Size[];
  colors: Color[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sizes, setSizes] = useState(initialSizes);
  const [colors, setColors] = useState(initialColors);

  // Matriz: colores y tallas elegidos + stock de cada celda.
  const initial = useMemo(() => new Map(variants.map((v) => [cellKey(v.sizeId, v.colorId), v])), [variants]);
  const [colorIds, setColorIds] = useState<string[]>(() => [...new Set(variants.map((v) => v.colorId).filter((x): x is string => Boolean(x)))]);
  const [sizeIds, setSizeIds] = useState<string[]>(() => [...new Set(variants.map((v) => v.sizeId).filter((x): x is string => Boolean(x)))]);
  const [stock, setStock] = useState<Record<string, string>>(() => Object.fromEntries(variants.map((v) => [cellKey(v.sizeId, v.colorId), String(v.stock)])));
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>(product ? "ADJUSTMENT" : "PURCHASE");
  const [bulk, setBulk] = useState("");
  const [price, setPrice] = useState(product?.price ?? "");
  const [cost, setCost] = useState(product?.cost ?? "");

  const orderedSizes = sizes.filter((s) => sizeIds.includes(s.id)).sort((a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind.localeCompare(b.kind)));
  const orderedColors = colors.filter((c) => colorIds.includes(c.id));
  const rows: (Color | null)[] = orderedColors.length ? orderedColors : [null];
  const cols: (Size | null)[] = orderedSizes.length ? orderedSizes : [null];
  const hasMatrix = orderedColors.length > 0 || orderedSizes.length > 0;
  const cells = hasMatrix ? rows.flatMap((c) => cols.map((s) => ({ sizeId: s?.id ?? null, colorId: c?.id ?? null }))) : [];
  const value = (k: string) => stock[k] ?? "0";
  const changed = cells.some((c) => {
    const k = cellKey(c.sizeId, c.colorId);
    return Number(value(k)) !== (initial.get(k)?.stock ?? 0);
  });

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const priceCents = Math.round((parseAmount(price) ?? 0) * 100);
  const costCents = cost.trim() ? Math.round((parseAmount(cost) ?? 0) * 100) : null;
  const m = margin(priceCents, costCents);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    // Tallas o colores quitados que todavía tienen unidades: confirmar antes de sacarlos del stock.
    const kept = new Set(cells.map((c) => cellKey(c.sizeId, c.colorId)));
    const dropped = variants.filter((v) => !kept.has(cellKey(v.sizeId, v.colorId)) && v.stock > 0);
    const units = dropped.reduce((a, v) => a + v.stock, 0);
    if (units && !confirm(`Quitaste tallas o colores que todavía tienen ${units} ${units === 1 ? "unidad" : "unidades"} en stock. ¿Sacarlas del inventario?`)) return;
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await saveProduct({
        id: product?.id ?? null,
        name: get("name"),
        categoryId: get("categoryId"),
        description: get("description"),
        details: get("details"),
        gender: get("gender"),
        price,
        compareAt: get("compareAt"),
        cost,
        ivaExempt: f.get("ivaExempt") === "on",
        freeShipping: f.get("freeShipping") === "on",
        badge: get("badge"),
        tags: get("tags"),
        isActive: f.get("isActive") === "on",
        isFeatured: f.get("isFeatured") === "on",
        seoTitle: get("seoTitle"),
        seoDescription: get("seoDescription"),
        stockReason: reason,
        stockNote: get("stockNote"),
        cells: cells.map((c) => {
          const k = cellKey(c.sizeId, c.colorId);
          return { ...c, expectedStock: initial.get(k)?.stock ?? 0, stock: Math.max(0, Math.floor(Number(value(k)) || 0)) };
        }),
      });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      if (!product) router.push(`/admin/productos/${r.id}`);
      else router.refresh();
    });
  }

  const sizeGroups = [...new Set(sizes.map((s) => s.kind))].map((kind) => [kind, sizes.filter((s) => s.kind === kind)] as const);

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Datos */}
      <section className={cn(card, "grid gap-4 p-5 sm:grid-cols-2")}>
        <h2 className="text-lg font-bold sm:col-span-2">Datos</h2>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="name">Nombre</label>
          <input id="name" name="name" required defaultValue={product?.name} placeholder="Vestido midi satinado" className={inputClass} />
          {product ? <p className="mt-1 text-xs text-muted">Dirección: /producto/{product.slug}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="categoryId">Categoría</label>
          <select id="categoryId" name="categoryId" required defaultValue={product?.categoryId ?? ""} className={inputClass}>
            <option value="" disabled>Elige…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="gender">Para</label>
          <select id="gender" name="gender" defaultValue={product?.gender ?? "WOMEN"} className={inputClass}>
            <option value="WOMEN">Dama</option>
            <option value="MEN">Caballero</option>
            <option value="UNISEX">Unisex</option>
            <option value="KIDS">Niños</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="description">Descripción</label>
          <textarea id="description" name="description" rows={3} defaultValue={product?.description} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="details">Material, cuidados y medidas</label>
          <textarea id="details" name="details" rows={2} defaultValue={product?.details} placeholder="Satén 100 % poliéster. Lavar a mano. Largo 110 cm." className={inputClass} />
        </div>
      </section>

      {/* Precio */}
      <section className={cn(card, "grid gap-4 p-5 sm:grid-cols-3")}>
        <h2 className="text-lg font-bold sm:col-span-3">Precio (USD)</h2>
        <div>
          <label className={labelClass} htmlFor="price">Precio de venta</label>
          <input id="price" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25,00" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="compareAt">Precio «antes» (oferta)</label>
          <input id="compareAt" name="compareAt" inputMode="decimal" defaultValue={product?.compareAt} placeholder="Opcional" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="cost">Costo</label>
          <input id="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Opcional" className={inputClass} />
          {m !== null ? (
            <p className={cn("mt-1 text-xs font-semibold", m < 0.2 ? "text-danger" : "text-ok")}>
              Margen {Math.round(m * 100)} % · ganas {formatUsd(priceCents - costCents!)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:col-span-3">
          <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} className="size-4" /> Visible en la tienda</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured} className="size-4" /> Destacado en la portada</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="freeShipping" defaultChecked={product?.freeShipping} className="size-4" /> Envío gratis</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="ivaExempt" defaultChecked={product?.ivaExempt} className="size-4" /> Exento de IVA</label>
        </div>
        <div>
          <label className={labelClass} htmlFor="badge">Etiqueta (opcional)</label>
          <input id="badge" name="badge" defaultValue={product?.badge} placeholder="Más vendido" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="tags">Palabras para el buscador (separadas por coma)</label>
          <input id="tags" name="tags" defaultValue={product?.tags} placeholder="fiesta, satén, elegante" className={inputClass} />
        </div>
      </section>

      {/* Variantes */}
      <section className={cn(card, "space-y-4 p-5")}>
        <div>
          <h2 className="text-lg font-bold">Tallas, colores y stock</h2>
          <p className="text-sm text-muted">Elige las tallas y colores en que viene la prenda. Cada combinación tiene su propio stock y SKU.</p>
        </div>

        <div>
          <p className={labelClass}>Colores</p>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={colorIds.includes(c.id)}
                onClick={() => setColorIds((l) => toggle(l, c.id))}
                className={cn("flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm", colorIds.includes(c.id) ? "border-ink bg-ink text-white" : "border-line hover:border-ink/40")}
              >
                <span className="size-3.5 rounded-full border border-black/20" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
            <NewColor onCreated={(c) => { setColors((l) => [...l, c]); setColorIds((l) => [...l, c.id]); }} />
          </div>
        </div>

        <div className="space-y-2">
          <p className={labelClass}>Tallas</p>
          {sizeGroups.map(([kind, group]) => (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-xs font-semibold text-muted">{KIND_LABEL[kind] ?? kind}</span>
              {group.sort((a, b) => a.sortOrder - b.sortOrder).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sizeIds.includes(s.id)}
                  onClick={() => setSizeIds((l) => toggle(l, s.id))}
                  className={cn("min-w-10 rounded-lg border-2 px-2.5 py-1 text-sm font-semibold", sizeIds.includes(s.id) ? "border-ink bg-ink text-white" : "border-line hover:border-ink/40")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
          <NewSize onCreated={(s) => { setSizes((l) => [...l, s]); setSizeIds((l) => [...l, s.id]); }} />
        </div>

        {hasMatrix ? (
          <>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-xs text-muted">{orderedColors.length && orderedSizes.length ? "Color \\ Talla" : ""}</th>
                    {cols.map((s) => <th key={s?.id ?? "-"} className="px-1 py-1 text-center font-bold">{s?.label ?? "Stock"}</th>)}
                    <th className="px-2 py-1 text-xs text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const rowTotal = cols.reduce((a, s) => a + (Number(value(cellKey(s?.id ?? null, c?.id ?? null))) || 0), 0);
                    return (
                      <tr key={c?.id ?? "-"}>
                        <th className="whitespace-nowrap px-2 py-1 text-left font-semibold">
                          {c ? (
                            <span className="flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full border border-black/20" style={{ background: c.hex }} />
                              {c.name}
                            </span>
                          ) : "Stock"}
                        </th>
                        {cols.map((s) => {
                          const k = cellKey(s?.id ?? null, c?.id ?? null);
                          const init = initial.get(k);
                          const diff = (Number(value(k)) || 0) - (init?.stock ?? 0);
                          return (
                            <td key={k} className="px-1 py-1 text-center align-top">
                              <input
                                aria-label={`Stock ${c?.name ?? ""} ${s?.label ?? ""}`.trim()}
                                inputMode="numeric"
                                value={value(k)}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                                  setStock((m) => ({ ...m, [k]: v }));
                                }}
                                onFocus={(e) => e.target.select()}
                                className={cn(inputBase, "w-16 text-center", diff !== 0 && "border-brand bg-brand-soft", Number(value(k)) === 0 && "text-muted")}
                              />
                              <span className="block h-4 text-[10px] text-muted">
                                {diff !== 0 ? <b className={diff > 0 ? "text-ok" : "text-danger"}>{diff > 0 ? `+${diff}` : diff}</b> : init?.reserved ? `${init.reserved} apart.` : !init ? "nueva" : ""}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-center font-bold">{rowTotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className={labelClass} htmlFor="bulk">Poner en todas</label>
                <input id="bulk" value={bulk} onChange={(e) => setBulk(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cn(inputBase, "w-20")} />
              </div>
              <button
                type="button"
                disabled={!bulk}
                onClick={() => setStock((m) => ({ ...m, ...Object.fromEntries(cells.map((c) => [cellKey(c.sizeId, c.colorId), bulk])) }))}
                className={buttonSecondary}
              >
                Aplicar
              </button>
            </div>
            {changed && product ? (
              <div className="grid gap-3 rounded-xl bg-cream p-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="reason">¿Por qué cambia el stock?</label>
                  <select id="reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={inputClass}>
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="stockNote">Nota (opcional)</label>
                  <input id="stockNote" name="stockNote" placeholder="Ej. Pedido al proveedor de Valencia" className={inputClass} />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Elige al menos una talla (o «Única») o un color para cargar el stock.</p>
        )}
      </section>

      {/* SEO */}
      <details className={cn(card, "p-5")}>
        <summary className="cursor-pointer text-lg font-bold">Google (SEO)</summary>
        <div className="mt-4 grid gap-4">
          <div>
            <label className={labelClass} htmlFor="seoTitle">Título en Google</label>
            <input id="seoTitle" name="seoTitle" maxLength={70} defaultValue={product?.seoTitle} placeholder="Si lo dejas vacío, se usa el nombre" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="seoDescription">Descripción en Google</label>
            <textarea id="seoDescription" name="seoDescription" maxLength={170} rows={2} defaultValue={product?.seoDescription} className={inputClass} />
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <button disabled={pending || !hasMatrix} className={cn(buttonPrimary, "px-6 py-2.5")}>
          {pending ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}
        </button>
        {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
        {saved && !error ? <p role="status" className="text-sm font-semibold text-ok">✓ Guardado</p> : null}
      </div>
    </form>
  );
}

function NewColor({ onCreated }: { onCreated: (c: Color) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#C8A2C8");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonGhost}>+ Nuevo color</button>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="Tono" className="h-8 w-10 cursor-pointer rounded border border-line" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (Fucsia)" aria-label="Nombre del color" className={cn(inputBase, "w-32")} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createColor(name, hex);
            if (!r.ok) return setError(r.error);
            onCreated(r.color);
            setOpen(false);
            setName("");
            setError(null);
          })
        }
        className={buttonSecondary}
      >
        Agregar
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

function NewSize({ onCreated }: { onCreated: (s: Size) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"CLOTHING" | "SHOE" | "OTHER">("CLOTHING");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonGhost}>+ Nueva talla</button>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo de talla" className={cn(inputBase, "w-28")}>
        <option value="CLOTHING">Ropa</option>
        <option value="SHOE">Calzado</option>
        <option value="OTHER">Otra</option>
      </select>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="XXL, 42, 10…" aria-label="Talla" className={cn(inputBase, "w-24")} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createSize(label, kind);
            if (!r.ok) return setError(r.error);
            onCreated(r.size);
            setOpen(false);
            setLabel("");
            setError(null);
          })
        }
        className={buttonSecondary}
      >
        Agregar
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
