/**
 * Paleta de la tienda y de las pantallas del personal (caja, monitor, login).
 * El negocio elige 5 colores; de ellos se derivan los demás tonos y, sobre
 * todo, los colores de texto, que se ajustan solos para cumplir el contraste
 * AA (4.5:1). Así ninguna combinación deja algo ilegible.
 */
import { AA_TEXT, contrastRatio, luminance, mix, textOnColor } from "@/lib/color";

export type ThemeColors = {
  /** Fondo de la página */
  background: string;
  /** Tarjetas, secciones y ventanas */
  surface: string;
  /** Títulos y textos */
  text: string;
  /** Barra superior y pie de página (vacío = color principal) */
  bar: string | null;
  /** Etiquetas de los productos: "Nuevo", "Oferta"… (vacío = color principal) */
  accent: string | null;
};

export const DEFAULT_THEME: ThemeColors = {
  // SF Boutique: lavanda muy claro, tarjetas blancas, ciruela profundo y etiquetas rosa orquídea.
  background: "#F7F3FA",
  surface: "#FFFFFF",
  text: "#2A1035",
  bar: null,
  accent: "#B0378F",
};

/** Combinaciones listas para elegir con un toque. */
export const THEME_PRESETS: { id: string; name: string; colors: ThemeColors }[] = [
  { id: "lavanda", name: "Lavanda boutique", colors: DEFAULT_THEME },
  { id: "minimal", name: "Blanco minimal", colors: { background: "#FAFAFA", surface: "#FFFFFF", text: "#1A1A1A", bar: "#1A1A1A", accent: null } },
  { id: "nude", name: "Nude", colors: { background: "#F5EEE8", surface: "#FFFCF9", text: "#3B2A22", bar: null, accent: "#9C5B47" } },
  { id: "rosa", name: "Rosa palo", colors: { background: "#FBEFF3", surface: "#FFFFFF", text: "#3A1426", bar: null, accent: "#C2185B" } },
  { id: "negro", name: "Negro elegante", colors: { background: "#121014", surface: "#1D1A20", text: "#F4EEF6", bar: "#000000", accent: "#D9A6E8" } },
  { id: "oliva", name: "Oliva natural", colors: { background: "#F1F2EA", surface: "#FFFFFF", text: "#252A1A", bar: "#3E4A2C", accent: null } },
];

const HEX = /^#[0-9a-f]{6}$/i;
const valid = (v: string | null | undefined): v is string => typeof v === "string" && HEX.test(v);

/** Completa lo que falte o venga mal con los valores por defecto. */
export function resolveTheme(input: Partial<Record<keyof ThemeColors, string | null>> | null | undefined): ThemeColors {
  return {
    background: valid(input?.background) ? input.background : DEFAULT_THEME.background,
    surface: valid(input?.surface) ? input.surface : DEFAULT_THEME.surface,
    text: valid(input?.text) ? input.text : DEFAULT_THEME.text,
    // Ausente = el de por defecto; vacío o null = usar el color principal.
    bar: valid(input?.bar) ? input.bar : input?.bar === undefined ? DEFAULT_THEME.bar : null,
    accent: valid(input?.accent) ? input.accent : input?.accent === undefined ? DEFAULT_THEME.accent : null,
  };
}

export const isDarkColor = (hex: string) => luminance(hex) < 0.2;

/** Un color de texto que se lea (AA) sobre todos los fondos dados, lo más parecido posible al deseado. */
export function readableOn(desired: string, backgrounds: string[]): string {
  const ok = (c: string) => backgrounds.every((bg) => contrastRatio(c, bg) >= AA_TEXT);
  if (ok(desired)) return desired;
  // Acercarlo al blanco o al negro (según el fondo) hasta que se lea.
  const target = isDarkColor(backgrounds[0]) ? "#FFFFFF" : "#000000";
  for (let w = 0.95; w >= 0; w -= 0.05) {
    const c = mix(desired, target, w);
    if (ok(c)) return c;
  }
  return target;
}

/** Texto gris suave (descripciones) que sigue cumpliendo AA. */
function mutedText(text: string, backgrounds: string[]) {
  for (let w = 0.55; w <= 1; w += 0.05) {
    const c = mix(text, backgrounds[0], w);
    if (backgrounds.every((bg) => contrastRatio(c, bg) >= AA_TEXT)) return c;
  }
  return text;
}

/** ¿El texto elegido se tuvo que ajustar? (para avisarle al dueño) */
export function themeWarnings(theme: ThemeColors): string[] {
  const warnings: string[] = [];
  const min = Math.min(contrastRatio(theme.text, theme.background), contrastRatio(theme.text, theme.surface));
  if (min < AA_TEXT) warnings.push("El color del texto casi no se lee sobre el fondo: el sistema lo ajusta automáticamente.");
  if (Math.abs(luminance(theme.background) - luminance(theme.surface)) > 0.5) {
    warnings.push("El fondo y las tarjetas son muy distintos (uno claro y otro oscuro): puede verse raro.");
  }
  return warnings;
}

/**
 * Variables CSS de la paleta. Se aplican en la tienda, el login y las
 * pantallas del personal (el panel de administración mantiene su estilo).
 */
export function themeVars(brand: string, theme: ThemeColors): Record<string, string> {
  const bgs = [theme.surface, theme.background];
  const ink = readableOn(theme.text, bgs);
  const bar = theme.bar ?? brand;
  const accent = theme.accent ?? brand;
  const soft = mix(theme.surface, ink, 0.96);
  return {
    "--store-bg": theme.background,
    "--store-card": theme.surface,
    "--store-soft": soft,
    "--store-line": mix(theme.background, ink, 0.86),
    "--store-ink": ink,
    "--store-muted": mutedText(ink, [theme.surface, theme.background, soft]),
    "--on-store-ink": textOnColor(ink),
    "--bar": bar,
    "--on-bar": textOnColor(bar),
    "--accent": accent,
    "--on-accent": textOnColor(accent),
    // El color principal como texto (precios, enlaces) también debe leerse sobre ESTOS fondos.
    "--brand-fg": readableOn(brand, [theme.surface, theme.background, soft, mix(brand, theme.surface, 0.18)]),
  };
}

type TenantTheme = {
  primaryColor: string;
  themeBackground: string | null;
  themeSurface: string | null;
  themeText: string | null;
  themeBar: string | null;
  themeAccent: string | null;
};

export function tenantTheme(t: TenantTheme): ThemeColors {
  return resolveTheme({ background: t.themeBackground, surface: t.themeSurface, text: t.themeText, bar: t.themeBar, accent: t.themeAccent });
}

/** Estilo (variables CSS) para envolver la tienda, el login y las pantallas del personal. */
export function tenantThemeStyle(t: TenantTheme): Record<string, string> {
  const brand = HEX.test(t.primaryColor) ? t.primaryColor : "#7B2F9E";
  return themeVars(brand, tenantTheme(t));
}
