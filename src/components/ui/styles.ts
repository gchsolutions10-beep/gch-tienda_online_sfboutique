/** Clases compartidas del panel (tema claro). */
export const labelClass = "mb-1 block text-xs font-semibold text-muted";

/** Sin ancho: para campos de ancho fijo (precios). Combinar con `w-*`. */
export const inputBase =
  "rounded-lg border-[1.5px] border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:bg-cream";

export const inputClass = `${inputBase} w-full min-w-0`;

/** Botón sólido sin color: para variantes con su propio fondo y texto. */
export const buttonSolid =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60";

export const buttonPrimary = `${buttonSolid} bg-brand text-on-brand hover:brightness-110`;

export const buttonSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:opacity-60";

export const buttonGhost =
  "inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold text-muted transition hover:bg-cream hover:text-ink disabled:opacity-40";

export const card = "rounded-2xl border border-line bg-paper";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
