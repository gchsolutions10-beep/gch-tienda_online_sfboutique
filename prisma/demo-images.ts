/**
 * Ilustraciones de EJEMPLO (SVG vertical 3:4) para la tienda de demostración.
 * Se reemplazan subiendo las fotos reales desde el panel.
 */
type Garment = "vestido" | "blusa" | "jean" | "zapato" | "bolso" | "franela" | "sandalia" | "bienestar";

const SHAPES: Record<Garment, string> = {
  vestido:
    '<path d="M250 150 l-40 30 l20 60 l-60 330 h260 l-60 -330 l20 -60 l-40 -30 q-50 40 -100 0z" fill="{c}"/><path d="M250 150 q50 40 100 0" stroke="#fff" stroke-opacity=".35" stroke-width="6" fill="none"/>',
  blusa:
    '<path d="M240 170 l-110 50 l30 110 l50 -20 v200 h180 v-200 l50 20 l30 -110 l-110 -50 q-60 50 -120 0z" fill="{c}"/><circle cx="300" cy="300" r="7" fill="#fff" fill-opacity=".6"/><circle cx="300" cy="350" r="7" fill="#fff" fill-opacity=".6"/>',
  jean:
    '<path d="M200 150 h200 l20 470 h-90 l-30 -330 l-30 330 h-90z" fill="{c}"/><path d="M200 190 h200" stroke="#fff" stroke-opacity=".4" stroke-width="5"/><path d="M300 190 v100" stroke="#fff" stroke-opacity=".3" stroke-width="4"/>',
  zapato:
    '<path d="M150 470 q0 -60 60 -70 l80 -120 q20 -30 40 0 l30 110 q100 20 120 80 v40 h-330z" fill="{c}"/><rect x="150" y="510" width="330" height="18" rx="9" fill="#000" fill-opacity=".25"/>',
  sandalia:
    '<path d="M160 500 h300 q20 0 20 20 v12 h-340 v-12 q0 -20 20 -20z" fill="{c}"/><path d="M220 500 q80 -140 160 0 M260 500 q40 -70 80 0" stroke="{c}" stroke-width="14" fill="none"/><path d="M420 500 v-150" stroke="{c}" stroke-width="14"/>',
  bolso:
    '<path d="M220 270 q80 -160 160 0" stroke="{c}" stroke-width="16" fill="none"/><rect x="170" y="270" width="260" height="260" rx="30" fill="{c}"/><rect x="270" y="330" width="60" height="30" rx="8" fill="#fff" fill-opacity=".5"/>',
  franela:
    '<path d="M235 170 l-115 45 l35 90 l55 -20 v265 h180 v-265 l55 20 l35 -90 l-115 -45 q-65 40 -130 0z" fill="{c}"/><path d="M235 170 q65 40 130 0" stroke="#fff" stroke-opacity=".35" stroke-width="6" fill="none"/>',
  bienestar:
    '<rect x="215" y="200" width="170" height="320" rx="40" fill="{c}"/><rect x="230" y="160" width="140" height="60" rx="14" fill="{c}" fill-opacity=".8"/><rect x="235" y="300" width="130" height="90" rx="12" fill="#fff" fill-opacity=".75"/>',
};

/** SVG 600×800 con fondo suave, la prenda y el nombre del negocio. */
export function demoSvg(garment: Garment, color: string, variant: 0 | 1 = 0): string {
  const bg = variant === 0 ? "#F4EEF6" : "#EADCF0";
  const shape = SHAPES[garment].replaceAll("{c}", color);
  // Segunda imagen (efecto hover): la prenda girada y más cerca, como "vista de espalda".
  const transform = variant === 1 ? 'transform="translate(300 400) scale(1.12) rotate(-6) translate(-300 -400)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <ellipse cx="300" cy="700" rx="190" ry="18" fill="#2A1035" fill-opacity=".08"/>
  <g ${transform}>${shape}</g>
  <text x="300" y="760" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#7B2F9E" fill-opacity=".55">SF Boutique · foto de ejemplo</text>
</svg>`;
}

export type { Garment };
