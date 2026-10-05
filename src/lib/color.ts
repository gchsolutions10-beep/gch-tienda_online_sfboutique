/**
 * Contraste de colores (WCAG 2.x) para la marca blanca: cada negocio elige su
 * color y de él se derivan los colores de texto que cumplen AA (4.5:1).
 */

type Rgb = [number, number, number];

const parse = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

export function luminance(hex: string) {
  const [r, g, b] = parse(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_TEXT = 4.5;
const WHITE = "#ffffff";
const INK = "#0f0f0f";
/** Fondo claro más oscuro del panel (cream): si cumple ahí, cumple en blanco. */
const LIGHT_BG = "#faf9f6";

/** Texto sobre el color de marca (botones): blanco si cumple, si no, casi negro. */
export function textOnColor(bg: string) {
  return contrastRatio(WHITE, bg) >= AA_TEXT ? WHITE : INK;
}

/** Mezcla en sRGB (aprox. del color-mix de CSS). */
export function mix(a: string, b: string, weightA: number) {
  const [x, y] = [parse(a), parse(b)];
  return toHex(x.map((c, i) => c * weightA + y[i] * (1 - weightA)) as Rgb);
}

/**
 * El color de marca oscurecido lo justo para usarlo como texto sobre fondo
 * claro, incluido el tinte suave de la marca (menú activo, etiquetas).
 */
export function brandTextOnLight(brand: string) {
  const rgb = parse(brand);
  // 18 % en vez del 14 % del CSS: margen por la diferencia entre oklab y sRGB.
  const backgrounds = [LIGHT_BG, mix(brand, LIGHT_BG, 0.18)];
  for (let k = 1; k > 0; k -= 0.02) {
    const candidate = toHex(rgb.map((c) => c * k) as Rgb);
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= AA_TEXT)) return candidate;
  }
  return INK;
}
