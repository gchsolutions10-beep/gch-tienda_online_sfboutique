"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { updateTheme } from "@/server/actions/admin/appearance";
import { DEFAULT_THEME, resolveTheme, THEME_PRESETS, themeVars, themeWarnings, type ThemeColors } from "@/lib/theme";
import { buttonPrimary, buttonSecondary, card, cn, inputBase, labelClass } from "@/components/ui/styles";

type Field = { key: keyof ThemeColors; label: string; hint: string; optional?: boolean };

const FIELDS: Field[] = [
  { key: "background", label: "Fondo", hint: "Detrás de todo" },
  { key: "surface", label: "Tarjetas y ventanas", hint: "Secciones del menú, cuenta, ventanas" },
  { key: "text", label: "Títulos y textos", hint: "Se ajusta solo si no se lee" },
  { key: "bar", label: "Barra superior y pie", hint: "Vacío = tu color principal", optional: true },
  { key: "accent", label: "Etiquetas", hint: "«Nuevo», «Oferta»… Vacío = color principal", optional: true },
];

/**
 * Paleta de la tienda y del login, con combinaciones listas y vista previa.
 * El texto siempre queda legible (contraste AA), también en temas oscuros.
 */
export function ThemeForm({ initial, brand, name }: { initial: ThemeColors; brand: string; name: string }) {
  const [theme, setTheme] = useState<ThemeColors>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<ThemeColors>) => {
    setMessage(null);
    setTheme((t) => ({ ...t, ...patch }));
  };
  // Mientras se escribe un código a medias, la vista previa usa el último válido de cada campo.
  const safe = resolveTheme(theme);
  const warnings = themeWarnings(safe);
  const vars = themeVars(brand, safe) as CSSProperties;

  const save = () =>
    startTransition(async () => {
      const r = await updateTheme({ ...theme, bar: theme.bar ?? "", accent: theme.accent ?? "" });
      setMessage(r.ok ? { ok: true, text: "✓ Colores guardados: ya se ven en la tienda" } : { ok: false, text: r.error });
    });

  return (
    <section className={cn(card, "space-y-5 p-5")} aria-labelledby="theme-title">
      <div>
        <h2 id="theme-title" className="font-display text-base font-bold">
          Colores de la tienda
        </h2>
        <p className="text-xs text-muted">
          Fondo, tarjetas, textos, barra y etiquetas. Se aplican a la tienda en línea y al acceso del personal.
        </p>
      </div>

      <div>
        <p className={labelClass}>Combinaciones listas</p>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => {
            const on = JSON.stringify(p.colors) === JSON.stringify(theme);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => set(p.colors)}
                aria-pressed={on}
                className={cn("flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-semibold", on ? "border-ink" : "border-line hover:border-ink/30")}
              >
                <span aria-hidden className="flex overflow-hidden rounded-full border border-line">
                  {[p.colors.background, p.colors.surface, p.colors.text, p.colors.bar ?? brand, p.colors.accent ?? brand].map((c, i) => (
                    <span key={i} className="size-5" style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          {FIELDS.map((f) => {
            const value = theme[f.key];
            const shown = (/^#[0-9A-F]{6}$/i.test(value ?? "") ? value : null) ?? (f.optional ? brand : DEFAULT_THEME[f.key]!);
            return (
              <div key={f.key} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3">
                <input
                  type="color"
                  value={shown.toLowerCase()}
                  onChange={(e) => set({ [f.key]: e.target.value.toUpperCase() } as Partial<ThemeColors>)}
                  aria-label={f.label}
                  className="h-11 w-11 cursor-pointer rounded-lg border border-line bg-paper p-1"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{f.label}</span>
                    <input
                      value={value ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        set({ [f.key]: v === "" && f.optional ? null : v.toUpperCase() } as Partial<ThemeColors>);
                      }}
                      placeholder={f.optional ? "Color principal" : "#RRGGBB"}
                      aria-label={`${f.label} (código)`}
                      maxLength={7}
                      className={cn(inputBase, "w-28 py-1 font-mono text-xs uppercase")}
                    />
                    {f.optional && value ? (
                      <button type="button" className="text-xs font-semibold text-muted hover:text-ink" onClick={() => set({ [f.key]: null } as Partial<ThemeColors>)}>
                        Usar color principal
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">{f.hint}</p>
                </div>
              </div>
            );
          })}
          {warnings.map((w) => (
            <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ⚠️ {w}
            </p>
          ))}
        </div>

        {/* Vista previa con los colores calculados (los mismos que verá el cliente). */}
        <div aria-label="Vista previa" style={vars} className="overflow-hidden rounded-2xl border border-line bg-store p-3 text-store-ink">
          <div className="flex items-center gap-2 rounded-full bg-bar px-3 py-1.5 text-on-bar">
            <span className="grid size-7 place-items-center rounded-full bg-black/10 font-display text-xs font-semibold">{name.charAt(0)}</span>
            <span className="font-display text-sm font-semibold">{name}</span>
            <span className="ml-auto rounded-full bg-store-ink px-3 py-1 font-display text-[11px] font-bold text-on-store-ink">Mi pedido</span>
          </div>
          <div className="mt-3 rounded-[1.25rem] bg-store-card p-3 shadow-sm">
            <p className="flex items-center gap-2 font-display text-sm font-semibold uppercase">
              <span aria-hidden className="h-5 w-1.5 rounded-full bg-brand" />
              Vestidos
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ["Vestido midi", "$38,00", "Nuevo"],
                ["Blusa de seda", "$24,00", null],
              ].map(([n, price, badge]) => (
                <div key={n} className="relative rounded-2xl bg-store-soft p-2 text-center">
                  {badge ? (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 font-display text-[9px] font-bold uppercase text-on-accent">{badge}</span>
                  ) : null}
                  <span aria-hidden className="mx-auto mt-3 grid h-14 w-10 place-items-center rounded-lg bg-brand-soft text-lg">👗</span>
                  <p className="mt-1 font-display text-xs font-bold">{n}</p>
                  <p className="text-[10px] text-store-muted">Satén · S a XL</p>
                  <p className="font-display text-xs font-semibold text-brand-strong">{price}</p>
                  <span className="mt-1 block rounded-full bg-brand py-1 font-display text-[10px] font-bold text-on-brand">Agregar</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-full bg-bar px-3 py-2 text-center text-[10px] font-semibold text-on-bar">Pie de página · Contacto · Políticas</div>
        </div>
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={cn("text-sm font-semibold", message.ok ? "text-ok" : "text-danger")}>
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={() => set(DEFAULT_THEME)}>
          Volver a los colores originales
        </button>
        <button type="button" className={buttonPrimary} onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar colores"}
        </button>
      </div>
    </section>
  );
}
